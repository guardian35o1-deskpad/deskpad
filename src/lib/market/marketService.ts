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
    const symbolsToFetch = openSymbols.length > 0 ? openSymbols : WATCHED_INDICES.map((item) => item.symbol)
    const freshQuotes = await activeMarketProvider.getQuotes(symbolsToFetch)

    const merged = WATCHED_INDICES.map((item) => {
      const fresh = freshQuotes.find((quote) => quote.symbol === item.symbol)
      if (fresh) return fresh
      return cache?.quotes.find((quote) => quote.symbol === item.symbol) ?? null
    }).filter((quote): quote is MarketQuote => quote !== null)

    const updatedAt = new Date().toISOString()
    writeMarketCache({ quotes: merged, updatedAt })
    return { quotes: merged, updatedAt, stale: false }
  } catch (err) {
    console.error('시장 데이터를 가져오지 못했습니다.', err)
    if (cache) {
      return { quotes: cache.quotes, updatedAt: cache.updatedAt, stale: true }
    }
    throw err
  }
}
