import type { Exchange } from './types'

// 대략적인 개장 시간 판단. 서머타임(DST)이나 공휴일까지 정확히 보정하지는 않는다.
// - KRX(코스피/코스닥): 평일 09:00~15:30 (한국시간)
// - US(S&P500/NASDAQ): 한국시간 기준 대략 22:30~05:00 (서머타임에 따라 ±1시간 오차 가능)
// 실제 API로 교체할 때 더 정교한 보정이 필요하면 이 함수만 손보면 된다.
export function isMarketOpen(exchange: Exchange, now: Date = new Date()): boolean {
  const day = now.getDay() // 0=일요일 ... 6=토요일
  const isWeekday = day >= 1 && day <= 5
  const minutesOfDay = now.getHours() * 60 + now.getMinutes()

  if (exchange === 'KRX') {
    if (!isWeekday) return false
    return minutesOfDay >= 9 * 60 && minutesOfDay <= 15 * 60 + 30
  }

  // US 시장: 자정을 걸치므로 늦은 밤 / 이른 새벽 두 구간으로 나눠 판단한다.
  const isLateNight = minutesOfDay >= 22 * 60 + 30
  const isEarlyMorning = minutesOfDay <= 5 * 60

  if (isLateNight) return isWeekday
  if (isEarlyMorning) return day >= 2 && day <= 6 // 전날이 평일이었던 화~토 새벽
  return false
}
