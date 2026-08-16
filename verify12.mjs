import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const BASE_URL = 'http://localhost:4199'
const OUT_DIR = '/tmp/deskpad-shots14'
fs.mkdirSync(OUT_DIR, { recursive: true })

function todayAt(h, m) {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}
function daysFromNowAt(days, h, m) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

const events = [
  { id: 'e1', title: '인하대 병원 CT', start: todayAt(6, 30), end: todayAt(7, 0), allDay: false, location: '인하대학교병원, 대한민국 인천광역시 중구 인항로 27' },
  { id: 'u1', title: '빠지', start: daysFromNowAt(1, 9, 0), end: daysFromNowAt(1, 9, 0), allDay: false },
  { id: 'u2', title: '종합검진 예약', start: daysFromNowAt(5, 15, 17), end: daysFromNowAt(5, 15, 17), allDay: false, location: '서울삼성병원' },
  { id: 'u3', title: '회의', start: daysFromNowAt(9, 10, 0), end: daysFromNowAt(9, 10, 0), allDay: false, location: '본사 3층 회의실' },
  { id: 'u4', title: '가족 모임', start: daysFromNowAt(14, 18, 0), end: daysFromNowAt(14, 18, 0), allDay: false, location: '송정동' },
  { id: 'u5', title: '스케줄 초과분(5번째, 안 보여야 함)', start: daysFromNowAt(20, 9, 0), end: daysFromNowAt(20, 9, 0), allDay: false },
]

const weatherBody = JSON.stringify({
  current: { temperature_2m: 24, weather_code: 61 },
  daily: {
    time: ['t0', 't1', 't2', 't3'],
    temperature_2m_max: [26, 30, 32, 30],
    temperature_2m_min: [23, 24, 24, 24],
    weather_code: [61, 61, 3, 95],
  },
})

// 1x1 최소 PNG(빨강) — IndexedDB 시드용. 실제 사진 대신 색상 블록으로도 배경 레이어가
// 정상적으로 화면 전체를 덮는지(contain, 어두운 오버레이)는 충분히 검증 가능하다.
const TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

const VIEWPORTS = [
  { name: 'ipad-landscape', width: 2048, height: 1536 },
  { name: 'ipad-portrait', width: 1536, height: 2048 },
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
      route.fulfill({ status: 200, contentType: 'application/json', body: weatherBody }),
    )
    await page.goto(BASE_URL)
    await page.waitForTimeout(300)

    // IndexedDB에 사진 1장 시드 후 새로고침 — 실제 배경사진 레이어 확인용.
    await page.evaluate(
      ({ base64 }) =>
        new Promise((resolve, reject) => {
          const bin = atob(base64)
          const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          const blob = new Blob([bytes], { type: 'image/png' })
          const req = indexedDB.open('deskpad', 1)
          req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' })
          }
          req.onsuccess = () => {
            const db = req.result
            const tx = db.transaction('photos', 'readwrite')
            tx.objectStore('photos').add({ id: 'seed-1', blob, createdAt: Date.now() })
            tx.oncomplete = () => resolve(true)
            tx.onerror = () => reject(tx.error)
          }
          req.onerror = () => reject(req.error)
        }),
      { base64: TEST_PNG_BASE64 },
    )

    await page.reload()
    await page.waitForTimeout(500)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForTimeout(500)

    // 1. 스크롤 없음
    const overflow = await page.evaluate(() => ({
      scrollH: document.documentElement.scrollHeight,
      clientH: document.documentElement.clientHeight,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }))
    results.push({
      check: `[${vp.name}] 스크롤 없음`,
      ok: overflow.scrollH <= overflow.clientH + 2 && overflow.scrollW <= overflow.clientW + 2,
      detail: overflow,
    })

    // 2. 사진 배경 레이어가 기본 모드에도 존재(홈 화면)
    const photoLayerVisible = await page.locator('.photo-background-layer').first().isVisible()
    results.push({ check: `[${vp.name}] 기본 모드에서도 사진 배경 레이어 표시`, ok: photoLayerVisible })

    // 3. 다가오는 일정 최대 4건까지만 표시(5번째는 숨김)
    const upcomingCount = await page.locator('.upcoming-list .upcoming-card').count()
    const scheduleAreaText = await page.locator('.calendar-schedule-area').innerText()
    results.push({
      check: `[${vp.name}] 다가오는 일정 최대 4건 리스트(5번째는 잘림)`,
      ok: upcomingCount === 4 && !scheduleAreaText.includes('스케줄 초과분'),
      detail: upcomingCount,
    })

    // 4. 카드 4개(주가)
    const marketCount = await page.locator('.market-item').count()
    results.push({ check: `[${vp.name}] 주가 카드 4개`, ok: marketCount === 4 })

    // 5. 병원 일정 유지
    results.push({ check: `[${vp.name}] 병원 일정 🏥 유지`, ok: scheduleAreaText.includes('🏥 인하대 병원 CT') })

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
