import { useCallback, useEffect, useState } from 'react'
import type { PhotoRecord } from '../lib/photoStore'
import {
  addPhoto,
  clearAllPhotos,
  deletePhoto,
  getAllPhotos,
  setAllPhotosActive as storeSetAllPhotosActive,
  setPhotoActive as storeSetPhotoActive,
} from '../lib/photoStore'
import { createThumbnail, resizeImageFile } from '../lib/imageResize'

export interface PhotoAddProgress {
  current: number
  total: number
}

interface UsePhotosResult {
  photos: PhotoRecord[]
  loading: boolean
  processing: boolean
  progress: PhotoAddProgress | null
  error: string | null
  addPhotos: (files: FileList | File[]) => Promise<void>
  removePhoto: (id: string) => Promise<void>
  clearPhotos: () => Promise<void>
  setPhotoActive: (id: string, active: boolean) => Promise<void>
  setAllPhotosActive: (active: boolean) => Promise<void>
}

export function usePhotos(): UsePhotosResult {
  const [photos, setPhotos] = useState<PhotoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<PhotoAddProgress | null>(null)
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

    // 여러 장을 한 번에 선택했을 때 한 장씩 순차 처리한다(구형 iPad 메모리 폭주 방지).
    // 파일마다 개별적으로 try/catch해서, 특정 사진(예: 용량이 지나치게 크거나 지원하지
    // 않는 형식)이 실패해도 나머지 사진 처리가 멈추거나 이미 저장된 사진이 화면에서
    // 누락되지 않도록 한다 — 실패 1건이 전체 배치를 실패시키지 않는다.
    const fileArray = Array.from(files)
    setProgress({ current: 0, total: fileArray.length })
    let failedCount = 0
    for (let i = 0; i < fileArray.length; i += 1) {
      const file = fileArray[i]
      try {
        // 원본을 먼저 액자용 크기(2048px)로 줄이고, 그 결과를 다시 썸네일 크기(320px)로
        // 줄인다 — 큰 원본 File을 두 번 디코딩하지 않기 위함.
        const resized = await resizeImageFile(file)
        const thumbnail = await createThumbnail(resized)
        const record = await addPhoto(resized, thumbnail)
        setPhotos((prev) => [...prev, record])
      } catch (err) {
        failedCount += 1
        console.error(`사진 추가에 실패했습니다: ${file.name}`, err)
      }
      setProgress({ current: i + 1, total: fileArray.length })
    }

    if (failedCount > 0) {
      const successCount = fileArray.length - failedCount
      setError(
        successCount > 0
          ? `${failedCount}장을 추가하지 못했습니다(용량이 너무 크거나 지원하지 않는 형식일 수 있습니다). 나머지 ${successCount}장은 정상 등록됐습니다.`
          : '사진 추가에 실패했습니다.',
      )
    }

    setProgress(null)
    setProcessing(false)
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

  // 사진 자체는 지우지 않고 액자(사진 모드/30분 Idle 슬라이드쇼) 사용 여부만 바꾼다.
  const setPhotoActive = useCallback(async (id: string, active: boolean) => {
    try {
      await storeSetPhotoActive(id, active)
      setPhotos((prev) => prev.map((photo) => (photo.id === id ? { ...photo, active } : photo)))
    } catch (err) {
      console.error('사진 상태 변경에 실패했습니다.', err)
      setError('사진 상태 변경에 실패했습니다.')
    }
  }, [])

  const setAllPhotosActive = useCallback(async (active: boolean) => {
    try {
      await storeSetAllPhotosActive(active)
      setPhotos((prev) => prev.map((photo) => ({ ...photo, active })))
    } catch (err) {
      console.error('사진 상태 일괄 변경에 실패했습니다.', err)
      setError('사진 상태 일괄 변경에 실패했습니다.')
    }
  }, [])

  return {
    photos,
    loading,
    processing,
    progress,
    error,
    addPhotos,
    removePhoto,
    clearPhotos,
    setPhotoActive,
    setAllPhotosActive,
  }
}
