import { addDays, formatDateKey, startOfDay } from './date'

export type EventCategory = 'health' | 'work' | 'checkup' | 'personal' | 'important' | 'etc'

export interface CalendarEvent {
  id: string
  date: string // YYYY-MM-DD
  time?: string // HH:mm
  title: string
  category: EventCategory
  location?: string
  status?: string
}

export const CATEGORY_ORDER: EventCategory[] = ['health', 'work', 'checkup', 'personal', 'important', 'etc']

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  health: '병원/건강',
  work: '업무/미팅',
  checkup: '검진/예약',
  personal: '개인 일정',
  important: '중요',
  etc: '기타',
}

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  health: '#4d9fff',
  work: '#34c77b',
  checkup: '#ffcc4d',
  personal: '#b388ff',
  important: '#ff6b6b',
  etc: '#9aa0a6',
}

// TODO: Google Calendar API 연동 예정. 지금은 오늘 날짜를 기준으로 만든 샘플 일정이다.
// 실제 연동 시 이 배열을 API에서 받아온 CalendarEvent[] 로 교체하면 나머지 로직은 그대로 쓸 수 있다.
const today = startOfDay(new Date())

export const SAMPLE_EVENTS: CalendarEvent[] = [
  { id: 'e1', date: formatDateKey(addDays(today, -12)), title: '정산과 전표', category: 'work' },
  { id: 'e2', date: formatDateKey(addDays(today, -8)), title: '휴무', category: 'etc' },
  { id: 'e3', date: formatDateKey(addDays(today, -4)), title: '치과 검진', category: 'checkup' },
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
    category: 'health',
    location: '광주 OO병원',
    status: '예정',
  },
]
