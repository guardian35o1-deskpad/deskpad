// market.ts(Netlify Function)에서 쓰는 순수 파싱 로직만 분리해둔 파일.
// 외부 네트워크 없이(합성 fixture로) 유닛 테스트할 수 있도록 하기 위함 —
// 이 프로젝트의 기존 관례(netlify/functions/lib/googleAuth.ts 등)를 그대로 따른다.

export function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    // 네이버 폴링 응답은 숫자를 "2,650.32" 같은 콤마 포함 문자열로 줄 때가 있다고 알려져 있음.
    const n = Number(raw.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function direction(change: number | null): 'up' | 'down' | 'flat' {
  if (change === null || change === 0) return 'flat'
  return change > 0 ? 'up' : 'down'
}

export function pickField(obj: Record<string, unknown>, candidates: string[]): unknown {
  for (const key of candidates) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key]
  }
  return undefined
}

// Naver 응답이 관찰된 두 세대의 wrapper 중 어느 쪽이든({ datas: [...] } 또는 최상위 배열)
// 대응하고, code(예: "KOSPI")와 매칭되는 항목을 찾는다. 못 찾으면 null.
export function findNaverItem(data: unknown, code: string): Record<string, unknown> | null {
  const list = Array.isArray((data as { datas?: unknown[] })?.datas)
    ? (data as { datas: unknown[] }).datas
    : Array.isArray(data)
      ? data
      : null
  if (!list) return null

  const matched = list.find((entry) => {
    if (typeof entry !== 'object' || entry === null) return false
    const e = entry as Record<string, unknown>
    const idCandidates = [e.itemCode, e.itemcode, e.code, e.reutersCode, e.cd]
    return idCandidates.some((v) => typeof v === 'string' && v.toUpperCase().includes(code))
  })

  const item = (matched ?? list[0]) as Record<string, unknown> | undefined
  return item && typeof item === 'object' ? item : null
}

export interface YahooChartMeta {
  regularMarketPrice?: number
  chartPreviousClose?: number
  previousClose?: number
  marketState?: string
  regularMarketTime?: number
}

export interface YahooChartResult {
  meta?: YahooChartMeta
  timestamp?: number[]
  indicators?: { quote?: Array<{ close?: Array<number | null> }> }
}

const HISTORY_POINTS = 30
const MIN_HISTORY_POINTS = 5

export interface ParsedYahoo {
  price: number
  change: number | null
  changePercent: number | null
  marketStatus: string | null
  updatedAt: string | null
  history: number[]
}

// meta.regularMarketPrice가 없으면 예외를 던진다(호출부에서 잡아서 ok:false로 처리).
export function parseYahooChartResult(result: YahooChartResult | undefined): ParsedYahoo {
  const meta = result?.meta
  const price = meta?.regularMarketPrice
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw new Error('meta.regularMarketPrice 없음')
  }

  const prevClose = meta?.chartPreviousClose ?? meta?.previousClose
  const change = typeof prevClose === 'number' ? price - prevClose : null
  const changePercent = typeof prevClose === 'number' && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null

  const timestamps = result?.timestamp ?? []
  const closes = result?.indicators?.quote?.[0]?.close ?? []
  const points: number[] = []
  for (let i = 0; i < timestamps.length && i < closes.length; i += 1) {
    const c = closes[i]
    if (typeof c === 'number' && Number.isFinite(c)) points.push(c)
  }
  const history = points.length >= MIN_HISTORY_POINTS ? points.slice(-HISTORY_POINTS) : []

  return {
    price,
    change,
    changePercent,
    marketStatus: typeof meta?.marketState === 'string' ? meta.marketState : null,
    updatedAt: typeof meta?.regularMarketTime === 'number' ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    history,
  }
}

export interface ParsedNaver {
  value: number
  change: number | null
  changePercent: number | null
  marketStatus: string | null
}

// item을 못 찾거나 현재값 필드를 못 찾으면 예외를 던진다(호출부에서 잡아서 ok:false로 처리).
export function parseNaverItem(data: unknown, code: string): ParsedNaver {
  const item = findNaverItem(data, code)
  if (!item) {
    throw new Error(`응답에서 ${code} 항목을 찾지 못함 (raw: ${JSON.stringify(data).slice(0, 300)})`)
  }

  const value = toNumber(pickField(item, ['closePrice', 'nowValue', 'nowPrice', 'tradePrice', 'nv']))
  if (value === null) {
    throw new Error(`현재값 필드를 찾지 못함 (item raw: ${JSON.stringify(item).slice(0, 300)})`)
  }

  const change = toNumber(pickField(item, ['compareToPreviousClosePrice', 'changeValue', 'compareToPreviousPrice', 'cv']))
  const changePercent = toNumber(pickField(item, ['fluctuationsRatio', 'changeRate', 'prevChangeRate', 'cr']))
  const marketStatusRaw = pickField(item, ['marketStatus', 'ms'])
  const marketStatus = typeof marketStatusRaw === 'string' ? marketStatusRaw : null

  return { value, change, changePercent, marketStatus }
}
