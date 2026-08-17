// netlify/functions/lib/marketParsers.ts의 순수 파싱 로직을 합성(fixture) JSON으로 검증한다.
// 실제 Naver/Yahoo 응답이 아니라 조사로 확보한 "가장 그럴듯한 스키마"에 대한 것이므로,
// 이 테스트가 통과한다고 실제 라이브 응답에서도 100% 통과한다고 보장하지는 않는다 —
// 로직 자체(여러 후보 필드명을 순서대로 시도, 콤마 문자열 숫자 파싱, 실패 시 예외)가
// 의도대로 동작하는지만 확인한다.
import { execSync } from 'node:child_process'

// TS를 그대로 실행하기 위해 esbuild-register 없이 node --experimental-strip-types 사용.
const results = []
function check(label, ok, detail) {
  results.push({ check: label, ok, detail })
}

const mod = await import('./netlify/functions/lib/marketParsers.ts')
const { toNumber, direction, pickField, findNaverItem, parseYahooChartResult, parseNaverItem } = mod

// ---- toNumber ----
check('toNumber: 숫자 그대로', toNumber(2650.32) === 2650.32)
check('toNumber: 콤마 포함 문자열', toNumber('2,650.32') === 2650.32)
check('toNumber: 이상한 값은 null', toNumber('abc') === null && toNumber(undefined) === null && toNumber(null) === null)

// ---- direction ----
check('direction: 양수=up', direction(1.5) === 'up')
check('direction: 음수=down', direction(-1.5) === 'down')
check('direction: 0/null=flat', direction(0) === 'flat' && direction(null) === 'flat')

// ---- pickField ----
check(
  'pickField: 첫 번째로 매칭되는 후보를 사용',
  pickField({ b: 2, c: 3 }, ['a', 'b', 'c']) === 2,
)
check('pickField: 아무것도 없으면 undefined', pickField({}, ['a', 'b']) === undefined)

// ---- findNaverItem: datas 배열 wrapper (신세대 스키마) ----
const naverNewShape = {
  pollingInterval: 1000,
  datas: [
    { itemCode: 'KOSPI', closePrice: '2,650.32', compareToPreviousClosePrice: '11.07', fluctuationsRatio: '0.42', marketStatus: 'OPEN' },
    { itemCode: 'KOSDAQ', closePrice: '845.10', compareToPreviousClosePrice: '2.35', fluctuationsRatio: '0.28', marketStatus: 'OPEN' },
  ],
}
{
  const parsed = parseNaverItem(naverNewShape, 'KOSPI')
  check(
    '신세대 스키마(datas[]) + closePrice 필드로 KOSPI 파싱 성공',
    parsed.value === 2650.32 && parsed.change === 11.07 && parsed.changePercent === 0.42 && parsed.marketStatus === 'OPEN',
    parsed,
  )
}

// ---- findNaverItem: 구세대 짧은 필드명(nv/cv/cr/ms) 스키마 ----
const naverOldShape = [
  { cd: 'KOSPI', nv: 2650.32, cv: 11.07, cr: 0.42, ms: 'CLOSE' },
]
{
  const parsed = parseNaverItem(naverOldShape, 'KOSPI')
  check(
    '구세대 스키마(최상위 배열) + nv/cv/cr 필드로 KOSPI 파싱 성공',
    parsed.value === 2650.32 && parsed.change === 11.07 && parsed.changePercent === 0.42 && parsed.marketStatus === 'CLOSE',
    parsed,
  )
}

// ---- findNaverItem: 완전히 모르는 필드명이면 명확히 실패해야 함(값을 지어내지 않음) ----
{
  let threw = false
  try {
    parseNaverItem({ datas: [{ itemCode: 'KOSPI', totallyUnknownField: 123 }] }, 'KOSPI')
  } catch (err) {
    threw = true
  }
  check('알 수 없는 필드명이면 값을 추측하지 않고 예외를 던짐', threw)
}

// ---- findNaverItem: 항목 자체를 못 찾으면 예외 ----
{
  let threw = false
  try {
    parseNaverItem({ datas: [] }, 'KOSPI')
  } catch (err) {
    threw = true
  }
  check('datas가 비어 있으면 예외를 던짐(빈 값으로 조용히 넘어가지 않음)', threw)
}

// ---- parseYahooChartResult: 정상 케이스 ----
const yahooOk = {
  meta: {
    regularMarketPrice: 5540.55,
    chartPreviousClose: 5534.45,
    marketState: 'REGULAR',
    regularMarketTime: 1755331200,
  },
  timestamp: Array.from({ length: 10 }, (_, i) => 1755331200 - (10 - i) * 60),
  indicators: { quote: [{ close: Array.from({ length: 10 }, (_, i) => 5530 + i) }] },
}
{
  const parsed = parseYahooChartResult(yahooOk)
  check(
    'Yahoo 정상 응답: 현재가/전일대비/등락률/시세열 파싱 성공',
    parsed.price === 5540.55 &&
      Math.abs(parsed.change - 6.1) < 0.001 &&
      parsed.marketStatus === 'REGULAR' &&
      parsed.history.length === 10 &&
      parsed.updatedAt === new Date(1755331200 * 1000).toISOString(),
    parsed,
  )
}

// ---- parseYahooChartResult: 점이 너무 적으면(장 마감 직후 등) history를 비움 ----
{
  const parsed = parseYahooChartResult({
    meta: { regularMarketPrice: 100, chartPreviousClose: 99 },
    timestamp: [1, 2],
    indicators: { quote: [{ close: [100, 101] }] },
  })
  check('시세열 점이 5개 미만이면 history를 빈 배열로 둠(가짜 그래프 방지)', parsed.history.length === 0, parsed.history)
}

// ---- parseYahooChartResult: regularMarketPrice 없으면 예외 ----
{
  let threw = false
  try {
    parseYahooChartResult({ meta: {} })
  } catch (err) {
    threw = true
  }
  check('regularMarketPrice가 없으면 값을 추측하지 않고 예외를 던짐', threw)
}

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
if (failed.length) {
  console.log('FAILED:', JSON.stringify(failed, null, 2))
  process.exitCode = 1
} else {
  console.log('ALL CHECKS PASSED')
}
