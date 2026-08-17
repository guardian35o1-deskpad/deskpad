import { chromium } from 'playwright'

// 이번 작업(달력 스와이프 월 전환 + 도크 ↻ 수동 새로고침) 핵심 동작만 검증한다.
// hooks를 App.tsx로 끌어올린 구조 변경 자체의 회귀 여부는 이미 verify4/5/9/13/16/17/18/19/20으로
// 확인했으므로, 여기서는 새로 추가된 두 기능(스와이프, refreshAll)에 직접 관련된 케이스만 다룬다.
const BASE_URL = 'http://localhost:4300'

const results = []
function check(label, ok, detail) {
  results.push({ check: label, ok, detail })
}

function marketPayload() {
  return {
    quotes: [
      { id: 'KOSPI', name: 'KOSPI', value: 2650.32, change: 11.07, changePercent: 0.42, marketStatus: 'CLOSE', updatedAt: '2026-08-14T05:00:00.000Z', history: [], ok: true },
      { id: 'KOSDAQ', name: 'KOSDAQ', value: 845.1, change: 2.35, changePercent: 0.28, marketStatus: 'CLOSE', updatedAt: '2026-08-14T05:00:00.000Z', history: [], ok: true },
      { id: 'SPX', name: 'S&P 500', value: 5540.55, change: 6.1, changePercent: 0.11, marketStatus: 'CLOSED', updatedAt: '2026-08-14T05:00:00.000Z', history: [], ok: true },
      { id: 'IXIC', name: 'NASDAQ', value: 17850.1, change: -32.4, changePercent: -0.18, marketStatus: 'CLOSED', updatedAt: '2026-08-14T05:00:00.000Z', history: [], ok: true },
    ],
    updatedAt: '2026-08-14T05:00:00.000Z',
    cached: false,
  }
}

