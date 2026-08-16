import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { PhotoRecord } from '../lib/photoStore'

interface PhotoManagerProps {
  photos: PhotoRecord[]
  processing: boolean
  error: string | null
  onAddPhotos: (files: FileList) => void
  onRemovePhoto: (id: string) => void
  onClearPhotos: () => void
  onClose: () => void
}

function PhotoManager({
  photos,
  processing,
  error,
  onAddPhotos,
  onRemovePhoto,
  onClearPhotos,
  onClose,
}: PhotoManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)

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

        <div className="photo-manager-summary">등록된 사진 {photos.length}장</div>

        {error && <div className="photo-manager-error">{error}</div>}

        <div className="photo-manager-actions">
          <button
            type="button"
            className="photo-manager-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
          >
            {processing ? '사진 추가 중...' : '사진 추가'}
          </button>
          <button
            type="button"
            className="photo-manager-btn danger"
            onClick={handleClearClick}
            disabled={photos.length === 0}
          >
            전체 삭제
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
          <ul className="photo-manager-list">
            {photos.map((photo, index) => (
              <li className="photo-manager-item" key={photo.id}>
                <span>사진 {index + 1}</span>
                <button type="button" className="photo-manager-item-delete" onClick={() => onRemovePhoto(photo.id)}>
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default PhotoManager
