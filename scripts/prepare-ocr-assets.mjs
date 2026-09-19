import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const target = new URL('../public/ocr/', import.meta.url)
await mkdir(target, { recursive: true })
const tesseract = dirname(require.resolve('tesseract.js/package.json'))
const core = dirname(require.resolve('tesseract.js-core/package.json'))
const language = dirname(require.resolve('@tesseract.js-data/eng/package.json'))
await copyFile(join(tesseract, 'dist/worker.min.js'), new URL('worker.min.js', target))
await copyFile(join(tesseract, 'LICENSE.md'), new URL('LICENSE-tesseract.txt', target))
// Keep all device-specific builds so older phones can use the non-SIMD fallback.
for (const file of await readdir(core)) {
  if (file.endsWith('.wasm.js') || file.endsWith('.wasm')) {
    await copyFile(join(core, file), new URL(file, target))
  }
}
await copyFile(join(language, '4.0.0_best_int/eng.traineddata.gz'), new URL('eng.traineddata.gz', target))
await copyFile(join(core, 'LICENSE'), new URL('LICENSE-tesseract-core.txt', target))
console.log('OCR assets ready in public/ocr (local browser processing).')
