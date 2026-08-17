import type { MarketProvider, MarketQuote } from './types'
import { WATCHED_INDICES } from './types'

// netlify/functions/market.ts(서버 측 프록시)가 돌려주는 정규화된 형태.
// 원본 Naver/Yahoo 응답 필드명은 이 파일이 전혀 알 필요가 없다 — 서버가 이미 정규화해서 준다.
interface MarketApiQuote {
  id: string
  name: string
  value: number | null
  change: number | null
  changePercent: number | null
  marketStatus: string | null
  updatedAt: string | null
  history: number[]
  ok: boolean
}

interface MarketApiResponse {
  quotes: MarketApiQuote[]
  updatedAt: string
}

// 실제 API를 붙이는 provider. /api/market 하나만 호출하고, 응답을 기존 MarketQuote[] 형태로
// 변환한다 — marketService.ts/useMarket.ts/Market.tsx는 이 provider가 mock인지 실제인지 몰라도 된다.
export const liveMarketProvider: MarketProvider = {
  isMock: false,

  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    const res = await fetch('/api/market', { cache: 'no-store' })
    if (!res.ok) {
      throw new Error(`시장 데이터 API 오류 (HTTP ${res.status})`)
    }

    const data = (await res.json()) as MarketApiResponse
    const wanted = new Set(symbols)

    // ok:false(이번 조회 실패)인 항목은 결과 배열에서 아예 뺀다 — marketService.ts가
    // 이미 "fresh에 없으면 캐시된 마지막 값을 쓴다"는 병합 로직을 갖고 있으므로,
    // 여기서 빼두기만 하면 그 로직이 자동으로 지수별 마지막 정상값을 대신 채워준다.
    return data.quotes
      .filter((quote) => quote.ok && wanted.has(quote.id) && typeof quote.value === 'number')
      .map((quote) => {
        const meta = WATCHED_INDICES.find((item) => item.symbol === quote.id)
        const value = quote.value as number
        const change = quote.change ?? 0
        const changePercent = quote.changePercent ?? 0

        const mapped: MarketQuote = {
          symbol: quote.id,
          name: meta?.name ?? quote.name,
          price: value,
          change,
          changePercent,
          history: quote.history,
          updatedAt: quote.updatedAt ?? data.updatedAt,
        }
        return mapped
      })
  },
}