async function dragOn(page, selector, dx, dy) {
  const box = await page.locator(selector).boundingBox()
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + dx, startY + dy, { steps: 10 })
  await page.mouse.up()
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

  // ---- 달력 스와이프 ----
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } })
    const page = await context.newPage()
    let marketCalls = 0
    await page.route('**/api/market', (route) => {
      marketCalls++
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(marketPayload()) })
    })
    await page.route('**/api/calendar-events', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) }),
    )
    await page.route('https://api.open-meteo.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          current: { temperature_2m: 25, weather_code: 1 },
          daily: { temperature_2m_max: [26, 27, 28, 29], temperature_2m_min: [20, 21, 22, 23], weather_code: [1, 1, 1, 1] },
        }),
      }),
    )
    // 오늘 = 2026-08-15로 고정(월 경계 근처 우연 매칭을 피하기 위함).
    await page.clock.install({ time: new Date('2026-08-15T10:00:00+09:00') })
    await page.addInitScript(() => window.localStorage.setItem('deskpad:view-mode', 'default'))
    await page.goto(BASE_URL)
    await page.waitForSelector('.calendar-month-title')
    await page.waitForTimeout(400)

    const titleText = () => page.locator('.calendar-month-title').innerText()

    check('1: 초기 월 표시 = 2026년 8월', (await titleText()) === '2026년 8월', await titleText())

    // 왼쪽으로 스와이프 -> 다음 달
    await dragOn(page, '.calendar-swipe-area', -150, 5)
    await page.waitForTimeout(300)
    check('2: 왼쪽 스와이프 -> 다음 달(9월)로 전환', (await titleText()) === '2026년 9월', await titleText())

    const slideClass = await page.locator('.calendar-swipe-inner').getAttribute('class')
    check('3: 전환 시 슬라이드 애니메이션 클래스(slide-next) 적용', slideClass?.includes('slide-next'), slideClass)

    // 스와이프 직후, 릴리즈 지점의 날짜가 실수로 선택되지 않아야 한다(오늘=8/15는 9월 그리드에 없음).
    const selectedCount = await page.locator('.calendar-cell.is-selected').count()
    check('4: 스와이프가 날짜 클릭으로 새어나가지 않음(is-selected 없음)', selectedCount === 0, selectedCount)

    // 오른쪽으로 스와이프 -> 이전 달(8월로 복귀), 오늘 날짜가 다시 선택 상태로 보임
    await dragOn(page, '.calendar-swipe-area', 150, 5)
    await page.waitForTimeout(300)
    check('5: 오른쪽 스와이프 -> 이전 달(8월)로 복귀', (await titleText()) === '2026년 8월', await titleText())
    const todaySelected = await page.locator('.calendar-cell.is-today.is-selected').count()
    check('6: 복귀 후 오늘 날짜 선택 상태 유지', todaySelected === 1, todaySelected)

    // 이동거리가 짧으면(threshold 미만) 전환되지 않아야 한다.
    await dragOn(page, '.calendar-swipe-area', -20, 0)
    await page.waitForTimeout(200)
    check('7: 짧은 드래그(threshold 미만)는 무시됨', (await titleText()) === '2026년 8월', await titleText())

    // 세로 이동이 더 크면(가로<세로) 스와이프로 판정하지 않아야 한다(세로 스크롤 충돌 방지).
    await dragOn(page, '.calendar-swipe-area', -80, 150)
    await page.waitForTimeout(200)
    check('8: 세로 이동이 더 큰 드래그는 무시됨', (await titleText()) === '2026년 8월', await titleText())

    // 기존 이전/다음 버튼도 그대로 동작해야 한다(회귀).
    await page.locator('.calendar-nav-btn[aria-label="다음 달"]').click()
    await page.waitForTimeout(300)
    check('9: 기존 "다음 달" 버튼 정상 동작(회귀)', (await titleText()) === '2026년 9월', await titleText())

    // 빠르게 연속으로 눌러도(잠금 시간 내) 한 달만 전환돼야 한다(debounce/lock).
    await page.locator('.calendar-nav-btn[aria-label="다음 달"]').click()
    await page.locator('.calendar-nav-btn[aria-label="다음 달"]').click()
    await page.waitForTimeout(400)
    check('10: 연속 클릭 시 중복 전환 방지(lock) — 9월에서 1회만 전환돼 10월', (await titleText()) === '2026년 10월', await titleText())

    // 날짜 클릭도 스와이프 영역 안에서 그대로 동작해야 한다(회귀).
    await page.locator('.calendar-nav-btn[aria-label="이전 달"]').click()
    await page.locator('.calendar-nav-btn[aria-label="이전 달"]').click()
    await page.waitForTimeout(400) // 8월로 복귀
    const dateCell = page.locator('.calendar-cell:not(.is-outside)').filter({ hasText: /^5$/ }).first()
    await dateCell.click()
    await page.waitForTimeout(150)
    const fifthSelected = await page.locator('.calendar-cell.is-selected').filter({ hasText: /^5$/ }).count()
    check('11: 날짜 셀 클릭은 스와이프 영역 안에서도 정상 동작(회귀)', fifthSelected === 1, fifthSelected)

    await context.close()
  }

  // ---- 도크 ↻ 새로고침 버튼 ----
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } })
    const page = await context.newPage()
    let marketCalls = 0
    let calendarCalls = 0
    let weatherCalls = 0
    let calendarShouldFail = false
    // 최초 마운트 이후(수동 새로고침 클릭부터)는 응답을 일부러 250ms 늦춰서, "클릭 즉시 스피너
    // 표시 -> 진행 중 -> 완료" 세 상태를 안정적으로 관측할 수 있게 한다(목업이 너무 빨리
    // 끝나버리면 스피너 상태를 잡아낼 타이밍이 없어 테스트가 흔들릴 수 있음).
    let slowRoutes = false
    const maybeDelay = () => (slowRoutes ? new Promise((resolve) => setTimeout(resolve, 250)) : Promise.resolve())

    // 한국장/미국장 모두 닫힌 시각으로 고정 — "장 마감 시 캐시 재사용" 최적화가 자동 갱신에서는
    // 걸리지만, 수동 새로고침(force)은 이 최적화를 건너뛰고 무조건 다시 호출해야 한다는 것을
    // 검증하기 위한 전제조건이다(force 파라미터 배선 확인, marketService.ts).
    await page.route('**/api/market', async (route) => {
      marketCalls++
      await maybeDelay()
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(marketPayload()) })
    })
    await page.route('**/api/calendar-events', async (route) => {
      calendarCalls++
      await maybeDelay()
      if (calendarShouldFail) {
        route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) })
      }
    })
    await page.route('https://api.open-meteo.com/**', async (route) => {
      weatherCalls++
      await maybeDelay()
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          current: { temperature_2m: 25, weather_code: 1 },
          daily: { temperature_2m_max: [26, 27, 28, 29], temperature_2m_min: [20, 21, 22, 23], weather_code: [1, 1, 1, 1] },
        }),
      })
    })

    await page.clock.install({ time: new Date('2026-08-17T08:00:00.000Z') }) // 한/미 장 전부 닫힌 시각
    await page.addInitScript(() => window.localStorage.setItem('deskpad:view-mode', 'default'))
    await page.goto(BASE_URL)
    await page.waitForTimeout(500)

    // 시장은 캐시가 없는 최초 로딩이라 mount 시 이미 1회 호출됨(37번 정책) — 여기서 기준선을 잡는다.
    const marketAfterMount = marketCalls
    const calendarAfterMount = calendarCalls
    const weatherAfterMount = weatherCalls
    slowRoutes = true // 이제부터(수동 새로고침 클릭부터) 응답을 250ms 늦춘다.

    // 실제로 localStorage에 유효한 live 캐시를 심어, "장 마감 + 캐시 있음"이면 자동 갱신은
    // 네트워크를 안 부르는 상태를 만든다. 그 다음 수동 새로고침이 그래도 강제로 부르는지 확인한다.
    await page.evaluate((payload) => {
      const quotes = payload.quotes.map((q) => ({
        symbol: q.id,
        name: q.name,
        price: q.value,
        change: q.change,
        changePercent: q.changePercent,
        history: q.history,
        updatedAt: q.updatedAt,
      }))
      window.localStorage.setItem(
        'deskpad:market-cache',
        JSON.stringify({ version: 2, source: 'live', quotes, updatedAt: payload.updatedAt }),
      )
    }, marketPayload())

    const refreshBtn = page.locator('.dock-refresh-btn')

    // 클릭 즉시 스피너 클래스가 붙어야 한다.
    await refreshBtn.click()
    const spinningClass = await refreshBtn.getAttribute('class')
    check('12: 새로고침 클릭 즉시 스피너(is-spinning) 표시', spinningClass?.includes('is-spinning'), spinningClass)

    // 연타는 무시되어야 한다(진행 중 disabled).
    const disabledDuring = await refreshBtn.isDisabled()
    check('13: 진행 중에는 버튼 disabled(연속 클릭 방지)', disabledDuring, disabledDuring)
    await refreshBtn.click({ force: true }).catch(() => {}) // disabled라 실제로는 무시돼야 함

    await page.waitForTimeout(600)
    const doneClass = await refreshBtn.getAttribute('class')
    const doneLabel = await refreshBtn.innerText()
    check('14: 완료 후 스피너 해제 + 완료 표시(✓)', !doneClass?.includes('is-spinning') && doneLabel === '✓', { doneClass, doneLabel })

    check('15: 새로고침으로 날씨 API가 다시 호출됨', weatherCalls > weatherAfterMount, { weatherCalls, weatherAfterMount })
    check('16: 새로고침으로 캘린더 API가 다시 호출됨', calendarCalls > calendarAfterMount, { calendarCalls, calendarAfterMount })
    check(
      '17: 장 마감 + 유효 캐시 상태에서도 수동 새로고침은 /api/market을 강제로 다시 호출함(force)',
      marketCalls > marketAfterMount,
      { marketCalls, marketAfterMount },
    )

    // 일부 소스만 실패해도(캘린더) 전체가 실패 처리되지 않고 새로고침 자체는 정상 완료돼야 한다.
    calendarShouldFail = true
    const weatherBefore2 = weatherCalls
    await page.waitForTimeout(1600) // ✓ 배지가 사라질 시간을 확보
    await refreshBtn.click()
    await page.waitForTimeout(600)
    const afterPartialFailLabel = await refreshBtn.innerText()
    check(
      '18: 캘린더만 실패해도 새로고침 전체가 정상 완료(✓)되고 날씨는 갱신됨',
      afterPartialFailLabel === '✓' && weatherCalls > weatherBefore2,
      { afterPartialFailLabel, weatherCalls, weatherBefore2 },
    )

    await context.close()
  }

  await browser.close()
  console.log(JSON.stringify(results, null, 2))
  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    console.log('FAILED:', JSON.stringify(failed, null, 2))
    process.exitCode = 1
  } else {
    console.log('ALL CHECKS PASSED')
  }
}

main()
