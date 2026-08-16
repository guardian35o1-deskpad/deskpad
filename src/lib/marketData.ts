export interface MarketIndex {
  name: string
  value: string
  changePercent: number
  // 스파크라인 표시용 더미 추이 데이터 (마지막 값이 현재값과 일치)
  history: number[]
}

// TODO: 실제 증시 API 연동 예정. 현재는 샘플 데이터만 사용.
export const SAMPLE_MARKET: MarketIndex[] = [
  {
    name: 'KOSPI',
    value: '2,650.32',
    changePercent: 0.42,
    history: [2610, 2618, 2605, 2622, 2631, 2625, 2640, 2635, 2648, 2642, 2650.32],
  },
  {
    name: 'NASDAQ',
    value: '17,850.10',
    changePercent: -0.18,
    history: [17920, 17905, 17940, 17890, 17910, 17875, 17860, 17900, 17870, 17885, 17850.1],
  },
  {
    name: 'S&P 500',
    value: '5,540.55',
    changePercent: 0.11,
    history: [5520, 5515, 5528, 5531, 5522, 5535, 5525, 5538, 5530, 5533, 5540.55],
  },
  {
    name: 'DOW JONES',
    value: '39,120.80',
    changePercent: -0.05,
    history: [39200, 39180, 39210, 39150, 39190, 39160, 39175, 39130, 39145, 39160, 39120.8],
  },
]
