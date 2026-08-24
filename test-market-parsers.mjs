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
const { toNumber, direction, pickField, findNaverItem, parseNaverItem, findNaverForeignIndexItem, parseNaverForeignIndexItem } = mod

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
  check('신세대 스키마에 시각 필드가 없으면 tradedAt은 시각을 지어내지 않고 null', parsed.tradedAt === null, parsed.tradedAt)
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

// ---- parseNaverItem: 실제 거래 시각(tradedAt) 추출 — ISO 비슷한 문자열 형식 ----
{
  const parsed = parseNaverItem(
    { datas: [{ itemCode: 'KOSPI', closePrice: 2650.32, localTradedAt: '2026-08-14T15:30:00+09:00' }] },
    'KOSPI',
  )
  check(
    'localTradedAt(ISO 형식)이 있으면 tradedAt으로 파싱됨',
    parsed.tradedAt === new Date('2026-08-14T15:30:00+09:00').toISOString(),
    parsed.tradedAt,
  )
}

// ---- parseNaverItem: 실제 거래 시각(tradedAt) 추출 — 콤팩트 숫자(YYYYMMDDHHmmss) 형식 ----
{
  const parsed = parseNaverItem({ datas: [{ itemCode: 'KOSPI', closePrice: 2650.32, time: '20260814153000' }] }, 'KOSPI')
  check(
    'time(콤팩트 숫자 형식)이 있으면 KST 기준으로 해석해 tradedAt으로 파싱됨',
    parsed.tradedAt === new Date('2026-08-14T15:30:00+09:00').toISOString(),
    parsed.tradedAt,
  )
}

// ---- parseNaverItem: 시각 필드가 파싱 불가능한 값이면 지어내지 않고 null ----
{
  const parsed = parseNaverItem({ datas: [{ itemCode: 'KOSPI', closePrice: 2650.32, localTradedAt: 'not-a-real-date' }] }, 'KOSPI')
  check('시각 필드 값이 파싱 불가능하면 tradedAt은 null(지어내지 않음)', parsed.tradedAt === null, parsed.tradedAt)
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

// ---- findNaverForeignIndexItem / parseNaverForeignIndexItem: 최상위 배열 wrapper ----
const naverForeignArrayShape = [
  { reutersCode: '.INX', closePrice: '6,468.54', compareToPreviousClosePrice: '13.20', fluctuationsRatio: '0.20', marketStatus: 'CLOSE' },
  { reutersCode: '.IXIC', closePrice: '21,622.98', compareToPreviousClosePrice: '-45.14', fluctuationsRatio: '-0.21', marketStatus: 'CLOSE' },
]
{
  const parsed = parseNaverForeignIndexItem(naverForeignArrayShape, '.INX')
  check(
    '최상위 배열 wrapper + reutersCode(.INX)로 S&P500 파싱 성공',
    parsed.value === 6468.54 && parsed.change === 13.2 && parsed.changePercent === 0.2 && parsed.marketStatus === 'CLOSE',
    parsed,
  )
  check('해외 지수는 실제 거래 시각 필드를 확인 못 해 tradedAt이 항상 null(지어내지 않음)', parsed.tradedAt === null, parsed.tradedAt)
}
{
  const parsed = parseNaverForeignIndexItem(naverForeignArrayShape, '.IXIC')
  check(
    '같은 목록에서 reutersCode(.IXIC)로 NASDAQ 파싱 성공',
    parsed.value === 21622.98 && parsed.change === -45.14 && parsed.changePercent === -0.21,
    parsed,
  )
}

// ---- findNaverForeignIndexItem: { indexList: [...] } wrapper (다른 세대 스키마 대비) ----
{
  const parsed = parseNaverForeignIndexItem(
    { indexList: [{ itemCode: '.INX', closePrice: 6468.54, marketStatus: 'OPEN' }] },
    '.INX',
  )
  check('indexList[] wrapper + itemCode 필드로도 파싱 성공', parsed.value === 6468.54 && parsed.marketStatus === 'OPEN', parsed)
}

// ---- parseNaverForeignIndexItem: 항목을 못 찾으면 예외(값을 지어내지 않음) ----
{
  let threw = false
  try {
    parseNaverForeignIndexItem(naverForeignArrayShape, '.N225')
  } catch (err) {
    threw = true
  }
  check('목록에 없는 reutersCode를 찾으면 값을 추측하지 않고 예외를 던짐', threw)
}

// ---- parseNaverForeignIndexItem: 현재값 필드를 못 찾으면 예외 ----
{
  let threw = false
  try {
    parseNaverForeignIndexItem([{ reutersCode: '.INX', totallyUnknownField: 123 }], '.INX')
  } catch (err) {
    threw = true
  }
  check('현재값 필드를 못 찾으면 값을 추측하지 않고 예외를 던짐', threw)
}

console.log(JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.ok)
if (failed.length) {
  console.log('FAILED:', JSON.stringify(failed, null, 2))
  process.exitCode = 1
} else {
  console.log('ALL CHECKS PASSED')
}
