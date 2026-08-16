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

  const hoursMinutes = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const seconds = pad(now.getSeconds())
  const date = `${now.getMonth() + 1}월 ${now.getDate()}일`
  const weekday = WEEKDAYS[now.getDay()]

  return (
    <div className="clock">
      <div className="clock-time">
        {hoursMinutes}
        <span className="clock-seconds">{seconds}</span>
      </div>
      <div className="clock-info">
        <span className="clock-date">{date}</span>
        <span className="clock-info-sep">·</span>
        <span className="clock-weekday">{weekday}</span>
      </div>
    </div>
  )
}

export default Clock
