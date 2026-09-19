import type { Worker } from 'tesseract.js'
import { extractCardCodes } from './cardCode'
import { DEFAULT_NUMBER_REGION, prepareRegion, type ImageRegion } from './imageRegion'

export async function recognizeCard(
  file: File,
  signal: AbortSignal,
  onProgress: (message: string) => void,
  region?: ImageRegion
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
    const full = { x: 0, y: 0, width: 1, height: 1 }
    const footer = { x: 0, y: 0.75, width: 1, height: 0.25 }
    const passes = region ? [
      { region, contrast: false, invert: false },
      { region, contrast: true, invert: false },
      { region, contrast: true, invert: true }
    ] : [
      { region: DEFAULT_NUMBER_REGION, contrast: false, invert: false },
      { region: footer, contrast: false, invert: false },
      { region: DEFAULT_NUMBER_REGION, contrast: true, invert: true },
      { region: footer, contrast: true, invert: false },
      { region: full, contrast: false, invert: false }
    ]
    for (const [index, pass] of passes.entries()) {
      if (finished) return []
      onProgress(`Lecture de la zone du numéro (${index + 1}/${passes.length})…`)
      const canvas = prepareRegion(photo, pass.region, pass.contrast, pass.invert)
      // A user-selected, very narrow strip is better treated as a line of text.
      await created.setParameters({ tessedit_pageseg_mode: region && canvas.width / canvas.height > 4 ? PSM.SINGLE_LINE : PSM.SPARSE_TEXT })
      if (finished) return []
      const result = await created.recognize(canvas)
      canvas.width = canvas.height = 1
      const codes = extractCardCodes(result.data.text)
      if (codes.length) return codes
    }
    return []
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
