import fs from 'node:fs'
import path from 'node:path'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

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
        files.push({ name: fullPath, size: Number(entry?.metadata?.size) || null })
      } else {
        files.push(...(await listAllFiles(supabase, bucket, fullPath)))
      }
    }

    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return files
}

async function listR2Inventory() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET || 'cards-images'
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Le listing Supabase public est vide et les variables R2 sont incomplètes')
  }

  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  })
  const files = []
  let continuationToken
  do {
    const response = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken
      })
    )
    for (const object of response.Contents || []) {
      if (object.Key) files.push({ name: object.Key, size: object.Size || null })
    }
    continuationToken = response.NextContinuationToken
  } while (continuationToken)
  return files
}

async function downloadWithRetry(supabaseUrl, bucket, fileName, attempts = 4) {
  let lastError = null
  const encodedPath = fileName.split('/').map(encodeURIComponent).join('/')
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(publicUrl, { cache: 'no-store' })
      if (response.ok) return Buffer.from(await response.arrayBuffer())
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500))
    }
  }
  const detail = lastError instanceof Error
    ? lastError.message
    : JSON.stringify(lastError || {})
  throw new Error(`${fileName}: ${detail}`)
}

function formatBytes(bytes) {
  const units = ['o', 'Ko', 'Mo', 'Go']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

async function main() {
  loadEnvFile(path.resolve('.env.local'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !publishableKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont requis')
  }

  const bucket = process.env.SUPABASE_IMAGES_BUCKET || 'cards-images'
  const date = new Date().toISOString().slice(0, 10)
  const backupRoot = path.resolve('local-backups')
  const targetArg = process.argv.find((arg) => arg.startsWith('--target='))
  const targetName = targetArg?.slice('--target='.length) || `cards-images-${date}`
  const targetRoot = path.resolve(backupRoot, targetName)
  if (targetRoot !== backupRoot && !targetRoot.startsWith(`${backupRoot}${path.sep}`)) {
    throw new Error('Le dossier cible doit rester dans local-backups')
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  let files = await listAllFiles(supabase, bucket)
  if (files.length === 0) {
    console.log('Listing public Supabase indisponible; utilisation de l’inventaire R2.')
    console.log('Le contenu des fichiers sera téléchargé exclusivement depuis Supabase.')
    files = await listR2Inventory()
  }
  const expectedBytes = files.reduce((sum, file) => sum + (file.size || 0), 0)
  console.log(`${files.length} fichier(s) Supabase, ${formatBytes(expectedBytes)} annoncés.`)
  console.log(`Sauvegarde: ${targetRoot}`)

  await fs.promises.mkdir(targetRoot, { recursive: true })

  const concurrency = 10
  const failures = []
  let nextIndex = 0
  let completed = 0
  let downloadedBytes = 0
  let skipped = 0

  async function worker() {
    while (nextIndex < files.length) {
      const file = files[nextIndex]
      nextIndex += 1
      const outputPath = path.resolve(targetRoot, ...file.name.split('/'))
      if (!outputPath.startsWith(`${targetRoot}${path.sep}`)) {
        failures.push(`${file.name}: chemin invalide`)
        continue
      }

      try {
        const current = await fs.promises.stat(outputPath).catch(() => null)
        if (current?.isFile() && file.size && current.size === file.size) {
          skipped += 1
          downloadedBytes += current.size
        } else {
          const buffer = await downloadWithRetry(supabaseUrl, bucket, file.name)
          await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
          await fs.promises.writeFile(outputPath, buffer)
          downloadedBytes += buffer.length
        }
      } catch (error) {
        failures.push(`${file.name}: ${error instanceof Error ? error.message : 'erreur inconnue'}`)
      }

      completed += 1
      if (completed % 100 === 0 || completed === files.length) {
        console.log(`${completed}/${files.length} traité(s)`)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  if (failures.length > 0) {
    console.error(`${failures.length} échec(s):`)
    console.error(failures.slice(0, 20).join('\n'))
    process.exitCode = 1
    return
  }

  console.log(
    `Sauvegarde terminée: ${files.length} fichier(s), ${formatBytes(downloadedBytes)}, ${skipped} déjà présent(s).`
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
