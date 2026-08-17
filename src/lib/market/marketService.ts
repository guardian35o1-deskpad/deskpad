import type { MarketQuote } from './types'
import { WATCHED_INDICES } from './types'
import { activeMarketProvider } from './marketProvider'
import { isMarketOpen } from './marketHours'

const CACHE_KEY = 'deskpad:market-cache'
// provider가 mock↔live로 바뀌거나 캐시 저장 형태 자체가 바뀔 때, 예전 세대의 캐시(특히
// 실데이터 연동 전 mock 고정값)를 절대 재사용하지 않기 위한 버전 값. 이 파일의 캐시 저장
// 형태를 바꿀 때마다 올린다.
const CACHE_VERSION = 2

type CacheSource = 'mock' | 'live'

interface MarketCache {
  version: number
  source: CacheSource
  quotes: MarketQuote[]
  updatedAt: string | null
}

function currentSource(): CacheSource {
  return activeMarketProvider.isMock ? 'mock' : 'live'
}

// 지금 활성 provider(mock/live)와 세대가 다르거나, 버전이 다르거나(옛 스키마), 모양이
// 이상한 캐시는 전부 "캐시 없음"과 동일하게 취급한다 — 실데이터 전환 직후 예전 mock
// 고정값(KOSPI 2,650.32 등)이 localStorage에 남아 있다가 그대로 화면에 나오는 문제를
// 막기 위함(실기기에서 실제로 발생한 문제).
export function readMarketCache(): MarketCache | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<MarketCache>
    if (parsed.version !== CACHE_VERSION || parsed.source !== currentSource()) return null
    if (!Array.isArray(parsed.quotes)) return null
    if (parsed.updatedAt !== null && typeof parsed.updatedAt !== 'string') return null
    return parsed as MarketCache
  } catch (err) {
    console.error('시장 데이터 캐시를 읽지 못했습니다.', err)
    return null
  }
}

function writeMarketCache(quotes: MarketQuote[], updatedAt: string | null) {
  try {
    const cache: MarketCache = { version: CACHE_VERSION, source: currentSource(), quotes, updatedAt }
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (err) {
    console.error('시장 데이터 캐시를 저장하지 못했습니다.', err)
  }
}

export interface MarketFetchResult {
  quotes: MarketQuote[]
  updatedAt: string | null
  stale: boolean
}

// 화면의 "OO:OO 기준"은 앱이 fetch를 마친 시각이 아니라 실제 시장 데이터 자체의 updatedAt
// (예: Yahoo의 regularMarketTime, 또는 Naver가 준 실제 거래 시각)만 쓴다 — 여러 지수 중
// 가장 최근 값을 고르고, 단 하나도 실제 시각을 모르면(예: Naver가 시각을 안 주고 Yahoo도
// 실패한 경우) null을 돌려준다. 예전에는 여기서 이 함수를 호출한 시점(fetch 성공 시각)으로
// 대체했는데, 그러면 며칠 전 종가 데이터에도 "방금 갱신됨"처럼 보이는 오해를 낳았다(휴장일에
// "18:42 기준"으로 보이던 문제) — 모르면 모른다고 하는 게 낫다는 원칙에 따라 null을 그대로
// 둔다. null일 때 화면에 어떻게 보일지는 Market.tsx의 formatUpdatedAt()이 결정한다.
function pickDisplayUpdatedAt(quotes: MarketQuote[]): string | null {
  const timestamps = quotes
    .map((quote) => quote.updatedAt)
    .filter((value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
  if (timestamps.length === 0) return null
  return timestamps.reduce((latest, current) => (Date.parse(current) > Date.parse(latest) ? current : latest))
}

// 장이 열려 있는 지수만 새로 조회하고, 닫혀 있는 지수는 캐시된 마지막 값을 그대로 쓴다.
// 단, "장이 전부 닫혀 있으면 캐시를 그대로 쓴다"는 최적화는 이미 한 번이라도 지금 세대(live)
// 데이터를 성공적으로 받아온 뒤(=readMarketCache()가 유효한 캐시를 돌려줄 때)에만 적용한다.
// 그렇지 않으면(앱 최초 실행, 또는 mock→live 전환 직후라 캐시가 버려진 경우) 마침 이 순간
// 장이 닫혀 있으면 /api/market을 한 번도 호출하지 않고 "데이터 없음"에 머무르게 된다 —
// 최초 1회는 장 상태와 무관하게 반드시 호출해 각 지수의 최신 종가를 확보한다.
//
// force=true(사용자가 도크의 ↻ 버튼을 직접 눌렀을 때)는 위 "장이 전부 닫혀 있으면 캐시를
// 그대로 쓴다" 최적화 자체를 건너뛰고 무조건 /api/market을 다시 호출한다 — 수동 새로고침은
// "지금 가능한 가장 최신 값"을 보장해야 하기 때문. 휴장 중이어도 Naver/Yahoo는 마지막
// 거래일 종가를 그대로 돌려주므로(37번), 강제 조회해도 잘못된 값으로 덮어써지는 일은 없다.
export async function fetchMarketQuotes(force = false): Promise<MarketFetchResult> {
  const cache = readMarketCache()

  const openSymbols = WATCHED_INDICES.filter((item) => isMarketOpen(item.exchange)).map((item) => item.symbol)

  if (!force && openSymbols.length === 0 && cache) {
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
      // 성공했던 "같은 세대(live)" 값이 있으면 stale:true로 그대로 쓴다. cache는
      // readMarketCache()에서 이미 세대/버전이 검증됐으므로, 여기서 옛 mock 값이
      // fallback으로 섞여 들어올 일은 없다. Market.tsx가 아주 작은 표시만 붙인다.
      const cachedQuote = cache?.quotes.find((quote) => quote.symbol === item.symbol)
      return cachedQuote ? { ...cachedQuote, stale: true } : null
    }).filter((quote): quote is MarketQuote => quote !== null)

    const updatedAt = pickDisplayUpdatedAt(merged)
    writeMarketCache(merged, updatedAt)
    return { quotes: merged, updatedAt, stale: false }
  } catch (err) {
    console.error('시장 데이터를 가져오지 못했습니다.', err)
    if (cache) {
      // API 호출 자체가 실패한 경우(위 openSymbols===0 분기와 달리 "장이 닫혀서 안 부른 것"이
      // 아니라 진짜 실패) — 4개 전부 마지막 정상값(항상 live 세대)이라는 걸 화면에서도 알 수
      // 있게 표시한다. cache가 없으면(한 번도 live로 성공한 적 없음) 그대로 에러를 전파한다 —
      // 과거 mock 값을 fallback으로 절대 쓰지 않는다.
      const staleQuotes = cache.quotes.map((quote) => ({ ...quote, stale: true }))
      return { quotes: staleQuotes, updatedAt: cache.updatedAt, stale: true }
    }
    throw err
  }
}
