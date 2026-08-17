import { getWeatherEmoji } from '../lib/weatherIcons'
import type { WeatherData } from '../hooks/useWeather'

interface WeatherProps {
  // 데이터/조회 로직은 useWeather.ts로 옮겨지고(App.tsx가 호출), 이 컴포넌트는 그 결과를
  // 그대로 그리기만 한다 — App.tsx의 refreshAll()이 날씨/캘린더/시장 세 소스를 한 번에
  // 새로고침하려면 세 훅이 모두 App.tsx 레벨에서 호출돼야 하기 때문(공통 refresh 설계).
  data: WeatherData | null
  hasError: boolean
}

function Weather({ data, hasError }: WeatherProps) {
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
