import { useEffect, useState } from 'react'
import PhotoBackground from './PhotoBackground'
import type { PhotoRecord } from '../lib/photoStore'

interface IdleScreenProps {
  photos: PhotoRecord[]
  active: boolean
}

const WEEKDAY_LABELS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

// 사진 모드의 기본(대기) 화면: 등록된 사진이 있으면 기존 PhotoBackground를 그대로 재사용해
// 사진 한 장(원본 비율 유지) + 5분 셔플을 보여주고, 없으면 어두운 배경만 남긴다.
// 시:분만 표시하고(초 제거), blur/backdrop-filter 같은 무거운 효과는 쓰지 않는다.
function IdleScreen({ photos, active }: IdleScreenProps) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15 * 1000)
    return () => clearInterval(timer)
  }, [])

  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  const date = `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY_LABELS[now.getDay()]}`

  return (
    <div className={`idle-screen ${active ? 'is-visible' : ''}`}>
      {/* active일 때만 마운트해서, 대기 상태가 아닐 때는 사진 로테이션 타이머가 돌지 않게 한다. */}
      {active && photos.length > 0 && <PhotoBackground photos={photos} />}
      <div className="idle-clock">
        <div className="idle-time">{time}</div>
        <div className="idle-date">{date}</div>
      </div>
    </div>
  )
}

export default IdleScreen
