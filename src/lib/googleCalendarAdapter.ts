import type { CalendarEvent } from './calendarData'
import { formatDateKey } from './date'

// netlify/functions/calendar-events.ts가 돌려주는 최소 형태.
// 이 파일과 그 함수 사이의 계약(타입)이므로, 함수 쪽 응답 형태를 바꾸면 여기도 같이 바꿔야 한다.
export interface GoogleCalendarEventDTO {
  id: string
  title: string
  start: string // 'YYYY-MM-DD'(종일) 또는 ISO datetime
  end: string
  allDay: boolean
  location?: string
  description?: string
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

// ISO datetime의 최종 "한국 로컬 날짜/시간" 변환은 여기, 즉 실제 iPad 브라우저(KST)에서 한다.
// 서버 함수는 리전의 로컬 타임존을 신뢰할 수 없어 이 변환을 하지 않고 원문 문자열만 넘긴다.
//
// 카테고리 자동분류는 다음 단계로 미루고, 우선 모든 실제 일정을 'etc'(기타, 회색 점)로 표시한다.
export function toCalendarEvents(dtos: GoogleCalendarEventDTO[]): CalendarEvent[] {
  return dtos.map((dto): CalendarEvent => {
    if (dto.allDay) {
      return {
        id: `gcal-${dto.id}`,
        date: dto.start,
        title: dto.title,
        category: 'etc',
        location: dto.location,
      }
    }
    const startDate = new Date(dto.start)
    return {
      id: `gcal-${dto.id}`,
      date: formatDateKey(startDate),
      time: `${pad2(startDate.getHours())}:${pad2(startDate.getMinutes())}`,
      title: dto.title,
      category: 'etc',
      location: dto.location,
    }
  })
}
