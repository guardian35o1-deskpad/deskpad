import { useEffect, useRef, useState } from 'react'
import type { PhotoRecord } from '../lib/photoStore'

interface PhotoBackgroundProps {
  photos: PhotoRecord[]
}

const ROTATE_INTERVAL_MS = 5 * 60 * 1000 // 5분마다 전환

// 가로/세로 판정 경계(가로÷세로). 이 값 이상이면 "가로 사진"으로 보고 화면을 자연스럽게
// 채우는 cover 한 장만 쓴다. 이보다 작으면(세로에 가깝거나 정사각형) AUTO FIT을 적용해
// 좌우에 큰 검정 여백이 남지 않게 한다(42번 2차, 아래 AUTO FIT 참고).
const LANDSCAPE_RATIO_THRESHOLD = 1.15

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

// 사진은 항상 한 장만 보여준다. 가로 사진은 화면을 자연스럽게 채우는 cover를 쓰고(약간
// 잘리는 것을 허용), 세로/정사각 사진은 AUTO FIT을 적용한다 — 뒤에는 같은 사진을 확대해
// 화면을 꽉 채우고 어둡게(cover+dim), 그 위에 원본은 잘리지 않게 그대로(contain) 올린다.
// AUTO FIT 여부는 사진마다 실제 원본 가로/세로 비율(naturalWidth/naturalHeight)로 판정한다.
function PhotoBackground({ photos }: PhotoBackgroundProps) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null)
  // 판정 전(로드 전)에는 우선 가로로 간주해 단일 cover로 보여준다 — 세로 사진이었다면
  // Image 로드가 끝나는 즉시(보통 한 프레임 이내) AUTO FIT으로 다시 그려진다.
  const [isLandscape, setIsLandscape] = useState(true)
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

  // currentUrl(사진)이 바뀔 때마다(5분 전환 포함) 실제 이미지를 한 번 로드해 원본
  // 가로/세로 비율을 다시 판정한다. background-image로만 쓰면 naturalWidth/Height를
  // 알 수 없어 별도 Image()로 확인한다 — 화면(뷰포트) 방향이 아니라 사진 자체의 원본
  // 비율만 기준으로 삼으므로, 화면 회전과는 무관하게 항상 같은 사진은 같게 판정된다.
  useEffect(() => {
    if (!currentUrl) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled || img.naturalHeight === 0) return
      setIsLandscape(img.naturalWidth / img.naturalHeight >= LANDSCAPE_RATIO_THRESHOLD)
    }
    img.src = currentUrl
    return () => {
      cancelled = true
    }
  }, [currentUrl])

  return (
    <div className="photo-background-layer">
      {currentUrl ? (
        isLandscape ? (
          <div className="photo-background" style={{ backgroundImage: `url(${currentUrl})` }} />
        ) : (
          <>
            {/* AUTO FIT(세로/정사각 사진): 뒤 배경(확대+어둡게) → 원본(잘리지 않게) 순서로
                쌓는다. 뒤로 갈수록 먼저 그려지므로 이 순서 그대로 원본이 맨 위에 보인다. */}
            <div
              className="photo-background photo-background-fill"
              style={{ backgroundImage: `url(${currentUrl})` }}
            />
            <div className="photo-background-fill-dim" />
            <div className="photo-background" style={{ backgroundImage: `url(${currentUrl})` }} />
          </>
        )
      ) : (
        <div className="photo-background-empty">등록된 사진이 없습니다. ⚙ 설정 버튼으로 사진을 등록해주세요.</div>
      )}
      <div className="photo-overlay" />
    </div>
  )
}

export default PhotoBackground
