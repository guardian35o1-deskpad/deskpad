import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const BASE_URL = 'http://localhost:4199'
const OUT_DIR = '/tmp/deskpad-shots13'
fs.mkdirSync(OUT_DIR, { recursive: true })

const events = [
  { id: 'e1', title: '인하대 병원 CT', start: (() => { const d = new Date(); d.setHours(6, 30, 0, 0); return d.toISOString() })(), end: (() => { const d = new Date(); d.setHours(7, 0, 0, 0); return d.toISOString() })(), allDay: false, location: '인하대학교병원, 대한민국 인천광역시 중구 인항로 27' },
]
const future = new Date()
future.setDate(future.getDate() + 5)
events.push({ id: 'e2', title: '종합검진 예약', start: future.toISOString(), end: future.toISOString(), allDay: false, location: '서울삼성병원' })

const VIEWPORTS = [
  { name: 'desktop-landscape', width: 1600, height: 1000 },
  { name: 'ipad-pro1-97-landscape', width: 2048, height: 1536 },
  { name: 'ipad-pro1-97-portrait', width: 1536, height: 2048 },
  { name: 'ipad-small-landscape', width: 1024, height: 768 },
]

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const results = []

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await context.newPage()
    await page.addInitScript(() => window.localStorage.setItem('deskpad:view-mode', 'default'))
    await page.route('**/api/calendar-events', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events }) }),
    )
    await page.route('**/api.open-meteo.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          current: { temperature_2m: 24, weather_code: 61 },
          daily: {
            time: ['t0', 't1', 't2', 't3'],
            temperature_2m_max: [26, 30, 32, 30],
            temperature_2m_min: [23, 24, 24, 24],
            weather_code: [61, 61, 3, 95],
          },
        }),
      }),
    )
    await page.goto(BASE_URL)
    await page.waitForTimeout(500)
    // 개발 서버(StrictMode 이중 실행) 한정으로 최초 마운트 fetch가 abort로 씹히는 케이스가
    // 있어(아래 보고 참고), 스크린샷 검증 목적상 visibilitychange를 한 번 더 흘려보내
    // 강제로 한 번 더 fetch를 트리거한다 — 프로덕션 빌드에는 해당 없는 테스트 전용 우회.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForTimeout(500)

    // 1. 스크롤/overflow 여부 확인 — 탁상 디스플레이는 스크롤이 없어야 한다.
    const overflow = await page.evaluate(() => ({
      docScrollH: document.documentElement.scrollHeight,
      docClientH: document.documentElement.clientHeight,
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
    }))
    results.push({
      check: `[${vp.name}] 세로/가로 스크롤 없음(scrollHeight<=clientHeight+2, scrollWidth<=clientWidth+2)`,
      ok: overflow.docScrollH <= overflow.docClientH + 2 && overflow.docScrollW <= overflow.docClientW + 2,
      detail: overflow,
    })

    // 2. 시계 텍스트가 보이는지 + 초 요소 존재
    const clockOk = await page.locator('.clock-time').isVisible()
    const secondsOk = await page.locator('.clock-seconds').isVisible()
    results.push({ check: `[${vp.name}] 시계(.clock-time)와 초(.clock-seconds) 표시`, ok: clockOk && secondsOk })

    // 3. 병원 일정 표시 유지
    const scheduleText = await page.locator('.calendar-schedule-area').innerText()
    results.push({ check: `[${vp.name}] 병원 일정 🏥 아이콘 유지`, ok: scheduleText.includes('🏥 인하대 병원 CT') })

    // 4. 주요 섹션 모두 보임(잘림 없이)
    const sections = ['.app-header-row', '.calendar-panel', '.app-footer', '.market']
    let allVisible = true
    for (const sel of sections) {
      const visible = await page.locator(sel).first().isVisible()
      if (!visible) allVisible = false
    }
    results.push({ check: `[${vp.name}] 헤더/달력/푸터/주가 섹션 모두 표시`, ok: allVisible })

    await page.screenshot({ path: path.join(OUT_DIR, `${vp.name}.png`) })
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
