export interface MarketQuote {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  // 실제 API에서 안정적인 인트라데이 시세열을 확보하지 못한 지수는 history를 비워둔다.
  // Market.tsx는 history가 비어 있으면(길이 0~1) 미니 그래프를 그리지 않고 숨긴다 —
  // 가짜/추정 그래프를 그리지 않기 위함.
  history: number[]
  // 이 지수 값 자체의 실제 시장 데이터 시각(ISO 문자열). 소스가 실제 시각을 안 주는 경우
  // (예: Naver가 시각 필드를 안 주거나 파싱 실패) null — 이때 "언제 값인지 안다고 지어내지
  // 않는다"는 원칙에 따라 fetch 실행 시각 등으로 대체하지 않는다. Market.tsx가 null이면
  // "OO:OO 기준" 대신 그 사실 자체를 작게 표시한다.
  updatedAt: string | null
  // 이번 갱신 시도가 실패해서 마지막으로 성공했던 값을 그대로 보여주고 있으면 true.
  // Market.tsx가 아주 작은 "지연" 표시를 붙이는 데만 쓴다(카드 레이아웃은 바꾸지 않음).
  stale?: boolean
}

export type Exchange = 'KRX' | 'US'

export interface WatchedIndex {
  symbol: string
  name: string
  exchange: Exchange
}

// 탁상 디스플레이 용도라 처음부터 너무 많은 종목을 넣지 않는다.
// TODO: 나중에 원/달러(FX) 등을 추가할 수 있지만, 지금은 지수 4개만 다룬다.
export const WATCHED_INDICES: WatchedIndex[] = [
  { symbol: 'KOSPI', name: 'KOSPI', exchange: 'KRX' },
  { symbol: 'KOSDAQ', name: 'KOSDAQ', exchange: 'KRX' },
  { symbol: 'SPX', name: 'S&P 500', exchange: 'US' },
  { symbol: 'IXIC', name: 'NASDAQ', exchange: 'US' },
]

// Market.tsx는 이 인터페이스만 알면 되고, 실제 데이터가 어디서 오는지는 몰라도 된다.
// isMock이 true인 provider가 활성화된 동안에는 화면에 "OO:OO 기준" 대신
// "샘플 데이터" 표시를 띄워, 가짜 값을 실제 시세로 착각하지 않게 한다.
export interface MarketProvider {
  readonly isMock: boolean
  getQuotes(symbols: string[]): Promise<MarketQuote[]>
}
