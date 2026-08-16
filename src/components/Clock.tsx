import { useEffect, useState } from 'react'

const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

function pad(value: number) {
  return value.toString().padStart(2, '0')
}

function Clock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const date = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`
  const weekday = WEEKDAYS[now.getDay()]

  return (
    <div className="clock">
      <div className="clock-time">{time}</div>
      <div className="clock-info">
        <div className="clock-date">{date}</div>
        <div className="clock-weekday">{weekday}</div>
      </div>
    </div>
  )
}

export default Clock
