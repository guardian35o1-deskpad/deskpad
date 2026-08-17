// DeskPad 하단 주가/지수 카드용 시장 데이터 프록시.
// 브라우저가 아니라 이 함수(Netlify Functions, 서버 측)가 Naver/Yahoo를 직접 호출하므로
// - 브라우저 CORS 제약을 받지 않는다(CORS는 브라우저 전용 제약이라 서버-서버 호출엔 애초에 적용되지 않음).
// - API 키가 없는 소스만 쓰므로 프론트 코드에 노출될 비밀값 자체가 없다.
//
// 중요(정직하게 남겨두는 한계): 이 함수를 작성한 시점에 개발 클라우드 샌드박스에서
// finance.yahoo.com/naver.com에 대한 네트워크 접근 자체가 막혀 있어(사내 네트워크 allowlist),
// 실제 배포 환경(Netlify)에서 라이브 응답을 직접 캡처해 검증하지 못했다.
// - Yahoo `v8/finance/chart` 스키마는 yfinance 등 여러 독립적인 실제 라이브러리 소스코드로
//   교차 확인해 필드명 신뢰도가 높다(meta.regularMarketPrice 등). 다만 Yahoo는 서버(비브라우저)
//   요청을 봇으로 판단해 429/999 등으로 막는 경우가 흔하다고 알려져 있어(이 역시 실제
//   Netlify 환경에서 직접 확인은 못 함), Referer 헤더 추가 + query1 실패 시 query2 미러
//   재시도를 방어적으로 넣어뒀다. 그래도 계속 "--"로 나오면 Netlify 함수 로그에서
//   "[market] Yahoo ... 조회 실패" 뒤의 상태코드/본문 일부를 확인해 원인(차단/타임아웃/스키마
//   변경 등)을 좁혀야 한다 — 이 부분은 여전히 추측이므로 로그의 실제 값이 최종 근거다.
// - Naver 쪽 정확한 필드명은 문서/2차 자료로만 확인했고 raw 캡처로 확정하지 못했다 —
//   그래서 lib/marketParsers.ts의 parseNaverItem()이 여러 세대의 후보 필드명을 순서대로
//   시도하는 방어적 파서로 작성돼 있다. 배포 후 KOSPI/KOSDAQ 값이 비어 있거나 이상하면
//   Netlify 함수 로그에서 "[market] Naver ... 조회 실패" 로그의 raw 미리보기를 보고
//   lib/marketParsers.ts의 후보 필드명 배열을 추가/수정하면 된다.
import {
  direction,
  parseNaverItem,
  parseYahooChartResult,
  type YahooChartResult,
} from './lib/marketParsers.ts'

