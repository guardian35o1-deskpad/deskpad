import { chromium } from 'playwright'

// 시장 카드(KOSPI/KOSDAQ/S&P500/NASDAQ) 실제 API 연동 검증.
// 이 개발 환경은 finance.naver.com/finance.yahoo.com에 네트워크 접근이 막혀 있어
// /api/market 자체를 실제로 호출해볼 수 없다. 대신 Netlify Function이 프론트에 돌려주는
// "정규화된 이후" 응답 형태(quotes: [{id, name, value, change, changePercent, ...}])를
// page.route로 가로채 목업하고, App(liveMarketProvider→Market.tsx)이 그 응답을 받았을 때
// 정확히 기대대로 렌더링/갱신/폴백하는지만 검증한다(서버 함수 내부 파서 로직 자체는
// test-market-parsers.mjs에서 별도로 fixture 기반 유닛 테스트로 확인함).
const BASE_URL = 'http://localhost:4300'
// 2026-08-17(월) 10:00 UTC = KRX 개장 시간대(브라우저 타임존이 UTC라 isMarketOpen()의
// getHours()가 이 시각을 그대로 "로컬 시" 09~15:30 판정에 사용함) — 이 시각으로 고정해두면
// marketService.ts의 "장이 전부 닫혀 있고 캐시가 있으면 네트워크 호출 자체를 건너뛴다"는
// 최적화가 끼어들지 않아, 실제로 매 tick/재활성화마다 /api/market이 호출되는지 확인할 수 있다.
const MARKET_OPEN_TIME = '2026-08-17T10:00:00.000Z'
// 2026-08-17(월) 08:00 UTC = 한국장(09:00 전) + 미국장(늦은 밤/이른 새벽 아님) 모두 닫혀 있는
// 시각. "장이 전부 닫혀 있어도 캐시가 무효하면 최초 1회는 반드시 /api/market을 호출한다"는
// 동작을 검증하려면 일부러 이렇게 장이 닫힌 시각을 써야 한다(열려 있으면 애초에 openSymbols가
// 비지 않아 이 분기 자체를 안 타므로 검증 의미가 없음).
const MARKET_CLOSED_TIME = '2026-08-17T08:00:00.000Z'

const results = []
function check(label, ok, detail) {
  results.push({ check: label, ok, detail })
}

function marketPayload(overrides = {}) {
  const base = {
    quotes: [
      {
        id: 'KOSPI', name: 'KOSPI', value: 2650.32, change: 11.07, changePercent: 0.42,
        marketStatus: 'OPEN', updatedAt: '2026-08-17T05:00:00.000Z', history: [], ok: true,
      },
      {
        id: 'KOSDAQ', name: 'KOSDAQ', value: 845.1, change: 2.35, changePercent: 0.28,
        marketStatus: 'OPEN', updatedAt: '2026-08-17T05:00:00.000Z', history: [], ok: true,
      },
      {
        id: 'SPX', name: 'S&P 500', value: 5540.55, change: 6.1, changePercent: 0.11,
        marketStatus: 'REGULAR', updatedAt: '2026-08-17T05:00:00.000Z',
        history: [5530, 5531, 5532, 5533, 5534, 5535], ok: true,
      },
      {
        id: 'IXIC', name: 'NASDAQ', value: 17850.1, change: -32.4, changePercent: -0.18,
        marketStatus: 'REGULAR', updatedAt: '2026-08-17T05:00:00.000Z',
        history: [17900, 17895, 17880, 17870, 17860, 17850.1], ok: true,
      },
    ],
    updatedAt: '2026-08-17T05:00:00.000Z',
    cached: false,
  }
  return { ...base, ...overrides }
}

