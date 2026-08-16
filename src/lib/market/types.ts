export interface MarketQuote {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  history: number[]
  updatedAt: string // ISO 문자열
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
