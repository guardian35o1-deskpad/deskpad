import { useCallback, useEffect, useRef, useState } from 'react'
import type { CalendarEvent } from '../lib/calendarData'
import type { GoogleCalendarEventDTO } from '../lib/googleCalendarAdapter'
import { toCalendarEvents } from '../lib/googleCalendarAdapter'

const ENDPOINT = '/api/calendar-events'
// DeskPad는 상시 켜두는 탁상 디스플레이라 일정 변경이 최대 1분 안에는 반영돼야 한다.
const REFRESH_INTERVAL_MS = 60 * 1000

export type CalendarStatus = 'loading' | 'connected' | 'not_connected' | 'error'

interface CalendarEventsResponse {
  events?: GoogleCalendarEventDTO[]
}

// 수동 새로고침 없이 다음 경로로 자동 갱신된다.
// 1) 최초 마운트 시 즉시 조회
// 2) 1분마다 주기적으로 조회
// 3) document가 hidden -> visible로 바뀌면(화면이 다시 켜지면) 무조건 즉시 조회
// 4) window에 focus가 돌아왔을 때, 마지막 조회로부터 1분 이상 지났으면 조회
// 5) 사진모드 대기화면에서 Dashboard가 새로 보이게 된 순간(=dashboardHidden이 true->false로
//    바뀐 순간 — 사진모드 tap-reveal과 "정보모드로 전환"이 둘 다 여기 해당한다) 마지막 조회로부터
//    1분 이상 지났으면 즉시 조회
// isFetchingRef로 동시에 여러 트리거가 겹쳐도 중복 요청하지 않고, 실패 시에는 이전에 받아온
// 데이터를 그대로 유지한다(데이터를 한 번도 못 받아온 경우에만 에러 상태를 노출).
export function useCalendarEvents(dashboardHidden: boolean) {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [status, setStatus] = useState<CalendarStatus>('loading')
  const eventsRef = useRef<CalendarEvent[] | null>(null)
  const lastFetchedAtRef = useRef(0)
  const isFetchingRef = useRef(false)
  const isMountedRef = useRef(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchEvents = useCallback(async () => {
    if (isFetchingRef.current) return // 이미 진행 중인 요청이 있으면 중복 요청하지 않는다.
    isFetchingRef.current = true
    lastFetchedAtRef.current = Date.now()

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      // 프록시/브라우저 캐시에 오래된 응답이 남지 않도록 no-store로 매번 새로 받아온다.
      const response = await fetch(ENDPOINT, { signal: controller.signal, cache: 'no-store' })
      if (!isMountedRef.current) return

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
      if (!isMountedRef.current) return
      eventsRef.current = converted
      setEvents(converted)
      setStatus('connected')
    } catch (err) {
      if (!isMountedRef.current) return
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error('Google Calendar 일정을 가져오지 못했습니다.', err)
      // 이전에 정상적으로 받아온 데이터가 있으면 그대로 유지하고, 상태만 조용히 넘어간다.
      if (!eventsRef.current) {
        setStatus('error')
      }
    } finally {
      // 이 요청이 여전히 "최신" 요청일 때만 진행 중 플래그를 해제한다.
      // dev 서버 StrictMode(mount→cleanup→remount)에서 구 요청이 abort된 뒤
      // 새 요청이 이미 시작된 상태라면, 구 요청의 finally가 뒤늦게 실행되며
      // 새 요청의 isFetchingRef를 잘못 false로 되돌리는 것을 막는다.
      if (abortControllerRef.current === controller) {
        isFetchingRef.current = false
      }
    }
  }, [])

  // 1) 최초 조회 + 2) 1분 주기 조회 + 3) 화면 재활성화 시 즉시 조회 + 4) 창 focus 시 오래됐으면 조회
  useEffect(() => {
    isMountedRef.current = true

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      fetchEvents() // 화면이 다시 켜졌을 때는 오래됐는지 따지지 않고 무조건 즉시 재조회한다.
    }

    function handleFocus() {
      if (Date.now() - lastFetchedAtRef.current >= REFRESH_INTERVAL_MS) {
        fetchEvents()
      }
    }

    fetchEvents()
    const timer = setInterval(fetchEvents, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      isMountedRef.current = false
      abortControllerRef.current?.abort()
      // 진행 중이던 요청은 방금 abort()로 중단됐으므로, 다음 마운트(StrictMode 재마운트 포함)가
      // isFetchingRef 가드에 막히지 않고 즉시 새로 조회할 수 있도록 여기서 함께 해제한다.
      // (구 요청 자신의 finally도 뒤늦게 실행되지만, 위 fetchEvents의 controller 비교 덕분에
      //  그 시점엔 이미 새 컨트롤러로 교체돼 있어 새 요청의 진행 상태를 건드리지 않는다.)
      isFetchingRef.current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchEvents])

  // 5) Dashboard가 새로 보이게 된 순간(사진모드 tap-reveal / 정보모드 전환 공통) 오래됐으면 재조회.
  // 최초 마운트 시점은 위 effect가 이미 처리하므로 여기서는 건너뛴다.
  const prevDashboardHiddenRef = useRef<boolean | null>(null)
  useEffect(() => {
    const prev = prevDashboardHiddenRef.current
    prevDashboardHiddenRef.current = dashboardHidden
    if (prev === null) return
    const dashboardJustRevealed = prev === true && dashboardHidden === false
    if (dashboardJustRevealed && Date.now() - lastFetchedAtRef.current >= REFRESH_INTERVAL_MS) {
      fetchEvents()
    }
  }, [dashboardHidden, fetchEvents])

  // 수동 새로고침(도크 ↻ 버튼)에서 쓴다 — fetchEvents 자체가 이미 "진행 중인 요청이 있으면
  // 무시"만 할 뿐 마지막 조회 이후 경과 시간은 따지지 않으므로, 그대로 넘겨주면 항상 즉시
  // 재조회하는 "강제 새로고침"으로 쓸 수 있다.
  return { events, status, refresh: fetchEvents }
}
