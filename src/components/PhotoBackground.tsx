import { useEffect, useRef, useState } from 'react'
import type { PhotoRecord } from '../lib/photoStore'

interface PhotoBackgroundProps {
  photos: PhotoRecord[]
}

const ROTATE_INTERVAL_MS = 5 * 60 * 1000 // 5분마다 전환

function shuffle(records: PhotoRecord[]): PhotoRecord[] {
  const array = [...records]
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

// 등록된 사진을 한 번씩 모두 보여준 뒤 다시 섞는다.
// 이전 셔플의 마지막 사진과 다음 셔플의 첫 사진이 같으면 서로 바꿔서 연속 반복을 막는다.
function buildQueue(photos: PhotoRecord[], avoidId: string | null): PhotoRecord[] {
  const queue = shuffle(photos)
  if (avoidId && queue.length > 1 && queue[0].id === avoidId) {
    ;[queue[0], queue[1]] = [queue[1], queue[0]]
  }
  return queue
}

// 사진은 항상 한 장만, 원본 종횡비 그대로 중앙에 보여준다(background-size: contain).
// 잘리거나 확대된 복제본을 뒤에 깔지 않고, 남는 여백은 검정/기존 어두운 배경색 그대로 둔다.
function PhotoBackground({ photos }: PhotoBackgroundProps) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  const queueRef = useRef<PhotoRecord[]>([])
  const lastShownIdRef = useRef<string | null>(null)
  const currentUrlRef = useRef<string | null>(null)

  useEffect(() => {
    function advance() {
      if (queueRef.current.length === 0) {
        queueRef.current = buildQueue(photos, lastShownIdRef.current)
      }
      const next = queueRef.current.shift()
      if (!next) return

      lastShownIdRef.current = next.id

      const nextUrl = URL.createObjectURL(next.blob)
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current)
      }
      currentUrlRef.current = nextUrl
      setCurrentUrl(nextUrl)
    }

    if (photos.length === 0) {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current)
        currentUrlRef.current = null
      }
      queueRef.current = []
      lastShownIdRef.current = null
      setCurrentUrl(null)
      return
    }

    queueRef.current = []
    advance()

    const timer = setInterval(advance, ROTATE_INTERVAL_MS)

    return () => {
      clearInterval(timer)
    }
  }, [photos])

  useEffect(() => {
    return () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current)
      }
    }
  }, [])

  return (
    <div className="photo-background-layer">
      {currentUrl ? (
        <div className="photo-background" style={{ backgroundImage: `url(${currentUrl})` }} />
      ) : (
        <div className="photo-background-empty">등록된 사진이 없습니다. ⚙ 설정 버튼으로 사진을 등록해주세요.</div>
      )}
      <div className="photo-overlay" />
    </div>
  )
}

export default PhotoBackground