async function routeMarket(page, payloadFactory) {
  await page.route('**/api/market', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payloadFactory()) })
  })
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

  // ---- 1~6) 정상 응답: 4개 카드, 값/등락/화살표/미니그래프, "샘플 데이터" 문구가 더 이상 없음 ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await routeMarket(page, () => marketPayload())
    await page.goto(BASE_URL)
    await page.waitForSelector('.market-item')

    const cellCount = await page.evaluate(() => document.querySelectorAll('.market-item').length)
    check('1) 카드 4개 렌더링', cellCount === 4, cellCount)

    const names = await page.evaluate(() => Array.from(document.querySelectorAll('.market-name')).map((el) => el.textContent))
    check('2) 지수명 KOSPI/KOSDAQ/S&P 500/NASDAQ 순서대로 표시', JSON.stringify(names) === JSON.stringify(['KOSPI', 'KOSDAQ', 'S&P 500', 'NASDAQ']), names)

    const kospiValue = await page.evaluate(() => document.querySelectorAll('.market-item')[0]?.querySelector('.market-value')?.textContent)
    check('3) KOSPI 실제값(2,650.32) 표시', kospiValue === '2,650.32', kospiValue)

    const nasdaqDirection = await page.evaluate(() => document.querySelectorAll('.market-item')[3]?.querySelector('.market-change')?.textContent)
    check('4) NASDAQ 하락(음수) 방향(▼) 표시', (nasdaqDirection ?? '').includes('▼'), nasdaqDirection)

    const spxDirection = await page.evaluate(() => document.querySelectorAll('.market-item')[2]?.querySelector('.market-change')?.textContent)
    check('4) S&P 500 상승(양수) 방향(▲) 표시', (spxDirection ?? '').includes('▲'), spxDirection)

    const notSample = await page.evaluate(() => document.querySelector('.market-updated')?.textContent)
    check('5) "샘플 데이터" 문구가 더 이상 없고 "OO:OO 기준"으로 표시', notSample !== '샘플 데이터' && (notSample ?? '').includes('기준'), notSample)

    const sparklineCounts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.market-item')).map((el) => el.querySelectorAll('.market-sparkline').length),
    )
    check(
      '6) 인트라데이 시세열이 있는 SPX/NASDAQ만 미니그래프 표시, KOSPI/KOSDAQ은 숨김(가짜 그래프 금지)',
      JSON.stringify(sparklineCounts) === JSON.stringify([0, 0, 1, 1]),
      sparklineCounts,
    )

    await context.close()
  }

  // ---- 7~8) 부분 실패: Naver(KOSPI/KOSDAQ) 실패해도 Yahoo(SPX/NASDAQ)는 정상 표시 ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await routeMarket(page, () =>
      marketPayload({
        quotes: [
          { id: 'KOSPI', name: 'KOSPI', value: null, change: null, changePercent: null, marketStatus: null, updatedAt: null, history: [], ok: false, error: 'HTTP 500' },
          { id: 'KOSDAQ', name: 'KOSDAQ', value: null, change: null, changePercent: null, marketStatus: null, updatedAt: null, history: [], ok: false, error: 'HTTP 500' },
          { id: 'SPX', name: 'S&P 500', value: 5540.55, change: 6.1, changePercent: 0.11, marketStatus: 'REGULAR', updatedAt: '2026-08-17T05:00:00.000Z', history: [5530, 5531, 5532, 5533, 5534, 5535], ok: true },
          { id: 'IXIC', name: 'NASDAQ', value: 17850.1, change: -32.4, changePercent: -0.18, marketStatus: 'REGULAR', updatedAt: '2026-08-17T05:00:00.000Z', history: [17900, 17895, 17880, 17870, 17860, 17850.1], ok: true },
        ],
      }),
    )
    await page.goto(BASE_URL)
    await page.waitForSelector('.market-item')
    await page.waitForTimeout(300)

    const cellCount = await page.evaluate(() => document.querySelectorAll('.market-item').length)
    check('7) Naver 전체 실패 + 캐시도 없는 최초 로딩: KOSPI/KOSDAQ도 카드 자리는 유지("--" 표시)', cellCount === 4, cellCount)

    const kospiValue = await page.evaluate(() => document.querySelectorAll('.market-item')[0]?.querySelector('.market-value')?.textContent)
    check('7) 값을 한 번도 못 받아온 KOSPI는 "--" 표시', kospiValue === '--', kospiValue)

    const spxValue = await page.evaluate(() => document.querySelectorAll('.market-item')[2]?.querySelector('.market-value')?.textContent)
    check('8) 같은 상황에서도 SPX(성공한 소스)는 정상 값 표시', spxValue === '5,540.55', spxValue)

    await context.close()
  }

  // ---- 9~10) 캐시된 값이 있는 상태에서 이번 조회만 실패 → 마지막 값 유지 + stale 표시, 전체 화면 안 깨짐 ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.clock.install({ time: new Date(MARKET_OPEN_TIME) })

    // localStorage에 marketService.ts가 쓰는 캐시 키를 직접 시드해 "이전에 정상 수신한 적 있음" 상태를 만든다.
    // version/source는 marketService.ts의 CACHE_VERSION(2)/live provider와 반드시 같아야
    // "유효한 이전 캐시"로 인정된다 — 다르면 마지막 값 유지 검증(9~10번) 자체가 성립하지 않는다.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deskpad:market-cache',
        JSON.stringify({
          version: 2,
          source: 'live',
          updatedAt: '2026-08-17T04:00:00.000Z',
          quotes: [
            { symbol: 'KOSPI', name: 'KOSPI', price: 2640, change: 5, changePercent: 0.19, history: [], updatedAt: '2026-08-17T04:00:00.000Z' },
            { symbol: 'KOSDAQ', name: 'KOSDAQ', price: 840, change: 1, changePercent: 0.12, history: [], updatedAt: '2026-08-17T04:00:00.000Z' },
            { symbol: 'SPX', name: 'S&P 500', price: 5530, change: -3, changePercent: -0.05, history: [], updatedAt: '2026-08-17T04:00:00.000Z' },
            { symbol: 'IXIC', name: 'NASDAQ', price: 17800, change: -10, changePercent: -0.06, history: [], updatedAt: '2026-08-17T04:00:00.000Z' },
          ],
        }),
      )
    })

    // 이번 조회는 /api/market 자체가 500 실패 → liveMarketProvider가 throw → marketService.ts가
    // catch해서 캐시를 stale:true로 반환해야 한다(화면이 깨지지 않고 마지막 값을 유지).
    await page.route('**/api/market', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }))
    await page.goto(BASE_URL)
    await page.waitForSelector('.market-item')
    await page.waitForTimeout(300)

    const cellCount = await page.evaluate(() => document.querySelectorAll('.market-item').length)
    check('9) API 전체 실패 + 캐시 있음: 화면이 깨지지 않고 카드 4개 그대로 유지', cellCount === 4, cellCount)

    const kospiValue = await page.evaluate(() => document.querySelectorAll('.market-item')[0]?.querySelector('.market-value')?.textContent)
    check('9) 마지막 정상값(2,640) 그대로 표시', kospiValue === '2,640', kospiValue)

    const allStale = await page.evaluate(() => Array.from(document.querySelectorAll('.market-item')).every((el) => el.classList.contains('is-stale')))
    check('10) API 실패로 유지 중인 값에는 지연(stale) 표시 클래스가 붙음', allStale)

    await context.close()
  }

  // ---- 11) 1분 자동 갱신: page.clock으로 60초를 흘려보내 두 번째 /api/market 호출이 실제로 발생하는지 확인 ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.clock.install({ time: new Date(MARKET_OPEN_TIME) })

    let callCount = 0
    await page.route('**/api/market', (route) => {
      callCount += 1
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(marketPayload()) })
    })

    await page.goto(BASE_URL)
    await page.waitForSelector('.market-item')
    const initialCalls = callCount
    check('11) 최초 마운트 시 즉시 1회 조회', initialCalls === 1, initialCalls)

    await page.clock.runFor(61 * 1000)
    await page.waitForTimeout(200)
    check('11) 60초 경과 후 자동으로 다시 조회(1분 간격)', callCount === 2, callCount)

    await context.close()
  }

  // ---- 12) 재활성화(visibilitychange) 시 즉시 갱신 ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.clock.install({ time: new Date(MARKET_OPEN_TIME) })

    let callCount = 0
    await page.route('**/api/market', (route) => {
      callCount += 1
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(marketPayload()) })
    })

    await page.goto(BASE_URL)
    await page.waitForSelector('.market-item')
    const before = callCount

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(200)

    check('12) 화면 재활성화(visibilitychange) 시 즉시 재조회', callCount > before, { before, after: callCount })

    await context.close()
  }

  // ---- 13~14) 실데이터 전환 후 실기기에서 실제로 겪은 문제 재현: 예전 mock 캐시가 남아 있고
  // + 장이 전부 닫혀 있어도, 최초 1회는 반드시 /api/market을 호출해 live 값으로 교체돼야 한다 ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.clock.install({ time: new Date(MARKET_CLOSED_TIME) })

    // 실데이터 연동 전(mock 시절)에 저장됐던 옛 캐시를 그대로 재현 — version/source 필드가
    // 아예 없는 구세대 스키마 + 그 시절 mock 고정값(2,650.32 등).
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'deskpad:market-cache',
        JSON.stringify({
          updatedAt: '2026-08-17T04:59:00.000Z',
          quotes: [
            { symbol: 'KOSPI', name: 'KOSPI', price: 2650.32, change: 11.07, changePercent: 0.42, history: [], updatedAt: '2026-08-17T04:59:00.000Z' },
            { symbol: 'KOSDAQ', name: 'KOSDAQ', price: 845.1, change: 2.35, changePercent: 0.28, history: [], updatedAt: '2026-08-17T04:59:00.000Z' },
            { symbol: 'SPX', name: 'S&P 500', price: 5540.55, change: 6.1, changePercent: 0.11, history: [], updatedAt: '2026-08-17T04:59:00.000Z' },
            { symbol: 'IXIC', name: 'NASDAQ', price: 17850.1, change: -32.4, changePercent: -0.18, history: [], updatedAt: '2026-08-17T04:59:00.000Z' },
          ],
        }),
      )
    })

    let apiCalled = false
    await routeMarket(page, () => {
      apiCalled = true
      // mock 캐시와는 값이 다른 "새로운 live 값"을 돌려준다 — 화면에 이 값이 떠야
      // 옛 mock 캐시를 그대로 보여주고 있는 게 아니라 실제로 새로 호출했다는 증거가 된다.
      return marketPayload({
        quotes: marketPayload().quotes.map((q) => ({ ...q, value: q.value + 1, updatedAt: '2026-08-17T07:55:00.000Z' })),
      })
    })
    await page.goto(BASE_URL)
    await page.waitForSelector('.market-item')
    await page.waitForTimeout(300)

    check('13) 장이 전부 닫혀 있어도(캐시가 옛 mock 세대라 무효) 최초 1회는 /api/market을 호출함', apiCalled)

    const kospiValue = await page.evaluate(() => document.querySelectorAll('.market-item')[0]?.querySelector('.market-value')?.textContent)
    check('13) 화면에 옛 mock 값(2,650.32)이 아니라 새 live 값(2,651.32)이 표시됨', kospiValue === '2,651.32', kospiValue)

    const storedCache = await page.evaluate(() => JSON.parse(window.localStorage.getItem('deskpad:market-cache') ?? 'null'))
    check(
      '14) localStorage 캐시가 새 스키마(version/source: live)로 교체 저장됨',
      storedCache?.version === 2 && storedCache?.source === 'live',
      storedCache && { version: storedCache.version, source: storedCache.source },
    )

    await context.close()
  }

  console.log(JSON.stringify(results, null, 2))
  await browser.close()
  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    console.log('FAILED:', JSON.stringify(failed, null, 2))
    process.exitCode = 1
  } else {
    console.log('ALL CHECKS PASSED')
  }
}

main()
