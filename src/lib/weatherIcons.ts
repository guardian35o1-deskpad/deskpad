// 날씨 상태 한국어 텍스트 -> 이모지 아이콘 매핑
// 외부 아이콘 라이브러리 없이 iOS Safari가 기본 지원하는 이모지 글리프만 사용한다.
const WEATHER_EMOJI: Record<string, string> = {
  맑음: '☀️',
  '대체로 맑음': '🌤️',
  '구름 많음': '⛅',
  흐림: '☁️',
  안개: '🌫️',
  비: '🌧️',
  소나기: '🌦️',
  눈: '❄️',
  뇌우: '⛈️',
}

export function getWeatherEmoji(condition: string): string {
  return WEATHER_EMOJI[condition] ?? '🌡️'
}
