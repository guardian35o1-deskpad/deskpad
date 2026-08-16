import { useEffect, useRef, useState } from 'react'
import { getWeatherEmoji } from '../lib/weatherIcons'

interface DailyForecast {
  label: string
  condition: string
  high: number
  low: number
}

interface WeatherData {
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

const REFRESH_INTERVAL_MS = 30 * 60 * 1000 // 30분마다 갱신

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

function Weather() {
  const [data, setData] = useState<WeatherData | null>(null)
  const [hasError, setHasError] = useState(false)
  // 마지막으로 갱신을 "시도"한 시각. 화면이 다시 활성화됐을 때 이 값 기준으로
  // 30분(REFRESH_INTERVAL_MS)이 지났으면 그때만 다시 불러온다(무조건 갱신하지 않음).
  const lastFetchedAtRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function fetchWeather() {
      lastFetchedAtRef.current = Date.now()
      try {
        const response = await fetch(WEATHER_URL, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`날씨 API 응답 오류: ${response.status}`)
        }
        const json = (await response.json()) as OpenMeteoResponse
        const parsed = parseWeatherResponse(json)
        if (cancelled) return
        if (!parsed) {
          throw new Error('날씨 API 응답 형식이 예상과 다릅니다.')
        }
        setData(parsed)
        setHasError(false)
      } catch (err) {
        if (cancelled) return
        console.error('날씨 정보를 가져오지 못했습니다.', err)
        // 이전에 정상적으로 받아온 데이터가 있으면 그대로 유지한다.
        setHasError(true)
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      // 오래 백그라운드에 있다가(iPad 화면이 꺼졌다 켜지는 등) 돌아왔을 때,
      // 마지막 갱신 시도로부터 30분 이상 지났으면 그때만 다시 불러온다.
      if (Date.now() - lastFetchedAtRef.current >= REFRESH_INTERVAL_MS) {
        fetchWeather()
      }
    }

    fetchWeather()
    const timer = setInterval(fetchWeather, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      controller.abort()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return (
    <section className="panel weather-card">
      {data ? (
        <>
          <div className="weather-card-location">📍 {data.location}</div>
          <div className="weather-now">
            <span className="weather-icon">{getWeatherEmoji(data.currentCondition)}</span>
            <div className="weather-now-text">
              <div className="weather-temp">{data.currentTemp}°C</div>
              <div className="weather-condition">{data.currentCondition}</div>
              <div className="weather-range">
                최고 {data.todayHigh}° / 최저 {data.todayLow}°
              </div>
            </div>
          </div>
          <ul className="weather-forecast">
            {data.forecast.map((day) => (
              <li className="weather-forecast-item" key={day.label}>
                <span className="forecast-label">{day.label}</span>
                <span className="forecast-icon">{getWeatherEmoji(day.condition)}</span>
                <span className="forecast-range">
                  {day.high}° / {day.low}°
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="weather-status">
          {hasError ? '날씨 정보를 불러올 수 없습니다' : '날씨 정보를 불러오는 중...'}
        </div>
      )}
    </section>
  )
}

export default Weather
