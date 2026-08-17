import { useCallback, useEffect, useRef, useState } from 'react'

export interface DailyForecast {
  label: string
  condition: string
  high: number
  low: number
}

export interface WeatherData {
  location: string
  currentTemp: number
  currentCondition: string
  todayHigh: number
  todayLow: number
  forecast: DailyForecast[]
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number
    weather_code?: number
  }
  daily?: {
    time?: string[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    weather_code?: number[]
  }
}

// 광주광역시 고정 좌표
const LOCATION_NAME = '광주광역시'
const LATITUDE = 35.1595
const LONGITUDE = 126.8526

const WEATHER_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
  `&current=temperature_2m,weather_code` +
  `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
  `&timezone=Asia%2FSeoul&forecast_days=4`

// DeskPad 상시 규칙: 날씨는 30분마다 갱신(자동), 수동 새로고침은 이 주기와 무관하게 즉시 조회.
const REFRESH_INTERVAL_MS = 30 * 60 * 1000

const FORECAST_LABELS = ['내일', '모레', '글피']

// Open-Meteo(WMO) weather code -> 한국어 표시 텍스트
function getWeatherLabel(code: number | undefined): string {
  if (code === 0) return '맑음'
  if (code === 1) return '대체로 맑음'
  if (code === 2) return '구름 많음'
  if (code === 3) return '흐림'
  if (code === 45 || code === 48) return '안개'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67].includes(code ?? -1)) return '비'
  if ([80, 81, 82].includes(code ?? -1)) return '소나기'
  if ([71, 73, 75, 77, 85, 86].includes(code ?? -1)) return '눈'
  if ([95, 96, 99].includes(code ?? -1)) return '뇌우'
  return '알 수 없음'
}

function parseWeatherResponse(raw: OpenMeteoResponse): WeatherData | null {
  const current = raw.current
  const daily = raw.daily

  if (
    typeof current?.temperature_2m !== 'number' ||
    !daily?.temperature_2m_max?.length ||
    !daily?.temperature_2m_min?.length
  ) {
    return null
  }

  const forecast: DailyForecast[] = FORECAST_LABELS.map((label, i) => {
    const dayIndex = i + 1 // 0번 인덱스는 오늘
    return {
      label,
      condition: getWeatherLabel(daily.weather_code?.[dayIndex]),
      high: Math.round(daily.temperature_2m_max?.[dayIndex] ?? NaN),
      low: Math.round(daily.temperature_2m_min?.[dayIndex] ?? NaN),
    }
  }).filter((day) => !Number.isNaN(day.high) && !Number.isNaN(day.low))

  return {
    location: LOCATION_NAME,
    currentTemp: Math.round(current.temperature_2m),
    currentCondition: getWeatherLabel(current.weather_code),
    todayHigh: Math.round(daily.temperature_2m_max[0]),
    todayLow: Math.round(daily.temperature_2m_min[0]),
    forecast,
  }
}

export interface UseWeatherResult {
  data: WeatherData | null
  hasError: boolean
  loading: boolean
  // 수동 새로고침(도크 ↻ 버튼)에서 쓴다. force=true면 마지막 조회 이후 경과 시간과 무관하게
  // 즉시 다시 조회한다(단, 이미 진행 중인 요청이 있으면 그 요청이 끝날 때까지 중복 호출하지
  // 않는다 — fetchWeather 자체의 isFetchingRef 가드).
  refresh: (force?: boolean) => Promise<void>
}

// 원래 Weather.tsx 안에 있던 fetch 로직을 그대로 훅으로 분리한 것 — App.tsx가 refreshAll()에서
// 날씨/캘린더/시장 데이터를 한 번에 새로고침할 수 있으려면 세 소스 모두 App.tsx 레벨에서
// refresh 함수를 얻어야 한다(공통 refreshAll이 각 컴포넌트 내부로 직접 손을 뻗을 수 없으므로).
// 동작 자체(30분 주기, visibilitychange 재조회, 실패해도 이전 값 유지)는 전혀 바뀌지 않았다.
export function useWeather(): UseWeatherResult {
  const [data, setData] = useState<WeatherData | null>(null)
  const [hasError, setHasError] = useState(false)
  const [loading, setLoading] = useState(true)
  // 마지막으로 갱신을 "시도"한 시각. 화면이 다시 활성화됐을 때 이 값 기준으로
  // 30분(REFRESH_INTERVAL_MS)이 지났으면 그때만 다시 불러온다(무조건 갱신하지 않음).
  const lastFetchedAtRef = useRef(0)
  const isFetchingRef = useRef(false)
  const isMountedRef = useRef(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchWeather = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    lastFetchedAtRef.current = Date.now()

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch(WEATHER_URL, { signal: controller.signal, cache: 'no-store' })
      if (!isMountedRef.current) return
      if (!response.ok) {
        throw new Error(`날씨 API 응답 오류: ${response.status}`)
      }
      const json = (await response.json()) as OpenMeteoResponse
      const parsed = parseWeatherResponse(json)
      if (!isMountedRef.current) return
      if (!parsed) {
        throw new Error('날씨 API 응답 형식이 예상과 다릅니다.')
      }
      setData(parsed)
      setHasError(false)
    } catch (err) {
      if (!isMountedRef.current) return
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error('날씨 정보를 가져오지 못했습니다.', err)
      // 이전에 정상적으로 받아온 데이터가 있으면 그대로 유지한다.
      setHasError(true)
    } finally {
      if (abortControllerRef.current === controller) {
        isFetchingRef.current = false
      }
      if (isMountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      // 오래 백그라운드에 있다가(iPad 화면이 꺼졌다 켜지는 등) 돌아왔을 때,
      // 마지막 갱신 시도로부터 30분 이상 지났으면 그때만 다시 불러온다.
      if (Date.now() - lastFetchedAtRef.current >= REFRESH_INTERVAL_MS) {
        fetchWeather()
      }
    }

    function handleFocus() {
      if (Date.now() - lastFetchedAtRef.current >= REFRESH_INTERVAL_MS) {
        fetchWeather()
      }
    }

    fetchWeather()
    const timer = setInterval(fetchWeather, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      isMountedRef.current = false
      abortControllerRef.current?.abort()
      isFetchingRef.current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [fetchWeather])

  const refresh = useCallback(
    async (force = false) => {
      if (!force && Date.now() - lastFetchedAtRef.current < REFRESH_INTERVAL_MS) return
      await fetchWeather()
    },
    [fetchWeather],
  )

  return { data, hasError, loading, refresh }
}
