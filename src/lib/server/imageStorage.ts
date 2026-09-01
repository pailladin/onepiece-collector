import {
  CopyObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'

const bucket = process.env.R2_BUCKET || 'cards-images'

let client: S3Client | null = null

function getClient() {
  if (client) return client

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('Configuration R2 incomplete')
  }

  client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  })

  return client
}

export async function putCardImage(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key.replace(/^\//, ''),
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable'
    })
  )
}

export async function copyCardImage(sourceKey: string, targetKey: string) {
  const normalizedSource = sourceKey.replace(/^\//, '')
  const copySource = encodeURIComponent(`${bucket}/${normalizedSource}`).replace(/%2F/g, '/')
  await getClient().send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: copySource,
      Key: targetKey.replace(/^\//, ''),
      MetadataDirective: 'COPY'
    })
  )
}
