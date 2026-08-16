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

// 병원 관련 일정 자동 분류에 쓰는 키워드. title(summary)/location/description 중
// 하나라도 이 키워드를 포함하면(대소문자 무관) 'hospital' 카테고리로 분류한다.
// Google Calendar 원본 데이터는 전혀 건드리지 않고, DeskPad가 화면에 표시할 때만 분류한다.
// 향후 키워드를 추가/조정하고 싶으면 이 배열만 수정하면 된다.
export const HOSPITAL_KEYWORDS = [
  '병원',
  '의원',
  '클리닉',
  '진료',
  '검진',
  '건강검진',
  '내과',
  '외과',
  '치과',
  '안과',
  '정형외과',
  '대장',
  'CT',
  'MRI',
  '항암',
  '채혈',
  '검사',
  '예약진료',
] as const

function isHospitalEvent(dto: GoogleCalendarEventDTO): boolean {
  const haystack = `${dto.title} ${dto.location ?? ''} ${dto.description ?? ''}`.toLowerCase()
  return HOSPITAL_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()))
}

// ISO datetime의 최종 "한국 로컬 날짜/시간" 변환은 여기, 즉 실제 iPad 브라우저(KST)에서 한다.
// 서버 함수는 리전의 로컬 타임존을 신뢰할 수 없어 이 변환을 하지 않고 원문 문자열만 넘긴다.
//
// 카테고리 자동분류는 병원 키워드만 우선 적용한다 — 병원 키워드에 걸리면 'hospital'(빨강),
// 그 외에는 지금까지처럼 'etc'(기타, 회색)로 표시한다. work/personal/important 등 나머지
// 카테고리의 자동분류는 아직 보류(다음 단계에서 논의).
export function toCalendarEvents(dtos: GoogleCalendarEventDTO[]): CalendarEvent[] {
  return dtos.map((dto): CalendarEvent => {
    const category = isHospitalEvent(dto) ? 'hospital' : 'etc'
    if (dto.allDay) {
      return {
        id: `gcal-${dto.id}`,
        date: dto.start,
        title: dto.title,
        category,
        location: dto.location,
      }
    }
    const startDate = new Date(dto.start)
    return {
      id: `gcal-${dto.id}`,
      date: formatDateKey(startDate),
      time: `${pad2(startDate.getHours())}:${pad2(startDate.getMinutes())}`,
      title: dto.title,
      category,
      location: dto.location,
    }
  })
}
