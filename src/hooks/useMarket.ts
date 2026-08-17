import { useCallback, useEffect, useRef, useState } from 'react'
import type { MarketQuote } from '../lib/market/types'
import { fetchMarketQuotes, readMarketCache } from '../lib/market/marketService'
import { activeMarketProvider } from '../lib/market/marketProvider'

// 장중에는 1분마다 갱신한다(요구사항). 장이 전부 닫혀 있으면 marketService.fetchMarketQuotes()가
// 이미 "열린 지수가 하나도 없고 캐시가 있으면 네트워크 호출 없이 캐시를 그대로 반환"하므로,
// 이 타이머를 그대로 1분 간격으로 유지해도 휴장 시간에 불필요한 API 호출이 실제로 발생하지
// 않는다(marketService.ts 자체 로직, 이 파일에서 따로 손댈 필요 없음).
const REFRESH_INTERVAL_MS = 60 * 1000

interface UseMarketResult {
  quotes: MarketQuote[]
  updatedAt: string | null
  stale: boolean
  loading: boolean
  error: boolean
  // 지금 화면에 표시 중인 값이 실제 API가 아닌 샘플(mock) 데이터인지 여부.
  isMock: boolean
  // 수동 새로고침(도크 ↻ 버튼)에서 쓴다. force=true면 "장 마감 시 캐시 재사용" 최적화를
  // 건너뛰고 /api/market을 무조건 다시 호출한다(marketService.fetchMarketQuotes 참고).
  refresh: (force?: boolean) => Promise<void>
}

// 자동 갱신 경로(useCalendarEvents.ts와 동일한 원칙):
// 1) 최초 마운트 시 즉시 조회
// 2) 1분마다 주기적으로 조회
// 3) 화면이 다시 켜지면(visibilitychange) 무조건 즉시 조회
// 4) 창에 focus가 돌아왔을 때 마지막 조회로부터 1분 이상 지났으면 조회
// API 실패는 marketService.ts가 지수별로 마지막 정상값을 유지해주므로, 여기서는
// "한 번도 못 받아온 경우"에만 error 상태를 노출한다.
export function useMarket(): UseMarketResult {
  const cached = readMarketCache()
  const [quotes, setQuotes] = useState<MarketQuote[]>(cached?.quotes ?? [])
  const [updatedAt, setUpdatedAt] = useState<string | null>(cached?.updatedAt ?? null)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(quotes.length === 0)
  const [error, setError] = useState(false)
  const isFetchingRef = useRef(false)
  const lastFetchedAtRef = useRef(0)
  const isMountedRef = useRef(true)
  const hasQuotesRef = useRef(quotes.length > 0)

  const refresh = useCallback(async (force = false) => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    lastFetchedAtRef.current = Date.now()

    try {
      const result = await fetchMarketQuotes(force)
      if (!isMountedRef.current) return
      setQuotes(result.quotes)
      hasQuotesRef.current = result.quotes.length > 0
      setUpdatedAt(result.updatedAt)
      setStale(result.stale)
      setError(false)
    } catch (err) {
      if (!isMountedRef.current) return
      console.error('시장 데이터를 표시할 수 없습니다.', err)
      // 이전에 정상적으로 받아온 데이터가 있으면 화면은 그대로 유지하고(카드가 사라지지 않게),
      // 한 번도 받아온 적이 없을 때만 에러 상태를 노출한다.
      if (!hasQuotesRef.current) setError(true)
    } finally {
      isFetchingRef.current = false
      if (isMountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      refresh()
    }

    function handleFocus() {
      if (Date.now() - lastFetchedAtRef.current >= REFRESH_INTERVAL_MS) {
        refresh()
      }
    }

    refresh()
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      isMountedRef.current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [refresh])

  return { quotes, updatedAt, stale, loading, error, isMock: activeMarketProvider.isMock, refresh }
}
