import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const PAGE_SIZE = 1000

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

async function listAllFiles(supabase, bucket, currentPath = '') {
  const files = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(currentPath, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' }
    })
    if (error) {
      throw new Error(`Lecture Supabase impossible (${currentPath || '/'}): ${error.message}`)
    }

    const batch = Array.isArray(data) ? data : []
    for (const entry of batch) {
      const name = String(entry?.name || '').trim()
      if (!name) continue
      const fullPath = currentPath ? `${currentPath}/${name}` : name
      if (entry?.id || entry?.metadata) {
        files.push({ name: fullPath, metadata: entry.metadata || {} })
      } else {
        files.push(...(await listAllFiles(supabase, bucket, fullPath)))
      }
    }

    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return files
}

async function downloadWithRetry(supabase, bucket, fileName, attempts = 3) {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { data, error } = await supabase.storage.from(bucket).download(fileName)
    if (!error && data) return data
    lastError = error
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500))
    }
  }

  const detail = lastError instanceof Error
    ? lastError.message
    : JSON.stringify(lastError || {})
  throw new Error(`Téléchargement impossible (${fileName}): ${detail}`)
}

async function listAllR2Keys(r2, bucket, prefix) {
  const keys = []
  let continuationToken

  do {
    const response = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || undefined,
        ContinuationToken: continuationToken
      })
    )
    for (const object of response.Contents || []) {
      if (object.Key) keys.push(object.Key)
    }
    continuationToken = response.NextContinuationToken
  } while (continuationToken)

  return keys
}

async function main() {
  loadEnvFile(path.resolve('.env.local'))

  const execute = process.argv.includes('--execute')
  const verify = process.argv.includes('--verify')
  const prefixArg = process.argv.find((arg) => arg.startsWith('--prefix='))
  const prefix = (prefixArg?.slice('--prefix='.length) || '').replace(/^\/+|\/+$/g, '')
  const sourceBucket = process.env.SUPABASE_IMAGES_BUCKET || 'cards-images'
  const targetBucket = process.env.R2_BUCKET || 'cards-images'

  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY'
  ]
  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Variables manquantes: ${missing.join(', ')}`)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  })

  const allFiles = await listAllFiles(supabase, sourceBucket, prefix)
  console.log(`${allFiles.length} fichier(s) trouvé(s) dans Supabase.`)

  if (!execute && !verify) {
    console.log('Simulation uniquement. Relancez avec --execute pour copier vers R2.')
    return
  }

  if (verify) {
    const r2Keys = new Set(await listAllR2Keys(r2, targetBucket, prefix))
    const missingKeys = allFiles
      .map((file) => file.name)
      .filter((fileName) => !r2Keys.has(fileName))

    console.log(`${r2Keys.size} fichier(s) trouvé(s) dans R2.`)
    if (missingKeys.length > 0) {
      console.error(`${missingKeys.length} fichier(s) manquant(s) dans R2:`)
      console.error(missingKeys.slice(0, 20).join('\n'))
      process.exitCode = 1
      return
    }

    console.log('Vérification réussie: tous les chemins Supabase existent dans R2.')
    if (!execute) return
  }

  const concurrency = Math.max(
    1,
    Math.min(25, Number(process.env.R2_MIGRATION_CONCURRENCY) || 10)
  )
  let copied = 0
  let nextIndex = 0

  async function migrateFile(file) {
    const data = await downloadWithRetry(supabase, sourceBucket, file.name)

    await r2.send(
      new PutObjectCommand({
        Bucket: targetBucket,
        Key: file.name,
        Body: Buffer.from(await data.arrayBuffer()),
        ContentType: data.type || file.metadata?.mimetype || 'application/octet-stream',
        CacheControl: 'public, max-age=31536000, immutable'
      })
    )

    copied += 1
    if (copied % 100 === 0 || copied === allFiles.length) {
      console.log(`${copied}/${allFiles.length} fichier(s) copié(s)`)
    }
  }

  async function worker() {
    while (nextIndex < allFiles.length) {
      const file = allFiles[nextIndex]
      nextIndex += 1
      await migrateFile(file)
    }
  }

  console.log(`Copie avec ${concurrency} transfert(s) simultané(s).`)
  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  console.log('Migration terminée. Aucun fichier Supabase n’a été supprimé.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
