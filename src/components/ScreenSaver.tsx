import { useEffect, useState } from 'react'
import PhotoBackground from './PhotoBackground'
import type { PhotoRecord } from '../lib/photoStore'

interface ScreenSaverProps {
  photos: PhotoRecord[]
  active: boolean
}

const WEEKDAY_LABELS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

// 30분 동안 조작이 없을 때 전체 화면을 덮는 대기(디지털 액자) 화면.
// 기본 모드/사진 모드 어느 쪽에 있었든 동일하게 위에 떠서 날씨/달력/일정/주식을 모두 가리고,
// 화면을 한 번 터치하면(useLongIdleTimer가 감지) 사라져 원래 보던 화면이 그대로 드러난다.
// (도크의 기본/사진 선택 자체는 건드리지 않는다 — 이 컴포넌트는 그 위에 얹히는 오버레이일 뿐.)
// 등록된 사진이 있으면 기존 PhotoBackground를 그대로 재사용하고(원본 비율 유지, 5분 셔플),
// 사진이 한 장도 없으면 기본 모드와 동일한 고정 자연 풍경 이미지로 대체한다.
function ScreenSaver({ photos, active }: ScreenSaverProps) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15 * 1000)
    return () => clearInterval(timer)
  }, [])

  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  const date = `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY_LABELS[now.getDay()]}`
  const hasPhotos = photos.length > 0

  return (
    <div className={`screensaver ${active ? 'is-visible' : ''}`}>
      {/* active일 때만 무거운 하위 트리를 마운트해서, 대기 상태가 아닐 때는 사진 로테이션
          타이머가 돌지 않게 한다(기존 IdleScreen과 동일한 절약 방식). */}
      {active && hasPhotos && <PhotoBackground photos={photos} />}
      {active && !hasPhotos && (
        <div className="photo-background-layer">
          <div className="default-background" />
          <div className="photo-overlay" />
        </div>
      )}
      <div className="screensaver-clock">
        <div className="screensaver-time">{time}</div>
        <div className="screensaver-date">{date}</div>
      </div>
    </div>
  )
}

export default ScreenSaver
