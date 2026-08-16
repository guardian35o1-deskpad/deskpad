// DeskPad 프론트엔드가 주기적으로 호출하는 실제 데이터 엔드포인트.
// 저장된 refresh_token으로 access_token을 갱신한 뒤, primary 캘린더의 이번 달~다음 달 말
// 일정을 가져와 앱이 다루기 쉬운 최소 형태로 변환해 돌려준다.
// 날짜/시간의 최종 "한국 로컬 날짜" 변환은 여기서 하지 않는다 — 이 함수는 실행 리전의
// 로컬 타임존을 신뢰할 수 없으므로, ISO 문자열을 그대로 넘기고 실제 기기(iPad, KST)의
// 브라우저에서 최종 변환한다.
import { readGoogleEnv, refreshAccessToken } from './lib/googleAuth.ts'
import { readRefreshToken } from './lib/tokenStore.ts'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

interface GoogleApiEventTime {
  date?: string
  dateTime?: string
}

interface GoogleApiEvent {
  id: string
  summary?: string
  location?: string
  description?: string
  start?: GoogleApiEventTime
  end?: GoogleApiEventTime
}

export interface CalendarEventDTO {
  id: string
  title: string
  start: string // 'YYYY-MM-DD'(종일) 또는 ISO datetime
  end: string
  allDay: boolean
  location?: string
  description?: string
}

function toDTO(event: GoogleApiEvent): CalendarEventDTO | null {
  const start = event.start?.dateTime ?? event.start?.date
  const end = event.end?.dateTime ?? event.end?.date
  if (!start || !end) return null
  return {
    id: event.id,
    title: event.summary ?? '(제목 없음)',
    start,
    end,
    allDay: !event.start?.dateTime,
    location: event.location,
    description: event.description,
  }
}

// 이번 달 1일 00:00(KST) ~ 다음 달 말일 24:00(KST)를 UTC ISO 문자열로 계산한다.
// 함수 실행 리전의 로컬 타임존에 의존하지 않도록 UTC 기준 계산 후 KST 오프셋을 직접 보정한다.
function getSeoulMonthRangeUtcIso(): { timeMin: string; timeMax: string } {
  const nowUtcMs = Date.now()
  const kstNowMs = nowUtcMs + KST_OFFSET_MS
  const kstNow = new Date(kstNowMs)
  const year = kstNow.getUTCFullYear()
  const month = kstNow.getUTCMonth()

  const startOfThisMonthKstMs = Date.UTC(year, month, 1, 0, 0, 0)
  const startOfMonthAfterNextKstMs = Date.UTC(year, month + 2, 1, 0, 0, 0)

  const timeMin = new Date(startOfThisMonthKstMs - KST_OFFSET_MS).toISOString()
  const timeMax = new Date(startOfMonthAfterNextKstMs - KST_OFFSET_MS).toISOString()
  return { timeMin, timeMax }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    // 상시 켜두는 탁상 디스플레이가 1분마다 이 엔드포인트를 호출하므로, 중간에 오래된 응답이
    // 캐시되어 새 일정이 반영되지 않는 일이 없도록 명시적으로 no-store를 지정한다.
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export default async () => {
  let refreshToken: string | null
  try {
    refreshToken = await readRefreshToken()
  } catch (err) {
    return json({ error: 'store_error', message: (err as Error).message }, 500)
  }

  if (!refreshToken) {
    return json({ error: 'not_connected' }, 401)
  }

  try {
    const env = readGoogleEnv()
    const tokens = await refreshAccessToken(env, refreshToken)
    const { timeMin, timeMax } = getSeoulMonthRangeUtcIso()

    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeZone: 'Asia/Seoul',
      timeMin,
      timeMax,
      maxResults: '250',
    })

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Google Calendar API 오류 (${response.status}): ${text}`)
    }

    const data = (await response.json()) as { items?: GoogleApiEvent[] }
    const events = (data.items ?? [])
      .map(toDTO)
      .filter((event): event is CalendarEventDTO => event !== null)

    return json({ events }, 200)
  } catch (err) {
    return json({ error: 'fetch_failed', message: (err as Error).message }, 502)
  }
}

export const config = {
  path: '/api/calendar-events',
}
