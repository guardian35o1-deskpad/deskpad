import type { MarketProvider, MarketQuote } from './types'
import { WATCHED_INDICES } from './types'

// TODO: 실제 증시 API 연동 예정.
// 아직 실제 데이터가 아니므로 값을 고정해두고(실시간처럼 흔들리지 않음),
// isMock: true로 표시해 Market.tsx가 "샘플 데이터" 배지를 보여주게 한다.
// 실제 API로 교체할 때는 marketProvider.ts의 activeMarketProvider만 바꾸면 된다.
const FIXED_QUOTES: Record<string, { price: number; change: number; changePercent: number }> = {
  KOSPI: { price: 2650.32, change: 11.07, changePercent: 0.42 },
  KOSDAQ: { price: 845.1, change: 2.35, changePercent: 0.28 },
  SPX: { price: 5540.55, change: 6.1, changePercent: 0.11 },
  IXIC: { price: 17850.1, change: -32.4, changePercent: -0.18 },
}

const FIXED_HISTORY: Record<string, number[]> = {
  KOSPI: [2610, 2618, 2605, 2622, 2631, 2625, 2640, 2635, 2648, 2642, 2650.32],
  KOSDAQ: [833, 836, 830, 838, 841, 837, 843, 840, 846, 842, 845.1],
  SPX: [5520, 5515, 5528, 5531, 5522, 5535, 5525, 5538, 5530, 5533, 5540.55],
  IXIC: [17920, 17905, 17940, 17890, 17910, 17875, 17860, 17900, 17870, 17885, 17850.1],
}

export const mockMarketProvider: MarketProvider = {
  isMock: true,

  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    const quotes: MarketQuote[] = []

    for (const symbol of symbols) {
      const meta = WATCHED_INDICES.find((item) => item.symbol === symbol)
      const fixed = FIXED_QUOTES[symbol]
      const history = FIXED_HISTORY[symbol]
      if (!meta || !fixed || !history) continue

      quotes.push({
        symbol,
        name: meta.name,
        price: fixed.price,
        change: fixed.change,
        changePercent: fixed.changePercent,
        history,
        updatedAt: new Date().toISOString(),
      })
    }

    return quotes
  },
}
