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

// (2026-08-17) 미국 지수 소스를 Yahoo Finance → Naver 해외지수로 교체하면서, Yahoo 전용
// 파서(parseYahooChartResult 등)는 더 이상 쓰이지 않아 제거했다. 대신 아래
// findNaverForeignIndexItem/parseNaverForeignIndexItem이 같은 역할(S&P 500/NASDAQ 파싱)을 한다.

// Naver 해외지수 목록 응답이 관찰된 몇 가지 wrapper 형태(최상위 배열 / { indexList: [...] } /
// { datas: [...] }) 중 어느 쪽이든 대응하고, reutersCode(예: ".INX")와 매칭되는 항목을 찾는다.
// 못 찾으면 null.
export function findNaverForeignIndexItem(data: unknown, reutersCode: string): Record<string, unknown> | null {
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { indexList?: unknown[] })?.indexList)
      ? (data as { indexList: unknown[] }).indexList
      : Array.isArray((data as { datas?: unknown[] })?.datas)
        ? (data as { datas: unknown[] }).datas
        : null
  if (!list) return null

  const matched = list.find((entry) => {
    if (typeof entry !== 'object' || entry === null) return false
    const e = entry as Record<string, unknown>
    const codeCandidates = [e.reutersCode, e.itemCode, e.code, e.symbolCode]
    return codeCandidates.some((v) => typeof v === 'string' && v.toUpperCase() === reutersCode.toUpperCase())
  })
  return (matched as Record<string, unknown> | undefined) ?? null
}

export interface ParsedNaverForeignIndex {
  value: number
  change: number | null
  changePercent: number | null
  marketStatus: string | null
  // 해외 지수 실제 거래 시각 필드명을 확인하지 못했다(raw 캡처로 확정 못 함) — 지어내지 않고
  // 항상 null로 둔다. base.updatedAt도 기본값이 null이라 결과적으로 "모르면 null"이 유지된다.
  tradedAt: string | null
}

// item을 못 찾거나 현재값 필드를 못 찾으면 예외를 던진다(호출부에서 잡아서 ok:false로 처리).
export function parseNaverForeignIndexItem(data: unknown, reutersCode: string): ParsedNaverForeignIndex {
  const item = findNaverForeignIndexItem(data, reutersCode)
  if (!item) {
    throw new Error(`응답에서 ${reutersCode} 항목을 찾지 못함 (raw: ${JSON.stringify(data).slice(0, 300)})`)
  }

  const value = toNumber(pickField(item, ['closePrice', 'nowValue', 'tradePrice']))
  if (value === null) {
    throw new Error(`현재값 필드를 찾지 못함 (item raw: ${JSON.stringify(item).slice(0, 300)})`)
  }

  const change = toNumber(pickField(item, ['compareToPreviousClosePrice', 'changeValue', 'compareToPreviousPrice']))
  const changePercent = toNumber(pickField(item, ['fluctuationsRatio', 'changeRate']))
  const marketStatusRaw = pickField(item, ['marketStatus', 'ms'])
  const marketStatus = typeof marketStatusRaw === 'string' ? marketStatusRaw : null
  const tradedAt = null // 해외 지수 실제 거래 시각 필드명 미확인 — 지어내지 않음

  return { value, change, changePercent, marketStatus, tradedAt }
}

// Naver가 실제 거래 시각을 어떤 필드/형식으로 주는지 raw 캡처로 확정하지 못했다(market.ts
// 상단 주석 참고) — 그래서 여러 후보 필드명 + 두 가지 형식(ISO 비슷한 문자열 / 콤팩트 숫자
// YYYYMMDDHHmmss)을 시도하는 최선-노력(best-effort) 파서로만 둔다. 못 찾거나 파싱이 안 되면
// null을 돌려주고(예외를 던지지 않음) — "값을 지어내지 않는다"는 원칙상, 시각을 모르면 그냥
// 모른다고 하는 게 맞고 fetch 시각 등으로 대체하지 않는다(marketService.ts가 이 null을 보고
// "기준 시각 확인 안 됨"으로 정직하게 표시함).
function parseNaverTimestamp(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const str = String(raw).trim()
  if (!str) return null

  const direct = Date.parse(str)
  if (!Number.isNaN(direct)) return new Date(direct).toISOString()

  // 콤팩트 숫자 형식(YYYYMMDDHHmmss)도 Naver 계열 API에서 관찰된 적 있어 방어적으로 지원.
  // 한국시간(KST, UTC+9) 기준이라고 가정한다 — 이 가정 자체는 확인되지 않았으므로 틀릴 수
  // 있다(그래도 완전히 틀린 임의값보다는 낫다는 판단, 필요하면 나중에 조정).
  const compact = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  if (compact) {
    const [, y, mo, d, h, mi, s] = compact
    const parsed = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`)
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
  }

  return null
}

export interface ParsedNaver {
  value: number
  change: number | null
  changePercent: number | null
  marketStatus: string | null
  // 이 지수 값의 실제 거래/집계 시각. 위 parseNaverTimestamp 참고 — 확인 못 하면 null.
  tradedAt: string | null
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
  const tradedAt = parseNaverTimestamp(pickField(item, ['localTradedAt', 'tradeTime', 'time', 'datetime', 'localDate']))

  return { value, change, changePercent, marketStatus, tradedAt }
}
