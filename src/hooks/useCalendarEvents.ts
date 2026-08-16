import { useEffect, useRef, useState } from 'react'
import type { CalendarEvent } from '../lib/calendarData'
import type { GoogleCalendarEventDTO } from '../lib/googleCalendarAdapter'
import { toCalendarEvents } from '../lib/googleCalendarAdapter'

const ENDPOINT = '/api/calendar-events'
const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5분마다 갱신

export type CalendarStatus = 'loading' | 'connected' | 'not_connected' | 'error'

interface CalendarEventsResponse {
  events?: GoogleCalendarEventDTO[]
}

// Weather.tsx와 동일한 패턴: 최초 로드 + 5분 주기 + (오래 백그라운드에 있다가 돌아왔을 때)
// visibilitychange 시 오래됐으면 재조회. API 실패 시 이전 정상 데이터는 그대로 유지하고,
// 데이터를 한 번도 못 받아온 경우에만 에러 상태를 노출한다.
export function useCalendarEvents() {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [status, setStatus] = useState<CalendarStatus>('loading')
  const eventsRef = useRef<CalendarEvent[] | null>(null)
  const lastFetchedAtRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function fetchEvents() {
      lastFetchedAtRef.current = Date.now()
      try {
        const response = await fetch(ENDPOINT, { signal: controller.signal })
        if (cancelled) return

        if (response.status === 401) {
          // Google 계정이 아직 연결되지 않은 정상적인 상태 — 에러가 아니다.
          setStatus('not_connected')
          return
        }
        if (!response.ok) {
          throw new Error(`Calendar API 응답 오류: ${response.status}`)
        }

        const json = (await response.json()) as CalendarEventsResponse
        const converted = toCalendarEvents(json.events ?? [])
        if (cancelled) return
        eventsRef.current = converted
        setEvents(converted)
        setStatus('connected')
      } catch (err) {
        if (cancelled) return
        console.error('Google Calendar 일정을 가져오지 못했습니다.', err)
        // 이전에 정상적으로 받아온 데이터가 있으면 그대로 유지하고, 상태만 조용히 넘어간다.
        if (!eventsRef.current) {
          setStatus('error')
        }
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastFetchedAtRef.current >= REFRESH_INTERVAL_MS) {
        fetchEvents()
      }
    }

    fetchEvents()
    const timer = setInterval(fetchEvents, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      controller.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return { events, status }
}
