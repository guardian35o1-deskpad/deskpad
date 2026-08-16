import { formatDateKey } from './date'

export interface CalendarCell {
  date: Date
  dateKey: string
  inCurrentMonth: boolean
}

// 해당 월의 달력 그리드(일요일 시작, 7일 단위)를 만든다.
// 마지막 주를 채우기 위한 다음 달 날짜만 덧붙이고, 불필요한 6번째 주는 만들지 않는다(화면 높이 절약).
export function buildMonthGrid(year: number, month0: number): CalendarCell[] {
  const firstOfMonth = new Date(year, month0, 1)
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month0 + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month0, 0).getDate()

  const cells: CalendarCell[] = []

  for (let i = startWeekday - 1; i >= 0; i -= 1) {
    const day = daysInPrevMonth - i
    const date = new Date(year, month0 - 1, day)
    cells.push({ date, dateKey: formatDateKey(date), inCurrentMonth: false })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month0, day)
    cells.push({ date, dateKey: formatDateKey(date), inCurrentMonth: true })
  }

  const remainder = cells.length % 7
  if (remainder !== 0) {
    const trailing = 7 - remainder
    for (let day = 1; day <= trailing; day += 1) {
      const date = new Date(year, month0 + 1, day)
      cells.push({ date, dateKey: formatDateKey(date), inCurrentMonth: false })
    }
  }

  return cells
}
