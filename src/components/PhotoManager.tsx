import { useEffect, useReducer, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { PhotoRecord } from '../lib/photoStore'
import type { PhotoAddProgress } from '../hooks/usePhotos'

interface PhotoManagerProps {
  photos: PhotoRecord[]
  processing: boolean
  progress: PhotoAddProgress | null
  error: string | null
  onAddPhotos: (files: FileList) => void
  onRemovePhoto: (id: string) => void
  onClearPhotos: () => void
  onSetPhotoActive: (id: string, active: boolean) => void
  onSetAllPhotosActive: (active: boolean) => void
  onClose: () => void
}

// photo.thumbnail(그리드용)과 photo.blob(큰 미리보기용) Blob마다 object URL을 만들고,
// 더 이상 필요 없어진 것만 해제한다 — 사진이 수십 장이어도 렌더마다 URL을 새로 만들지
// 않기 위해 id별로 캐시해 재사용한다(구형 iPad 메모리 절약 원칙).
function useObjectUrls(blobs: Map<string, Blob>): Record<string, string> {
  const cacheRef = useRef<Map<string, string>>(new Map())
  const [, forceRender] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    const cache = cacheRef.current
    let changed = false

    for (const [id, url] of cache) {
      if (!blobs.has(id)) {
        URL.revokeObjectURL(url)
        cache.delete(id)
        changed = true
      }
    }

    for (const [id, blob] of blobs) {
      if (!cache.has(id)) {
        cache.set(id, URL.createObjectURL(blob))
        changed = true
      }
    }

    if (changed) forceRender()
  }, [blobs])

  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      cache.forEach((url) => URL.revokeObjectURL(url))
      cache.clear()
    }
  }, [])

  return Object.fromEntries(cacheRef.current)
}

function PhotoManager({
  photos,
  processing,
  progress,
  error,
  onAddPhotos,
  onRemovePhoto,
  onClearPhotos,
  onSetPhotoActive,
  onSetAllPhotosActive,
  onClose,
}: PhotoManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const thumbnailBlobs = new Map(photos.map((photo) => [photo.id, photo.thumbnail]))
  const thumbnailUrls = useObjectUrls(thumbnailBlobs)

  const previewPhoto = photos.find((photo) => photo.id === previewId) ?? null
  const previewBlobs = new Map(previewPhoto ? [[previewPhoto.id, previewPhoto.blob] as const] : [])
  const previewUrls = useObjectUrls(previewBlobs)

  const activeCount = photos.filter((photo) => photo.active).length

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (files && files.length > 0) {
      onAddPhotos(files)
    }
    event.target.value = ''
  }

  function handleClearClick() {
    if (confirmingClear) {
      onClearPhotos()
      setConfirmingClear(false)
    } else {
      setConfirmingClear(true)
    }
  }

  return (
    <div className="photo-manager-backdrop">
      <div className="photo-manager">
        <div className="photo-manager-header">
          <div className="photo-manager-title">⚙ 사진 관리</div>
          <button type="button" className="photo-manager-close" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="photo-manager-summary">
          등록된 사진 {photos.length}장 · 액자 사용 {activeCount}장
        </div>

        {error && <div className="photo-manager-error">{error}</div>}

        {progress && (
          <div className="photo-manager-progress">
            사진 최적화 중 {progress.current} / {progress.total}
          </div>
        )}

        <div className="photo-manager-actions">
          <button
            type="button"
            className="photo-manager-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
          >
            {processing ? '사진 추가 중...' : '+ 사진 추가'}
          </button>
          <button
            type="button"
            className="photo-manager-btn"
            onClick={() => onSetAllPhotosActive(true)}
            disabled={photos.length === 0}
          >
            전체 선택
          </button>
          <button
            type="button"
            className="photo-manager-btn"
            onClick={() => onSetAllPhotosActive(false)}
            disabled={photos.length === 0}
          >
            전체 해제
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="photo-manager-file-input"
            onChange={handleFileChange}
          />
        </div>

        {confirmingClear && (
          <div className="photo-manager-confirm">
            <span>등록된 사진 {photos.length}장을 모두 삭제할까요?</span>
            <button type="button" className="photo-manager-btn danger" onClick={handleClearClick}>
              예, 삭제
            </button>
            <button type="button" className="photo-manager-btn" onClick={() => setConfirmingClear(false)}>
              취소
            </button>
          </div>
        )}

        {photos.length === 0 ? (
          <div className="photo-manager-empty">등록된 사진이 없습니다.</div>
        ) : (
          <>
            <div className="photo-manager-grid">
              {photos.map((photo) => {
                const thumbUrl = thumbnailUrls[photo.id]
                return (
                  <div
                    className={`photo-manager-cell ${photo.active ? '' : 'is-inactive'}`}
                    key={photo.id}
                  >
                    <button
                      type="button"
                      className="photo-manager-thumb"
                      style={thumbUrl ? { backgroundImage: `url(${thumbUrl})` } : undefined}
                      onClick={() => setPreviewId(photo.id)}
                      aria-label="사진 크게 보기"
                    />
                    <button
                      type="button"
                      className={`photo-manager-check ${photo.active ? 'is-active' : ''}`}
                      onClick={() => onSetPhotoActive(photo.id, !photo.active)}
                      aria-label={photo.active ? '액자에서 제외' : '액자에 포함'}
                      aria-pressed={photo.active}
                    >
                      {photo.active ? '✓' : ''}
                    </button>
                    <button
                      type="button"
                      className="photo-manager-trash"
                      onClick={() => onRemovePhoto(photo.id)}
                      aria-label="사진 삭제"
                    >
                      🗑
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="photo-manager-hint">✓ 체크된 사진만 랜덤 액자에 표시됩니다.</div>

            <div className="photo-manager-footer">
              <button
                type="button"
                className="photo-manager-btn danger"
                onClick={handleClearClick}
                disabled={photos.length === 0}
              >
                전체 삭제
              </button>
            </div>
          </>
        )}
      </div>

      {previewPhoto && (
        <div className="photo-preview-backdrop" onClick={() => setPreviewId(null)}>
          <button
            type="button"
            className="photo-preview-close"
            onClick={() => setPreviewId(null)}
            aria-label="미리보기 닫기"
          >
            닫기
          </button>
          {previewUrls[previewPhoto.id] && (
            <img
              className="photo-preview-image"
              src={previewUrls[previewPhoto.id]}
              alt="사진 미리보기"
              onClick={(event) => event.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default PhotoManager
