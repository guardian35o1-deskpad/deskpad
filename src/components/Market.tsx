import { useMarket } from '../hooks/useMarket'
import type { MarketQuote } from '../lib/market/types'
import { WATCHED_INDICES } from '../lib/market/types'

const SPARKLINE_WIDTH = 100
const SPARKLINE_HEIGHT = 28
// 이보다 점이 적으면(장 마감 직후 등) 추세선이라 부르기 어려워, 미니 그래프를 아예 숨긴다.
const MIN_SPARKLINE_POINTS = 5

function formatChange(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function buildSparklinePoints(history: number[]): string {
  if (history.length === 0) return ''
  const min = Math.min(...history)
  const max = Math.max(...history)
  const range = max - min || 1
  const stepX = SPARKLINE_WIDTH / (history.length - 1 || 1)

  return history
    .map((value, index) => {
      const x = index * stepX
      const y = SPARKLINE_HEIGHT - ((value - min) / range) * SPARKLINE_HEIGHT
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

// updatedAt은 실제 시장 데이터의 시각(모르면 null)이지 화면을 그린 시각이 아니다 — 그래서
// 오늘 날짜면 기존처럼 "HH:mm 기준"만 보여주지만, 다른 날짜(예: 휴장일이라 최신 데이터가
// 며칠 전 종가인 경우)면 날짜까지 함께 보여줘 "방금 갱신됨"처럼 오해하지 않게 한다.
// 시각을 아예 모르면(소스가 안 주거나 파싱 실패) 시각을 지어내지 않고 그 사실을 그대로 알린다.
function formatUpdatedAt(iso: string | null): string {
  if (!iso) return '기준 시각 확인 안 됨'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '기준 시각 확인 안 됨'

  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
  const hh = date.getHours().toString().padStart(2, '0')
  const mm = date.getMinutes().toString().padStart(2, '0')
  if (isToday) return `${hh}:${mm} 기준`

  const mo = (date.getMonth() + 1).toString().padStart(2, '0')
  const dd = date.getDate().toString().padStart(2, '0')
  return `${mo}.${dd} ${hh}:${mm} 기준`
}

function MarketItem({ quote }: { quote: MarketQuote }) {
  const direction = quote.changePercent > 0 ? 'up' : quote.changePercent < 0 ? 'down' : ''
  const strokeColor = direction === 'up' ? '#ff6b6b' : direction === 'down' ? '#6b9bff' : '#9aa0a6'
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '–'
  // 실제 인트라데이 데이터가 충분히 확보되지 않으면(예: Naver는 시세열을 안 줌, Yahoo도 장
  // 마감 직후엔 점이 적음) 가짜 추세선을 그리지 않고 미니 그래프 자체를 숨긴다.
  const hasSparkline = quote.history.length >= MIN_SPARKLINE_POINTS
  const points = hasSparkline ? buildSparklinePoints(quote.history) : ''

  return (
    <li className={`market-item ${quote.stale ? 'is-stale' : ''}`}>
      <div className="market-item-top">
        <span className="market-name">{quote.name}</span>
        {hasSparkline && (
          <svg
            className="market-sparkline"
            viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline points={points} fill="none" stroke={strokeColor} strokeWidth={2} />
          </svg>
        )}
      </div>
      <span className="market-value">{quote.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</span>
      <span className={`market-change ${direction}`}>
        {arrow} {formatChange(quote.changePercent)}
      </span>
    </li>
  )
}

// 한 번도 값을 받아오지 못한 지수(예: 소스가 계속 실패)도 카드 자체는 항상 같은 자리에 그대로
// 유지하고, 값 자리만 "--"로 표시한다 — 지수 하나가 실패했다고 카드 배치 전체가 흔들리지 않게.
function MarketItemPlaceholder({ name }: { name: string }) {
  return (
    <li className="market-item is-stale">
      <div className="market-item-top">
        <span className="market-name">{name}</span>
      </div>
      <span className="market-value">--</span>
      <span className="market-change">–</span>
    </li>
  )
}

function Market() {
  const { quotes, updatedAt, loading, error, isMock } = useMarket()
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]))
  // 아직 한 번도 아무 값도 못 받아온 최초 로딩/전체 실패 상태에서는 기존처럼 안내 문구만 보여준다.
  // 하나라도 값이 있으면(부분 성공 포함) 4개 카드 자리를 항상 그대로 유지한다.
  const hasAnyQuote = quotes.length > 0

  return (
    <section className="panel market">
      {hasAnyQuote ? (
        <>
          <ul className="market-list">
            {WATCHED_INDICES.map((item) => {
              const quote = quoteBySymbol.get(item.symbol)
              return quote ? (
                <MarketItem quote={quote} key={item.symbol} />
              ) : (
                <MarketItemPlaceholder name={item.name} key={item.symbol} />
              )
            })}
          </ul>
          {/* mock provider일 때만 "샘플 데이터"를 표시한다(현재는 실제 API가 연결돼 있어 해당 없음). */}
          <div className="market-updated">{isMock ? '샘플 데이터' : formatUpdatedAt(updatedAt)}</div>
        </>
      ) : (
        <div className="market-status">
          {loading ? '시장 데이터를 불러오는 중...' : error ? '시장 데이터를 불러올 수 없습니다' : ''}
        </div>
      )}
    </section>
  )
}

export default Market
