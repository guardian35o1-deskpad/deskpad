import { useCallback, useEffect, useState } from 'react'
import type { PhotoRecord } from '../lib/photoStore'
import { addPhoto, clearAllPhotos, deletePhoto, getAllPhotos } from '../lib/photoStore'
import { resizeImageFile } from '../lib/imageResize'

interface UsePhotosResult {
  photos: PhotoRecord[]
  loading: boolean
  processing: boolean
  error: string | null
  addPhotos: (files: FileList | File[]) => Promise<void>
  removePhoto: (id: string) => Promise<void>
  clearPhotos: () => Promise<void>
}

export function usePhotos(): UsePhotosResult {
  const [photos, setPhotos] = useState<PhotoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    getAllPhotos()
      .then((records) => {
        if (!cancelled) setPhotos(records)
      })
      .catch((err) => {
        console.error('사진 목록을 불러오지 못했습니다.', err)
        if (!cancelled) setError('사진 목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const addPhotos = useCallback(async (files: FileList | File[]) => {
    setProcessing(true)
    setError(null)
    try {
      const fileArray = Array.from(files)
      const newRecords: PhotoRecord[] = []
      for (const file of fileArray) {
        const resized = await resizeImageFile(file)
        const record = await addPhoto(resized)
        newRecords.push(record)
      }
      setPhotos((prev) => [...prev, ...newRecords])
    } catch (err) {
      console.error('사진 추가에 실패했습니다.', err)
      setError('사진 추가에 실패했습니다.')
    } finally {
      setProcessing(false)
    }
  }, [])

  const removePhoto = useCallback(async (id: string) => {
    try {
      await deletePhoto(id)
      setPhotos((prev) => prev.filter((photo) => photo.id !== id))
    } catch (err) {
      console.error('사진 삭제에 실패했습니다.', err)
      setError('사진 삭제에 실패했습니다.')
    }
  }, [])

  const clearPhotos = useCallback(async () => {
    try {
      await clearAllPhotos()
      setPhotos([])
    } catch (err) {
      console.error('사진 전체 삭제에 실패했습니다.', err)
      setError('사진 전체 삭제에 실패했습니다.')
    }
  }, [])

  return { photos, loading, processing, error, addPhotos, removePhoto, clearPhotos }
}
