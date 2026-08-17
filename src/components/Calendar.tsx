import { useCallback, useMemo, useRef, useState } from 'react'
import type { CalendarEvent } from '../lib/calendarData'
import type { CalendarStatus } from '../hooks/useCalendarEvents'
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_ORDER } from '../lib/calendarData'
import { buildMonthGrid } from '../lib/calendarMonth'
import { diffInDays, formatDateKey, parseDateKey, startOfDay } from '../lib/date'
import { useSwipeNav } from '../hooks/useSwipeNav'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
// 월 전환 슬라이드 애니메이션 길이(App.css의 @keyframes calendar-slide-* duration과 반드시
// 일치시켜야 한다) — 이 시간 동안은 스와이프/버튼으로 추가 월 전환을 잠가서, 빠르게 여러 번
// 밀어도 월이 중복 전환되지 않게 한다("debounce/lock 처리" 요구사항).
const MONTH_TRANSITION_LOCK_MS = 220

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

interface CalendarProps {
  // 실제 Google Calendar 일정과 조회 상태. 조회 로직(useCalendarEvents) 자체는 App.tsx가
  // 호출한다 — App.tsx의 refreshAll()이 날씨/캘린더/시장 세 소스를 한 번에 새로고침하려면
  // 세 훅이 모두 App.tsx 레벨에서 호출돼야 하기 때문(공통 refresh 설계, Weather/Market와 동일).
  events: CalendarEvent[] | null
  status: CalendarStatus
}

function Calendar({ events, status }: CalendarProps) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const todayKey = useMemo(() => formatDateKey(today), [today])

  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedKey, setSelectedKey] = useState(todayKey)
  // 스와이프/버튼으로 월이 바뀔 때 살짝 슬라이드하며 나타나는 애니메이션 방향.
  // null이면 애니메이션 없음(최초 렌더). key로 강제 리마운트시켜 매번 애니메이션이 재생되게 한다.
  const [slideDir, setSlideDir] = useState<'next' | 'prev' | null>(null)
  const transitionLockRef = useRef(false)

  const displayEvents = events ?? []

  const eventsByDate = useMemo(() => groupEventsByDate(displayEvents), [displayEvents])
  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])
  const gridRowCount = grid.length / 7

  const selectedEvents = eventsByDate.get(selectedKey) ?? []

  // 오늘 일정 아래 남는 공간을 활용해 다음 일정 1건이 아니라 최대 4건을 리스트로 보여준다.
  const upcomingEvents = useMemo(
    () =>
      displayEvents
        .filter((event) => event.date > todayKey)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4),
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

  // 스와이프와 이전/다음 버튼이 공유하는 월 전환 함수. 애니메이션 진행 중(lock)에는 추가
  // 전환을 무시해, 빠르게 여러 번 밀거나 눌러도 월이 중복 전환되지 않는다.
  const changeMonth = useCallback(
    (direction: 'next' | 'prev') => {
      if (transitionLockRef.current) return
      transitionLockRef.current = true
      setTimeout(() => {
        transitionLockRef.current = false
      }, MONTH_TRANSITION_LOCK_MS)

      setSlideDir(direction)
      const base = new Date(viewYear, viewMonth + (direction === 'next' ? 1 : -1), 1)
      setViewYear(base.getFullYear())
      setViewMonth(base.getMonth())
    },
    [viewYear, viewMonth],
  )

  const goToPrevMonth = useCallback(() => changeMonth('prev'), [changeMonth])
  const goToNextMonth = useCallback(() => changeMonth('next'), [changeMonth])

  function goToToday() {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setSelectedKey(todayKey)
  }

  // 왼쪽으로 밀면 다음 달(goToNextMonth), 오른쪽으로 밀면 이전 달(goToPrevMonth) — 아이패드
  // Safari 터치와 PC 마우스 드래그 둘 다 동일하게 동작한다(useSwipeNav 참고).
  const swipeAreaRef = useSwipeNav<HTMLDivElement>(goToNextMonth, goToPrevMonth)

  return (
    <section className="calendar-panel">
      <div className="panel calendar-grid-area">
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

        {/* 이 영역만 스와이프 대상이다(월 헤더 버튼은 제외 — 항상 클릭으로 동작). 왼쪽으로
            밀면 다음 달, 오른쪽으로 밀면 이전 달. useSwipeNav는 이 바깥쪽 div에 한 번만
            이벤트 리스너를 붙이므로, 이 div 자체는 절대 리마운트되면 안 된다(리마운트되면
            리스너가 옛 DOM 노드에만 남아 두 번째 스와이프부터 먹통이 된다) — 그래서 슬라이드
            애니메이션용 key는 안쪽 래퍼(calendar-swipe-inner)에만 준다. */}
        <div className="calendar-swipe-area" ref={swipeAreaRef}>
          <div
            className={`calendar-swipe-inner ${slideDir === 'next' ? 'slide-next' : slideDir === 'prev' ? 'slide-prev' : ''}`}
            key={`${viewYear}-${viewMonth}`}
          >
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
          </div>
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

      <div className="panel calendar-schedule-area">
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
                    <span className="schedule-item-title">
                      {event.category === 'hospital' && '🏥 '}
                      {event.title}
                    </span>
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

        {upcomingEvents.length > 0 && (
          <div className="upcoming-section">
            <div className="upcoming-label">다가오는 일정</div>
            <ul className="upcoming-list">
              {upcomingEvents.map((event) => (
                <li className="upcoming-card" key={event.id}>
                  <div className="upcoming-body">
                    <div className="upcoming-main">
                      <span
                        className="schedule-item-bar"
                        style={{ backgroundColor: CATEGORY_COLORS[event.category] }}
                      />
                      <div>
                        <div className="upcoming-date">
                          {formatUpcomingDate(event.date)}
                          {event.time ? ` ${event.time}` : ''}
                        </div>
                        <div className="upcoming-title">
                          {event.category === 'hospital' && '🏥 '}
                          {event.title}
                        </div>
                        {event.location && <div className="upcoming-location">📍 {event.location}</div>}
                      </div>
                    </div>
                    <div className="upcoming-dday">D-{diffInDays(parseDateKey(event.date), today)}일</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

export default Calendar