interface NormalizedQuote {
  id: string
  name: string
  value: number | null
  change: number | null
  changePercent: number | null
  direction: 'up' | 'down' | 'flat'
  marketStatus: string | null
  updatedAt: string | null
  source: string
  ok: boolean
  history: number[]
  error?: string
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const FETCH_TIMEOUT_MS = 8000

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { headers, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------- Yahoo Finance (S&P 500 / NASDAQ Composite) ----------------
const YAHOO_SYMBOLS: Record<string, string> = {
  SPX: '^GSPC',
  IXIC: '^IXIC',
}
// query1이 봇 차단(429/999) 등으로 실패하면 query2 미러로 한 번 더 시도한다 — 둘 다 실제
// Yahoo Finance 호스트로 알려져 있으나, 어느 쪽이 서버(비브라우저) 요청을 더 잘 받아주는지는
// 이 세션에서 직접 확인하지 못했다(위 파일 상단 한계 참고). 실패 시 각 시도의 상태코드를
// 모아 로그에 남겨 원인을 좁힐 수 있게 한다.
const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']

async function fetchYahooChart(symbol: string): Promise<{ result: YahooChartResult | undefined; attempts: string[] }> {
  const attempts: string[] = []
  for (const host of YAHOO_HOSTS) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`
    try {
      const res = await fetchWithTimeout(url, {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        // 일부 봇 차단 규칙은 Referer 없는 서버발 요청을 더 쉽게 거부한다고 알려져 있어
        // 브라우저에서 이 엔드포인트를 호출할 때와 비슷한 모양으로 맞춰본다.
        Referer: 'https://finance.yahoo.com/',
      })
      if (!res.ok) {
        const bodyPreview = (await res.text().catch(() => '')).slice(0, 200)
        attempts.push(`${host}: HTTP ${res.status}${bodyPreview ? ` — ${bodyPreview}` : ''}`)
        continue
      }
      const data = (await res.json()) as {
        chart?: { result?: YahooChartResult[]; error?: { description?: string } | null }
      }
      if (data.chart?.error) {
        attempts.push(`${host}: chart.error ${data.chart.error.description ?? '(no description)'}`)
        continue
      }
      return { result: data.chart?.result?.[0], attempts }
    } catch (err) {
      attempts.push(`${host}: ${(err as Error).message}`)
    }
  }
  return { result: undefined, attempts }
}

async function fetchYahooIndex(id: string, name: string): Promise<NormalizedQuote> {
  const symbol = YAHOO_SYMBOLS[id]
  const base: Omit<NormalizedQuote, 'ok' | 'error'> = {
    id,
    name,
    value: null,
    change: null,
    changePercent: null,
    direction: 'flat',
    marketStatus: null,
    updatedAt: null,
    source: 'yahoo-chart',
    history: [],
  }

  try {
    const { result, attempts } = await fetchYahooChart(symbol)
    if (!result) {
      throw new Error(attempts.length ? attempts.join(' / ') : '알 수 없는 오류(응답 없음)')
    }

    const parsed = parseYahooChartResult(result)

    return {
      ...base,
      value: parsed.price,
      change: parsed.change,
      changePercent: parsed.changePercent,
      direction: direction(parsed.change),
      marketStatus: parsed.marketStatus,
      updatedAt: parsed.updatedAt,
      history: parsed.history,
      ok: true,
    }
  } catch (err) {
    const message = (err as Error).message
    console.error(`[market] Yahoo ${symbol} 조회 실패`, message)
    return { ...base, ok: false, error: message }
  }
}

// ---------------- Naver Finance (KOSPI / KOSDAQ) ----------------
const NAVER_CODES: Record<string, string> = {
  KOSPI: 'KOSPI',
  KOSDAQ: 'KOSDAQ',
}

async function fetchNaverIndex(id: string, name: string): Promise<NormalizedQuote> {
  const code = NAVER_CODES[id]
  const base: Omit<NormalizedQuote, 'ok' | 'error'> = {
    id,
    name,
    value: null,
    change: null,
    changePercent: null,
    direction: 'flat',
    marketStatus: null,
    updatedAt: null,
    source: 'naver-polling',
    history: [], // Naver 폴링 응답은 인트라데이 시세열을 주지 않는다고 알려져 있어 항상 비운다.
  }

  try {
    const url = `https://stock.naver.com/api/polling/domestic/index?itemCodes=${encodeURIComponent(code)}`
    const res = await fetchWithTimeout(url, {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Referer: 'https://stock.naver.com/',
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const data = await res.json()
    const parsed = parseNaverItem(data, code)

    return {
      ...base,
      value: parsed.value,
      change: parsed.change,
      changePercent: parsed.changePercent,
      direction: direction(parsed.change),
      marketStatus: parsed.marketStatus,
      // parsed.tradedAt은 실제 거래 시각을 확인 못 하면 null이다(추측해서 채우지 않음) —
      // base.updatedAt도 기본값이 null이라 결과적으로 "모르면 null 그대로"가 유지된다.
      updatedAt: parsed.tradedAt,
      ok: true,
    }
  } catch (err) {
    const message = (err as Error).message
    console.error(`[market] Naver ${code} 조회 실패`, message)
    return { ...base, ok: false, error: message }
  }
}

// ---------------- 60초 in-memory 캐시 ----------------
// Netlify Function 인스턴스가 재사용(warm)될 때만 적중한다. cold start마다는 자연히 새로 조회된다.
// KV/DB 없이 "같은 데이터를 불필요하게 반복 요청하지 않는다"는 요구를 최소 구현으로 충족한다.
let cachedPayload: { quotes: NormalizedQuote[]; fetchedAt: number } | null = null
const CACHE_TTL_MS = 60 * 1000

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export default async () => {
  const now = Date.now()
  if (cachedPayload && now - cachedPayload.fetchedAt < CACHE_TTL_MS) {
    return json({ quotes: cachedPayload.quotes, updatedAt: new Date(cachedPayload.fetchedAt).toISOString(), cached: true }, 200)
  }

  // 네 지수를 병렬로 조회한다. 각 fetch 함수 내부에서 이미 실패를 흡수하므로(throw하지 않음)
  // 하나(또는 한쪽 소스 전체)가 실패해도 나머지는 그대로 반환된다 — 항상 4개 항목이 채워진
  // 배열이 나오고, 실패한 항목은 ok:false로 표시될 뿐이다.
  const quotes = await Promise.all([
    fetchNaverIndex('KOSPI', 'KOSPI'),
    fetchNaverIndex('KOSDAQ', 'KOSDAQ'),
    fetchYahooIndex('SPX', 'S&P 500'),
    fetchYahooIndex('IXIC', 'NASDAQ'),
  ])

  cachedPayload = { quotes, fetchedAt: now }

  return json({ quotes, updatedAt: new Date(now).toISOString(), cached: false }, 200)
}

export const config = {
  path: '/api/market',
}
