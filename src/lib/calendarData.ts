import { addDays, formatDateKey, startOfDay } from './date'

// hospital: 실제 Google Calendar 일정 중 병원 키워드로 자동 분류된 일정(빨간색, 🏥).
// reservation: 기존 'checkup'(검진/예약)을 명확한 이름으로 정리한 것 — 병원 키워드에 안 걸리는
// 일반 예약. 실제 데이터에서 자동으로 붙는 카테고리는 현재 hospital/etc 두 가지뿐이고,
// work/reservation/personal/important는 향후 추가 분류 규칙이 생기면 쓸 수 있도록 유지한다.
export type EventCategory = 'hospital' | 'work' | 'reservation' | 'personal' | 'important' | 'etc'

export interface CalendarEvent {
  id: string
  date: string // YYYY-MM-DD
  time?: string // HH:mm
  title: string
  category: EventCategory
  location?: string
  status?: string
}

export const CATEGORY_ORDER: EventCategory[] = ['hospital', 'work', 'reservation', 'personal', 'important', 'etc']

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  hospital: '병원/건강',
  work: '업무/미팅',
  reservation: '예약',
  personal: '개인 일정',
  important: '중요',
  etc: '기타',
}

// hospital과 important 둘 다 "빨간 계열"이면 멀리서 구분이 안 되므로, hospital은 선명한 빨강,
// important는 주황에 가까운 빨강(red-orange)으로 명확히 갈랐다.
export const CATEGORY_COLORS: Record<EventCategory, string> = {
  hospital: '#ff3b30',
  work: '#34c77b',
  reservation: '#ffcc4d',
  personal: '#b388ff',
  important: '#ff8a3d',
  etc: '#9aa0a6',
}

// TODO: Google Calendar API 연동 예정. 지금은 오늘 날짜를 기준으로 만든 샘플 일정이다.
// 실제 연동 시 이 배열을 API에서 받아온 CalendarEvent[] 로 교체하면 나머지 로직은 그대로 쓸 수 있다.
const today = startOfDay(new Date())

export const SAMPLE_EVENTS: CalendarEvent[] = [
  { id: 'e1', date: formatDateKey(addDays(today, -12)), title: '정산과 전표', category: 'work' },
  { id: 'e2', date: formatDateKey(addDays(today, -8)), title: '휴무', category: 'etc' },
  { id: 'e3', date: formatDateKey(addDays(today, -4)), title: '치과 검진', category: 'reservation' },
  {
    id: 'e4',
    date: formatDateKey(today),
    time: '09:00',
    title: '차량 확인',
    category: 'work',
    location: '매장',
    status: '진행 전',
  },
  {
    id: 'e5',
    date: formatDateKey(today),
    time: '13:00',
    title: '점심',
    category: 'personal',
    location: '상무지구 맛집',
    status: '예정',
  },
  {
    id: 'e6',
    date: formatDateKey(today),
    time: '16:00',
    title: '미팅',
    category: 'work',
    location: '사무실 회의실',
    status: '예정',
  },
  {
    id: 'e7',
    date: formatDateKey(addDays(today, 3)),
    time: '10:00',
    title: '건강검진',
    category: 'hospital',
    location: '광주 OO병원',
    status: '예정',
  },
]
