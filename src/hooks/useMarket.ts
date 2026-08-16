import { useEffect, useState } from 'react'
import type { MarketQuote } from '../lib/market/types'
import { fetchMarketQuotes, readMarketCache } from '../lib/market/marketService'
import { activeMarketProvider } from '../lib/market/marketProvider'

const REFRESH_INTERVAL_MS = 20 * 60 * 1000 // 20분마다 갱신 (휴장 시간엔 내부적으로 건너뜀)

interface UseMarketResult {
  quotes: MarketQuote[]
  updatedAt: string | null
  stale: boolean
  loading: boolean
  error: boolean
  // 지금 화면에 표시 중인 값이 실제 API가 아닌 샘플(mock) 데이터인지 여부.
  isMock: boolean
}

export function useMarket(): UseMarketResult {
  const cached = readMarketCache()
  const [quotes, setQuotes] = useState<MarketQuote[]>(cached?.quotes ?? [])
  const [updatedAt, setUpdatedAt] = useState<string | null>(cached?.updatedAt ?? null)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(quotes.length === 0)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const result = await fetchMarketQuotes()
        if (cancelled) return
        setQuotes(result.quotes)
        setUpdatedAt(result.updatedAt)
        setStale(result.stale)
        setError(false)
      } catch (err) {
        if (cancelled) return
        console.error('시장 데이터를 표시할 수 없습니다.', err)
        setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    refresh()
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return { quotes, updatedAt, stale, loading, error, isMock: activeMarketProvider.isMock }
}
