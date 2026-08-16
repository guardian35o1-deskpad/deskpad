import { useMemo, useState } from 'react'
import type { CalendarEvent } from '../lib/calendarData'
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_ORDER } from '../lib/calendarData'
import { buildMonthGrid } from '../lib/calendarMonth'
import { diffInDays, formatDateKey, parseDateKey, startOfDay } from '../lib/date'
import { useCalendarEvents } from '../hooks/useCalendarEvents'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events) {
    const list = map.get(event.date)
    if (list) {
      list.push(event)
    } else {
      map.set(event.date, [event])
    }
  }
  return map
}

function formatUpcomingDate(dateKey: string): string {
  const date = parseDateKey(dateKey)
  const weekday = WEEKDAY_LABELS[date.getDay()]
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekday})`
}

function Calendar() {
  const today = useMemo(() => startOfDay(new Date()), [])
  const todayKey = useMemo(() => formatDateKey(today), [today])

  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedKey, setSelectedKey] = useState(todayKey)

  // 실제 Google Calendar 일정. status: 'loading'|'connected'|'not_connected'|'error'.
  const { events, status } = useCalendarEvents()
  const displayEvents = events ?? []

  const eventsByDate = useMemo(() => groupEventsByDate(displayEvents), [displayEvents])
  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])
  const gridRowCount = grid.length / 7

  const selectedEvents = eventsByDate.get(selectedKey) ?? []

  const upcomingEvent = useMemo(
    () => displayEvents.filter((event) => event.date > todayKey).sort((a, b) => a.date.localeCompare(b.date))[0],
    [displayEvents, todayKey],
  )

  const emptyScheduleMessage =
    status === 'not_connected'
      ? 'Google Calendar 연결이 필요합니다.'
      : status === 'error'
        ? '일정 정보를 불러올 수 없습니다.'
        : status === 'loading'
          ? '일정을 불러오는 중...'
          : '등록된 일정이 없습니다.'

  function goToPrevMonth() {
    const newDate = new Date(viewYear, viewMonth - 1, 1)
    setViewYear(newDate.getFullYear())
    setViewMonth(newDate.getMonth())
  }

  function goToNextMonth() {
    const newDate = new Date(viewYear, viewMonth + 1, 1)
    setViewYear(newDate.getFullYear())
    setViewMonth(newDate.getMonth())
  }

  function goToToday() {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setSelectedKey(todayKey)
  }

  return (
    <section className="panel calendar-panel">
      <div className="calendar-grid-area">
        <div className="calendar-month-header">
          <div className="calendar-month-title">
            {viewYear}년 {viewMonth + 1}월
          </div>
          <div className="calendar-month-nav">
            <button type="button" className="calendar-nav-btn" onClick={goToPrevMonth} aria-label="이전 달">
              ‹
            </button>
            <button type="button" className="calendar-today-btn" onClick={goToToday}>
              오늘
            </button>
            <button type="button" className="calendar-nav-btn" onClick={goToNextMonth} aria-label="다음 달">
              ›
            </button>
          </div>
        </div>

        <div className="calendar-weekday-row">
          {WEEKDAY_LABELS.map((label) => (
            <div className="calendar-weekday" key={label}>
              {label}
            </div>
          ))}
        </div>

        <div className="calendar-cells" style={{ gridTemplateRows: `repeat(${gridRowCount}, 1fr)` }}>
          {grid.map((cell) => {
            const dayEvents = eventsByDate.get(cell.dateKey) ?? []
            const isToday = cell.dateKey === todayKey
            const isSelected = cell.dateKey === selectedKey

            const classNames = [
              'calendar-cell',
              cell.inCurrentMonth ? '' : 'is-outside',
              isToday ? 'is-today' : '',
              isSelected ? 'is-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                type="button"
                className={classNames}
                key={cell.dateKey}
                onClick={() => setSelectedKey(cell.dateKey)}
              >
                <span className="calendar-cell-day">{cell.date.getDate()}</span>
                {dayEvents.length > 0 && (
                  <span className="calendar-cell-dots">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        className="calendar-dot"
                        key={event.id}
                        style={{ backgroundColor: CATEGORY_COLORS[event.category] }}
                      />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="calendar-legend">
          {CATEGORY_ORDER.map((category) => (
            <span className="calendar-legend-item" key={category}>
              <span className="calendar-legend-dot" style={{ backgroundColor: CATEGORY_COLORS[category] }} />
              {CATEGORY_LABELS[category]}
            </span>
          ))}
        </div>
      </div>

      <div className="calendar-schedule-area">
        <div className="schedule-header">
          <h2 className="panel-title">오늘 일정</h2>
          <span className="schedule-count">{selectedEvents.length}건</span>
        </div>

        {selectedEvents.length === 0 ? (
          <div className="schedule-empty">{emptyScheduleMessage}</div>
        ) : (
          <ul className="schedule-list">
            {selectedEvents.map((event) => (
              <li className="schedule-item" key={event.id}>
                <span className="schedule-item-bar" style={{ backgroundColor: CATEGORY_COLORS[event.category] }} />
                <div className="schedule-item-body">
                  <div className="schedule-item-top">
                    {event.time && <span className="schedule-item-time">{event.time}</span>}
                    <span className="schedule-item-title">{event.title}</span>
                  </div>
                  {(event.location || event.status) && (
                    <div className="schedule-item-meta">
                      {event.location && <span>📍 {event.location}</span>}
                      {event.status && <span className="schedule-item-status">{event.status}</span>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {upcomingEvent && (
          <div className="upcoming-card">
            <div className="upcoming-label">다가오는 일정</div>
            <div className="upcoming-body">
              <div className="upcoming-main">
                <span
                  className="schedule-item-bar"
                  style={{ backgroundColor: CATEGORY_COLORS[upcomingEvent.category] }}
                />
                <div>
                  <div className="upcoming-date">
                    {formatUpcomingDate(upcomingEvent.date)}
                    {upcomingEvent.time ? ` ${upcomingEvent.time}` : ''}
                  </div>
                  <div className="upcoming-title">{upcomingEvent.title}</div>
                  {upcomingEvent.location && <div className="upcoming-location">📍 {upcomingEvent.location}</div>}
                </div>
              </div>
              <div className="upcoming-dday">D-{diffInDays(parseDateKey(upcomingEvent.date), today)}일</div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default Calendar
