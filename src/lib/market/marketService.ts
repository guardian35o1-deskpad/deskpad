import type { MarketQuote } from './types'
import { WATCHED_INDICES } from './types'
import { activeMarketProvider } from './marketProvider'
import { isMarketOpen } from './marketHours'

const CACHE_KEY = 'deskpad:market-cache'

interface MarketCache {
  quotes: MarketQuote[]
  updatedAt: string
}

export function readMarketCache(): MarketCache | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as MarketCache
  } catch (err) {
    console.error('시장 데이터 캐시를 읽지 못했습니다.', err)
    return null
  }
}

function writeMarketCache(cache: MarketCache) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (err) {
    console.error('시장 데이터 캐시를 저장하지 못했습니다.', err)
  }
}

export interface MarketFetchResult {
  quotes: MarketQuote[]
  updatedAt: string
  stale: boolean
}

// 장이 열려 있는 지수만 새로 조회하고, 닫혀 있는 지수는 캐시된 마지막 값을 그대로 쓴다.
// API 호출이 실패해도 캐시된 마지막 값 + "OO:OO 기준" 표시로 화면이 깨지지 않게 한다.
export async function fetchMarketQuotes(): Promise<MarketFetchResult> {
  const cache = readMarketCache()

  const openSymbols = WATCHED_INDICES.filter((item) => isMarketOpen(item.exchange)).map((item) => item.symbol)

  if (openSymbols.length === 0 && cache) {
    return { quotes: cache.quotes, updatedAt: cache.updatedAt, stale: true }
  }

  try {
    // /api/market은 항상 4개 지수를 한 번에 반환하는 단일 호출이라(지수별로 따로 요청하지
    // 않음), 여기서 "열려 있는 지수만" 요청 범위를 좁혀도 실제 API 호출 횟수는 줄지 않는다.
    // 예전에는 이 값이 좁혀지면 닫힌 지수의 신선한 응답을 provider가 filter로 걸러내
    // 버렸는데(예: 한국장만 열려 있을 때 미국장 값이 왔어도 버림), 캐시가 아직 없는
    // 최초 로딩에서는 그 값이 사라져 카드가 빈 채로 남는 결과가 됐다. 항상 전체 지수를
    // 요청해서, provider가 돌려준(ok:true) 값은 장 상태와 무관하게 그대로 받아들인다.
    const freshQuotes = await activeMarketProvider.getQuotes(WATCHED_INDICES.map((item) => item.symbol))

    const merged = WATCHED_INDICES.map((item) => {
      const fresh = freshQuotes.find((quote) => quote.symbol === item.symbol)
      if (fresh) return fresh
      // 이 지수만 이번 조회에서 빠졌다(예: Yahoo는 됐는데 Naver만 실패) — 마지막으로
      // 성공했던 값을 stale:true로 표시해 그대로 쓴다. Market.tsx가 아주 작은 표시만 붙인다.
      const cachedQuote = cache?.quotes.find((quote) => quote.symbol === item.symbol)
      return cachedQuote ? { ...cachedQuote, stale: true } : null
    }).filter((quote): quote is MarketQuote => quote !== null)

    const updatedAt = new Date().toISOString()
    writeMarketCache({ quotes: merged, updatedAt })
    return { quotes: merged, updatedAt, stale: false }
  } catch (err) {
    console.error('시장 데이터를 가져오지 못했습니다.', err)
    if (cache) {
      // API 호출 자체가 실패한 경우(위 openSymbols===0 분기와 달리 "장이 닫혀서 안 부른 것"이
      // 아니라 진짜 실패) — 4개 전부 마지막 정상값이라는 걸 화면에서도 알 수 있게 표시한다.
      const staleQuotes = cache.quotes.map((quote) => ({ ...quote, stale: true }))
      return { quotes: staleQuotes, updatedAt: cache.updatedAt, stale: true }
    }
    throw err
  }
}
