import { useMarket } from '../hooks/useMarket'
import type { MarketQuote } from '../lib/market/types'

const SPARKLINE_WIDTH = 100
const SPARKLINE_HEIGHT = 28

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

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const hh = date.getHours().toString().padStart(2, '0')
  const mm = date.getMinutes().toString().padStart(2, '0')
  return `${hh}:${mm} 기준`
}

function MarketItem({ quote }: { quote: MarketQuote }) {
  const direction = quote.changePercent > 0 ? 'up' : quote.changePercent < 0 ? 'down' : ''
  const strokeColor = direction === 'up' ? '#ff6b6b' : direction === 'down' ? '#6b9bff' : '#9aa0a6'
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '–'
  const points = buildSparklinePoints(quote.history)

  return (
    <li className="market-item">
      <div className="market-item-top">
        <span className="market-name">{quote.name}</span>
        <svg
          className="market-sparkline"
          viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline points={points} fill="none" stroke={strokeColor} strokeWidth={2} />
        </svg>
      </div>
      <span className="market-value">{quote.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</span>
      <span className={`market-change ${direction}`}>
        {arrow} {formatChange(quote.changePercent)}
      </span>
    </li>
  )
}

function Market() {
  const { quotes, updatedAt, loading, error, isMock } = useMarket()

  return (
    <section className="panel market">
      {quotes.length > 0 ? (
        <>
          <ul className="market-list">
            {quotes.map((quote) => (
              <MarketItem quote={quote} key={quote.symbol} />
            ))}
          </ul>
          {/* 실제 API 연결 전까지는 가짜 값을 실제 시세로 착각하지 않도록 "샘플 데이터"만 표시한다. */}
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
