import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const PAGE_SIZE = 1000
const DEFAULT_BUCKET = 'cards-images'
const MISSING_IMAGE_PATH = '__missing__'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue
    const key = trimmed.slice(0, separatorIndex).trim()
    if (!key || process.env[key]) continue
    let value = trimmed.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function parseArgs(argv) {
  const options = {
    confirm: false,
    bucket: DEFAULT_BUCKET
  }

  for (const arg of argv) {
    if (arg === '--confirm') {
      options.confirm = true
      continue
    }

    if (arg.startsWith('--bucket=')) {
      options.bucket = arg.slice('--bucket='.length).trim() || DEFAULT_BUCKET
    }
  }

  return options
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

async function fetchAllRows(queryFactory) {
  const rows = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const query = queryFactory(from, to)
    const { data, error } = await query
    if (error) throw new Error(error.message)

    const batch = Array.isArray(data) ? data : []
    rows.push(...batch)

    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function fetchAllStorageObjects({ supabase, bucketId }) {
  const files = []
  const queue = ['']

  while (queue.length > 0) {
    const currentPath = queue.shift() || ''
    let offset = 0

    while (true) {
      const { data, error } = await supabase.storage.from(bucketId).list(currentPath, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      })

      if (error) {
        throw new Error(`Lecture du bucket impossible (${currentPath || '/'}) : ${error.message}`)
      }

      const batch = Array.isArray(data) ? data : []
      for (const entry of batch) {
        const entryName = String(entry?.name || '').trim()
        if (!entryName) continue

        const fullPath = currentPath ? `${currentPath}/${entryName}` : entryName
        const metadata =
          entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : null

        if (!metadata) {
          queue.push(fullPath)
          continue
        }

        files.push({
          name: fullPath,
          metadata
        })
      }

      if (batch.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }
  }

  return files
}

function chunkArray(items, chunkSize) {
  const chunks = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}

async function main() {
  loadEnvFile(path.resolve('.env.local'))

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Variables Supabase manquantes dans .env.local')
  }

  const options = parseArgs(process.argv.slice(2))
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const [sets, cardPrints, storageObjects] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from('sets').select('id, code').range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase
        .from('card_prints')
        .select('distribution_set_id, image_path')
        .not('image_path', 'is', null)
        .range(from, to)
    ),
    fetchAllStorageObjects({
      supabase,
      bucketId: options.bucket
    })
  ])

  const setCodeById = new Map(
    sets
      .filter((row) => row?.id && row?.code)
      .map((row) => [String(row.id), String(row.code)])
  )

  const usedPaths = new Set()
  for (const row of cardPrints) {
    const imagePath = String(row?.image_path || '').trim()
    if (!imagePath || imagePath === MISSING_IMAGE_PATH) continue
    const setCode = setCodeById.get(String(row?.distribution_set_id || ''))
    if (!setCode) continue
    usedPaths.add(`${setCode}/${imagePath}`)
  }

  const unusedFiles = storageObjects
    .map((row) => {
      const name = String(row?.name || '').trim()
      const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}
      const size = Number(metadata.size || 0)
      return { name, size: Number.isFinite(size) ? size : 0 }
    })
    .filter((row) => row.name && !row.name.startsWith('sets/') && !usedPaths.has(row.name))
    .sort((a, b) => b.size - a.size || a.name.localeCompare(b.name))

  const totalBytes = unusedFiles.reduce((sum, file) => sum + file.size, 0)
  const byRoot = new Map()
  for (const file of unusedFiles) {
    const root = file.name.split('/')[0] || '(racine)'
    const current = byRoot.get(root) || { count: 0, bytes: 0 }
    current.count += 1
    current.bytes += file.size
    byRoot.set(root, current)
  }

  console.log(`Bucket: ${options.bucket}`)
  console.log(`Fichiers inutilises: ${unusedFiles.length}`)
  console.log(`Espace recuperable: ${formatBytes(totalBytes)}`)
  console.log('')
  console.log('Top dossiers:')
  for (const [root, stats] of [...byRoot.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 15)) {
    console.log(`- ${root}: ${stats.count} fichier(s), ${formatBytes(stats.bytes)}`)
  }

  console.log('')
  console.log('Top fichiers:')
  for (const file of unusedFiles.slice(0, 30)) {
    console.log(`- ${file.name} (${formatBytes(file.size)})`)
  }

  if (!options.confirm) {
    console.log('')
    console.log('Mode simulation: aucune suppression effectuee.')
    console.log('Relance avec --confirm pour supprimer ces fichiers via l API Storage.')
    return
  }

  const chunks = chunkArray(
    unusedFiles.map((file) => file.name),
    PAGE_SIZE
  )

  let deletedCount = 0
  for (const chunk of chunks) {
    const { data, error } = await supabase.storage.from(options.bucket).remove(chunk)
    if (error) throw new Error(error.message)
    deletedCount += Array.isArray(data) ? data.length : chunk.length
  }

  console.log('')
  console.log(`Suppression terminee: ${deletedCount} fichier(s) supprime(s).`)
}

main().catch((error) => {
  console.error(`Erreur: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
