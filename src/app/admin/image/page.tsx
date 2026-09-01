'use client'

import { useState } from 'react'
import type { ChangeEvent } from 'react'

export default function UploadImagesPage() {
  const [message, setMessage] = useState('')

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch('/api/admin/images/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        console.error(result)
        setMessage('Erreur pendant upload.')
        return
      }
    }

    setMessage('Upload terminé.')
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Upload images</h1>
      <input type="file" multiple onChange={handleUpload} />
      <p style={{ marginTop: 20 }}>{message}</p>
    </div>
  )
}
