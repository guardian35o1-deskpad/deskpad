// DeskPad 하단 주가/지수 카드용 시장 데이터 프록시.
// 브라우저가 아니라 이 함수(Netlify Functions, 서버 측)가 Naver를 직접 호출하므로
// - 브라우저 CORS 제약을 받지 않는다(CORS는 브라우저 전용 제약이라 서버-서버 호출엔 애초에 적용되지 않음).
// - API 키가 없는 소스만 쓰므로 프론트 코드에 노출될 비밀값 자체가 없다.
//
// (2026-08-17) 미국 지수(S&P 500/NASDAQ) 소스를 Yahoo Finance → Naver 해외지수로 완전히
// 교체함. 사용자가 실제 배포 환경(Netlify)에서 Yahoo가 HTTP 429(요청 과다/봇 차단)로 계속
// 실패하는 것을 /api/market 응답의 error 필드로 직접 확인했고, Naver도 국내 지수와 같은
// 계열(비공식, 키 불필요)로 S&P 500(.INX)/NASDAQ Composite(.IXIC)을 제공하는 것이 확인돼
// (https://github.com/PotatoWhite/fin-invest/blob/main/NAVER_API_RESEARCH.md), cookie/crumb
// 우회 로직을 계속 넣기보다 Yahoo 코드 자체를 제거하고 Naver로 단일화하는 쪽을 택함. Naver
// 해외 지수는 국내 지수와 달리 고객센터 안내상 약 10~20분 지연 시세라, delayed:true로 표시해
// 프론트(Market.tsx)가 작게 "지연" 표시를 붙일 수 있게 한다.
//
// 중요(정직하게 남겨두는 한계): 이 함수를 작성한 클라우드 샌드박스는 여전히 일반 인터넷
// 접근 자체가 막혀 있어(stock.naver.com/api.stock.naver.com 포함), 실제 배포 환경(Netlify)에서
// 라이브 응답을 이 세션에서 직접 캡처해 검증하지 못했다.
// - Naver 쪽 정확한 필드명(국내·해외 공통)은 문서/2차 자료로만 확인했고 raw 캡처로 확정하지
//   못했다 — 그래서 lib/marketParsers.ts의 파서들이 여러 세대의 후보 필드명을 순서대로
//   시도하는 방어적 파서로 작성돼 있다. 배포 후 값이 비어 있거나 이상하면 Netlify 함수
//   로그에서 "[market] Naver ... 조회 실패" 로그의 raw 미리보기를 보고
//   lib/marketParsers.ts의 후보 필드명 배열을 추가/수정하면 된다.
import { direction, parseNaverForeignIndexItem, parseNaverItem } from './lib/marketParsers.ts'

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
  // 국내 지수(KOSPI/KOSDAQ)는 근실시간이지만, Naver 해외 지수는 약 10~20분 지연 시세라고
  // 안내돼 있다 — 프론트에서 이 지수만 작게 "지연" 표시를 붙이는 데만 쓴다.
  delayed?: boolean
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

// ---------------- Naver 해외지수 (S&P 500 / NASDAQ Composite) ----------------
// reutersCode 기준(사용자가 확인한 근거는 파일 상단 주석 참고).
const NAVER_FOREIGN_CODES: Record<string, string> = {
  SPX: '.INX',
  IXIC: '.IXIC',
}
const NAVER_FOREIGN_NAMES: Record<string, string> = {
  SPX: 'S&P 500',
  IXIC: 'NASDAQ',
}
// 미국 지수 목록 하나에 .INX/.IXIC 등이 전부 들어있는 단일 목록 endpoint라, SPX/IXIC를 따로
// 요청하지 않고 이 호출 1번으로 둘 다 얻는다(불필요한 중복 호출 방지).
const NAVER_FOREIGN_LIST_URL = 'https://api.stock.naver.com/index/nation/USA'

async function fetchNaverForeignIndices(): Promise<NormalizedQuote[]> {
  const ids = Object.keys(NAVER_FOREIGN_CODES)
  const base = (id: string): Omit<NormalizedQuote, 'ok' | 'error'> => ({
    id,
    name: NAVER_FOREIGN_NAMES[id],
    value: null,
    change: null,
    changePercent: null,
    direction: 'flat',
    marketStatus: null,
    updatedAt: null,
    source: 'naver-foreign',
    history: [],
    delayed: true,
  })

  let data: unknown
  try {
    const res = await fetchWithTimeout(NAVER_FOREIGN_LIST_URL, {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Referer: 'https://stock.naver.com/',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = await res.json()
  } catch (err) {
    // 목록 조회 자체가 실패하면 SPX/IXIC 둘 다 같은 이유로 실패 처리한다(따로 재시도할
    // 근거가 없음 — 어차피 같은 응답에서 둘 다 꺼내 쓰는 구조라서).
    const message = (err as Error).message
    console.error('[market] Naver 해외지수 목록 조회 실패', message)
    return ids.map((id) => ({ ...base(id), ok: false, error: message }))
  }

  return ids.map((id) => {
    const reutersCode = NAVER_FOREIGN_CODES[id]
    try {
      const parsed = parseNaverForeignIndexItem(data, reutersCode)
      return {
        ...base(id),
        value: parsed.value,
        change: parsed.change,
        changePercent: parsed.changePercent,
        direction: direction(parsed.change),
        marketStatus: parsed.marketStatus,
        updatedAt: parsed.tradedAt,
        ok: true,
      }
    } catch (err) {
      const message = (err as Error).message
      console.error(`[market] Naver 해외지수 ${reutersCode} 파싱 실패`, message)
      return { ...base(id), ok: false, error: message }
    }
  })
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

  // 국내 2개 + 해외 목록(1번 호출로 SPX/IXIC 둘 다 포함)을 병렬로 조회한다. 각 fetch 함수
  // 내부에서 이미 실패를 흡수하므로(throw하지 않음) 하나(또는 한쪽 소스 전체)가 실패해도
  // 나머지는 그대로 반환된다 — 항상 4개 항목이 채워진 배열이 나오고, 실패한 항목은 ok:false로
  // 표시될 뿐이다.
  const [kospi, kosdaq, foreignQuotes] = await Promise.all([
    fetchNaverIndex('KOSPI', 'KOSPI'),
    fetchNaverIndex('KOSDAQ', 'KOSDAQ'),
    fetchNaverForeignIndices(),
  ])
  const quotes = [kospi, kosdaq, ...foreignQuotes]

  cachedPayload = { quotes, fetchedAt: now }

  return json({ quotes, updatedAt: new Date(now).toISOString(), cached: false }, 200)
}

export const config = {
  path: '/api/market',
}
