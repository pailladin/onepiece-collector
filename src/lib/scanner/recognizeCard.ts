import type { Worker } from 'tesseract.js'
import { extractCardCodes } from './cardCode'

export async function recognizeCard(
  file: File,
  signal: AbortSignal,
  onProgress: (message: string) => void
): Promise<string[]> {
  if (!file.type.startsWith('image/')) throw new Error('Choisis une photo de carte.')
  if (file.size > 20 * 1024 * 1024) throw new Error('Cette photo dépasse 20 Mo. Choisis une image plus petite.')
  signal.throwIfAborted()
  let worker: Worker | undefined
  let finished = false
  const photoUrl = URL.createObjectURL(file)
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: () => void = () => {}
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => reject(new DOMException('Scan annulé', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => reject(new Error('La lecture prend trop de temps. Réessaie avec une photo recadrée sur le numéro, ou saisis-le.')), 90_000)
  })
  let rejectWorker: (reason: Error) => void = () => {}
  const workerError = new Promise<never>((_, reject) => { rejectWorker = reject })
  const run = async () => {
    onProgress('Préparation de la photo…')
    const photo = new Image()
    photo.src = photoUrl
    try { await photo.decode() } catch {
      throw new Error('Photo illisible. Essaie une image JPEG, PNG ou WebP, ou reprends une photo.')
    }
    if (finished) return []
    const canvas = document.createElement('canvas')
    const scale = Math.min(2, 1800 / Math.max(photo.naturalWidth, photo.naturalHeight))
    canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Ce navigateur ne permet pas la lecture des photos. Saisis le numéro ci-dessous.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(photo, 0, 0, canvas.width, canvas.height)
    onProgress('Chargement du lecteur sur ton appareil…')
    const { createWorker, OEM, PSM } = await import('tesseract.js')
    if (finished) return []
    const created = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr', workerBlobURL: false,
      logger: ({ status, progress }) => {
        if (!finished && status === 'recognizing text') onProgress(`Lecture du numéro : ${Math.round(progress * 100)} %`)
      },
      errorHandler: () => rejectWorker(new Error('Le lecteur n’a pas pu démarrer. Vérifie ta connexion ou saisis le numéro.'))
    })
    worker = created
    if (finished) { await created.terminate(); return [] }
    await created.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    // Numbers are usually printed near the bottom. Retry the full photo for cropped images.
    const top = Math.floor(canvas.height * 0.55)
    const footer = await created.recognize(canvas, { rectangle: { left: 0, top, width: canvas.width, height: canvas.height - top } })
    const codes = extractCardCodes(footer.data.text)
    if (codes.length || finished) return codes
    onProgress('Recherche du numéro sur toute la photo…')
    const full = await created.recognize(canvas)
    return extractCardCodes(full.data.text)
  }
  try {
    return await Promise.race([run(), interrupted, workerError])
  } finally {
    finished = true
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    URL.revokeObjectURL(photoUrl)
    await worker?.terminate()
  }
}
