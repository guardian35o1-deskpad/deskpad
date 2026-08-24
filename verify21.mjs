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

  // ---- 오늘 날짜 자동 갱신(useTodaySync) ----
  // Calendar.tsx의 today가 useMemo(..., [])로 최초 1회만 고정되던 버그 수정(2026-08-24) 검증.
  // 자정을 넘겨도 "오늘" 원형 표시가 갱신되는지, 백그라운드/화면 꺼짐 후 복귀(visibilitychange)
  // 시에도 즉시 재계산되는지, 사용자가 다른 날짜를 보고 있을 때는 선택을 자동으로 옮기지
  // 않는지, "오늘" 버튼과 is-today/is-selected CSS 겹침이 정상인지 확인한다.
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } })
    const page = await context.newPage()
    await page.route('**/api/market', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(marketPayload()) }),
    )
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
    // 브라우저 타임존이 UTC라(위 스와이프 블록과 동일 전제), UTC 기준 날짜 경계로 시각을 고정한다.
    await page.clock.install({ time: new Date('2026-08-17T10:00:00.000Z') })
    await page.addInitScript(() => window.localStorage.setItem('deskpad:view-mode', 'default'))
    await page.goto(BASE_URL)
    await page.waitForSelector('.calendar-month-title')
    await page.waitForTimeout(400)

    const todayCellDay = () => page.locator('.calendar-cell.is-today .calendar-cell-day').innerText()
    check('19: 초기 오늘 표시 = 17일', (await todayCellDay()) === '17', await todayCellDay())

    // 화면이 꺼져 있던 동안(백그라운드/suspend) 자정을 넘겼다고 가정한다. setSystemTime은
    // 대기 중인 타이머를 실행하지 않고 시각만 순간이동시켜, 구형 iPad가 백그라운드에서
    // setTimeout을 못 돌리는 상황을 그대로 재현한다 — 그 다음 화면이 다시 보이면
    // (visibilitychange) useTodaySync의 안전망이 재계산해야 한다.
    await page.clock.setSystemTime(new Date('2026-08-18T09:00:00.000Z'))
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      // 실제 기기라면 화면을 다시 보는 순간 사용자가 손으로 터치하기 마련이다 — 그 "조작"
      // 신호(useLongIdleTimer.ts의 ACTIVITY_EVENTS)를 함께 보내, 시간이 하루 이상 순간이동한
      // 것 때문에 30분 대기(Idle) 화면이 끼어들어 이후 클릭을 가로채는 것을 막는다(오늘 날짜
      // 갱신 로직과는 무관한, Idle 타이머의 정상 동작 — 여기서는 건드리지 않고 테스트에서만
      // 우회한다).
      window.dispatchEvent(new Event('pointerdown'))
    })
    await page.waitForTimeout(200)

    check('20: 백그라운드 복귀(visibilitychange) 시 오늘 표시가 18일로 갱신됨', (await todayCellDay()) === '18', await todayCellDay())

    const selectedAfterRollover = await page
      .locator('.calendar-cell.is-today.is-selected .calendar-cell-day')
      .innerText()
      .catch(() => null)
    check(
      '21: 자정 경과 시점에 계속 "오늘"을 보고 있었다면 선택도 새 오늘(18일)로 함께 이동',
      selectedAfterRollover === '18',
      selectedAfterRollover,
    )

    // 다른 날짜(5일)를 수동으로 선택해둔 상태에서 다시 하루가 더 지나도, 선택은 사용자 뜻대로
    // 그대로 두고 "오늘" 원형 표시만 옮겨가야 한다.
    const dateCell5 = page.locator('.calendar-cell:not(.is-outside)').filter({ hasText: /^5$/ }).first()
    await dateCell5.click()
    await page.waitForTimeout(150)
    const selected5 = await page.locator('.calendar-cell.is-selected .calendar-cell-day').innerText()
    check('22: 5일 수동 선택 확인(다음 단계 전제)', selected5 === '5', selected5)

    await page.clock.setSystemTime(new Date('2026-08-19T09:00:00.000Z'))
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      // 실제 기기라면 화면을 다시 보는 순간 사용자가 손으로 터치하기 마련이다 — 그 "조작"
      // 신호(useLongIdleTimer.ts의 ACTIVITY_EVENTS)를 함께 보내, 시간이 하루 이상 순간이동한
      // 것 때문에 30분 대기(Idle) 화면이 끼어들어 이후 클릭을 가로채는 것을 막는다(오늘 날짜
      // 갱신 로직과는 무관한, Idle 타이머의 정상 동작 — 여기서는 건드리지 않고 테스트에서만
      // 우회한다).
      window.dispatchEvent(new Event('pointerdown'))
    })
    await page.waitForTimeout(200)

    check('23: 다른 날짜를 보던 중 자정이 지나도 오늘 표시는 19일로 갱신됨', (await todayCellDay()) === '19', await todayCellDay())
    const stillSelected5 = await page.locator('.calendar-cell.is-selected .calendar-cell-day').innerText()
    check('24: 사용자가 수동 선택한 날짜(5일)는 자동으로 옮겨지지 않고 그대로 유지', stillSelected5 === '5', stillSelected5)
    const todayAndSelectedOverlap = await page.locator('.calendar-cell.is-today.is-selected').count()
    check('25: 이 상태에서 오늘(19일)과 선택(5일)이 겹치지 않음(서로 다른 셀)', todayAndSelectedOverlap === 0, todayAndSelectedOverlap)

    // "오늘" 버튼을 누르면 현재 월로 이동 + 오늘 날짜 선택.
    await page.locator('.calendar-today-btn').click()
    await page.waitForTimeout(150)
    const afterTodayBtn = await page
      .locator('.calendar-cell.is-today.is-selected .calendar-cell-day')
      .innerText()
      .catch(() => null)
    check('26: "오늘" 버튼 클릭 시 오늘(19일)이 선택 상태가 됨(is-today + is-selected 겹침)', afterTodayBtn === '19', afterTodayBtn)

    // is-today(파란 원)와 is-selected(테두리)가 같은 셀에 겹칠 때 두 스타일이 서로를 지우지
    // 않고 함께 적용돼야 한다(요구사항 5: CSS 우선순위 점검) — App.css는 이미 서로 다른
    // 속성(background-color / box-shadow)에 각각 적용돼 있어(407~415행) 코드 변경은 없었고,
    // 실제 계산된 스타일로 그 전제가 맞는지 확인만 한다.
    const composedStyle = await page.evaluate(() => {
      const el = document.querySelector('.calendar-cell.is-today.is-selected .calendar-cell-day')
      if (!el) return null
      const style = window.getComputedStyle(el)
      return { backgroundColor: style.backgroundColor, boxShadow: style.boxShadow }
    })
    check(
      '27: 오늘+선택 겹침 시 파란 배경(is-today)과 테두리(is-selected)가 서로 지우지 않고 함께 적용됨',
      composedStyle?.backgroundColor === 'rgb(42, 107, 255)' && !!composedStyle?.boxShadow && composedStyle.boxShadow !== 'none',
      composedStyle,
    )

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
