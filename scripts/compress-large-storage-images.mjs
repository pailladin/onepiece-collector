import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const PAGE_SIZE = 100
const DEFAULT_BUCKET = 'cards-images'
const DEFAULT_MIN_BYTES = 700 * 1024
const DEFAULT_MAX_WIDTH = 900
const DEFAULT_JPEG_QUALITY = 72
const DEFAULT_WEBP_QUALITY = 72

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
    bucket: DEFAULT_BUCKET,
    confirm: false,
    minBytes: DEFAULT_MIN_BYTES,
    maxWidth: DEFAULT_MAX_WIDTH,
    jpegQuality: DEFAULT_JPEG_QUALITY,
    webpQuality: DEFAULT_WEBP_QUALITY,
    roots: []
  }

  for (const arg of argv) {
    if (arg === '--confirm') {
      options.confirm = true
      continue
    }
    if (arg.startsWith('--bucket=')) {
      options.bucket = arg.slice('--bucket='.length).trim() || DEFAULT_BUCKET
      continue
    }
    if (arg.startsWith('--min-bytes=')) {
      options.minBytes = Number(arg.slice('--min-bytes='.length)) || DEFAULT_MIN_BYTES
      continue
    }
    if (arg.startsWith('--max-width=')) {
      options.maxWidth = Number(arg.slice('--max-width='.length)) || DEFAULT_MAX_WIDTH
      continue
    }
    if (arg.startsWith('--jpeg-quality=')) {
      options.jpegQuality = Number(arg.slice('--jpeg-quality='.length)) || DEFAULT_JPEG_QUALITY
      continue
    }
    if (arg.startsWith('--webp-quality=')) {
      options.webpQuality = Number(arg.slice('--webp-quality='.length)) || DEFAULT_WEBP_QUALITY
      continue
    }
    if (arg.startsWith('--roots=')) {
      options.roots = arg
        .slice('--roots='.length)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      continue
    }
  }

  return options
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%'
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`
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
      throw new Error(`Lecture du bucket impossible (${currentPath || '/'}) : ${error.message}`)
    }

    const batch = Array.isArray(data) ? data : []
    for (const entry of batch) {
      const name = String(entry?.name || '').trim()
      if (!name) continue
      const fullPath = currentPath ? `${currentPath}/${name}` : name
      if (entry?.id) {
        files.push({
          name: fullPath,
          metadata: entry.metadata || {}
        })
      } else {
        files.push(...(await listAllFiles(supabase, bucket, fullPath)))
      }
    }

    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return files
}

function shouldKeepPath(pathname, roots) {
  if (pathname.startsWith('sets/')) return false
  if (roots.length === 0) return true
  return roots.some((root) => pathname === root || pathname.startsWith(`${root}/`))
}

async function recompressBuffer(buffer, filePath, options) {
  const image = sharp(buffer, { failOn: 'none' })
  const metadata = await image.metadata()
  const format = String(metadata.format || '').toLowerCase()

  let pipeline = image.rotate()
  if (metadata.width && metadata.width > options.maxWidth) {
    pipeline = pipeline.resize({ width: options.maxWidth, withoutEnlargement: true })
  }

  if (format === 'jpeg' || format === 'jpg') {
    return {
      output: await pipeline.jpeg({
        quality: options.jpegQuality,
        mozjpeg: true,
        progressive: true
      }).toBuffer(),
      format
    }
  }

  if (format === 'png') {
    return {
      output: await pipeline.png({
        compressionLevel: 9,
        palette: true,
        quality: 80
      }).toBuffer(),
      format
    }
  }

  if (format === 'webp') {
    return {
      output: await pipeline.webp({
        quality: options.webpQuality
      }).toBuffer(),
      format
    }
  }

  return {
    output: null,
    format
  }
}

function contentTypeFromPath(filePath) {
  const normalized = filePath.toLowerCase()
  if (normalized.endsWith('.png')) return 'image/png'
  if (normalized.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
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

  const allFiles = await listAllFiles(supabase, options.bucket)
  const candidates = allFiles
    .map((file) => {
      const size = Number(file?.metadata?.size || 0)
      return {
        name: String(file.name || ''),
        size: Number.isFinite(size) ? size : 0
      }
    })
    .filter((file) => file.name && shouldKeepPath(file.name, options.roots))
    .filter((file) => file.size >= options.minBytes)
    .sort((a, b) => b.size - a.size || a.name.localeCompare(b.name))

  console.log(`Bucket: ${options.bucket}`)
  console.log(`Seuil minimal: ${formatBytes(options.minBytes)}`)
  console.log(`Largeur max cible: ${options.maxWidth}px`)
  console.log(`Fichiers candidats: ${candidates.length}`)
  console.log('')

  if (candidates.length === 0) {
    console.log('Aucun fichier a recomprimer.')
    return
  }

  let processed = 0
  let improved = 0
  let savedBytes = 0
  const sample = []
  const totalCandidates = candidates.length

  for (const file of candidates) {
    processed += 1
    console.log(
      `[${processed}/${totalCandidates}] analyse ${file.name} (${formatBytes(file.size)})`
    )

    const { data, error } = await supabase.storage.from(options.bucket).download(file.name)
    if (error || !data) {
      console.log(`  lecture impossible: ${error?.message || 'erreur inconnue'}`)
      continue
    }

    const originalBuffer = Buffer.from(await data.arrayBuffer())
    const { output, format } = await recompressBuffer(originalBuffer, file.name, options)
    if (!output) {
      console.log(`  format ignore: ${format || 'inconnu'}`)
      continue
    }

    const gain = originalBuffer.length - output.length
    if (gain <= 0) {
      console.log('  aucun gain utile, fichier conserve tel quel')
      if (processed % 10 === 0 || processed === totalCandidates) {
        console.log(
          `  progression: ${processed}/${totalCandidates}, ${improved} fichier(s) optimises, ${formatBytes(savedBytes)} economises`
        )
      }
      continue
    }

    improved += 1
    savedBytes += gain
    console.log(
      `  gain: ${formatBytes(originalBuffer.length)} -> ${formatBytes(output.length)} (${formatBytes(gain)} gagnes, ${formatPercent((gain / originalBuffer.length) * 100)})`
    )

    if (sample.length < 25) {
      sample.push({
        name: file.name,
        before: originalBuffer.length,
        after: output.length
      })
    }

    if (!options.confirm) continue

    const { error: uploadError } = await supabase.storage.from(options.bucket).upload(file.name, output, {
      upsert: true,
      contentType: contentTypeFromPath(file.name),
      cacheControl: '3600'
    })

    if (uploadError) {
      console.log(`  echec upload: ${uploadError.message}`)
      improved -= 1
      savedBytes -= gain
    } else {
      console.log('  fichier remplace sur Supabase')
    }

    if (processed % 10 === 0 || processed === totalCandidates) {
      console.log(
        `  progression: ${processed}/${totalCandidates}, ${improved} fichier(s) optimises, ${formatBytes(savedBytes)} economises`
      )
    }
  }

  console.log(`Fichiers analyses: ${processed}`)
  console.log(`Fichiers ameliores: ${improved}`)
  console.log(`Gain potentiel${options.confirm ? '' : ' estime'}: ${formatBytes(savedBytes)}`)
  console.log('')
  console.log('Exemples:')
  for (const item of sample) {
    console.log(
      `- ${item.name} : ${formatBytes(item.before)} -> ${formatBytes(item.after)}`
    )
  }

  if (!options.confirm) {
    console.log('')
    console.log('Mode simulation: aucune image n a ete modifiee.')
    console.log('Relance avec --confirm pour ecraser les fichiers avec la version compressee.')
  } else {
    console.log('')
    console.log('Recompression terminee.')
  }
}

main().catch((error) => {
  console.error(`Erreur: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
