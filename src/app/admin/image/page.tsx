'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function UploadImagesPage() {
  const [message, setMessage] = useState('')

  const handleUpload = async (e: any) => {
    const files = e.target.files
    if (!files) return

    for (const file of files) {
      const fileName = file.name
      const setCode = fileName.split('-')[0]

      const { error } = await supabase.storage
        .from('cards-images')
        .upload(`${setCode}/${fileName}`, file, {
          upsert: true,
        })

      if (error) {
        console.error(error)
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