import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const BASE_URL = 'http://localhost:4198'
const OUT_DIR = '/tmp/deskpad-shots12'
fs.mkdirSync(OUT_DIR, { recursive: true })

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const results = []

  // ---- A. PWA manifest / apple 메타 태그 ----
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } })
    const page = await context.newPage()
    await page.addInitScript(() => window.localStorage.setItem('deskpad:view-mode', 'default'))
    await page.route('**/api/calendar-events', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) }),
    )
    await page.goto(BASE_URL)
    await page.waitForTimeout(300)

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
    results.push({ check: 'A1: manifest link 존재', ok: manifestHref === '/manifest.webmanifest' })

    const manifestRes = await page.request.get(`${BASE_URL}/manifest.webmanifest`)
    const manifestJson = await manifestRes.json()
    results.push({
      check: 'A2: manifest 필드(display=standalone, name=DeskPad, icons 2개)',
      ok:
        manifestJson.display === 'standalone' &&
        manifestJson.name === 'DeskPad' &&
        Array.isArray(manifestJson.icons) &&
        manifestJson.icons.length === 2,
      detail: manifestJson,
    })

    const appleTouchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
    results.push({ check: 'A3: apple-touch-icon link 존재', ok: appleTouchIcon === '/icons/apple-touch-icon.png' })

    const iconRes = await page.request.get(`${BASE_URL}/icons/apple-touch-icon.png`)
    results.push({ check: 'A4: apple-touch-icon.png 실제 200 응답', ok: iconRes.status() === 200 })

    const capable = await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content')
    results.push({ check: 'A5: apple-mobile-web-app-capable = yes', ok: capable === 'yes' })

    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content')
    results.push({ check: 'A6: theme-color = #05060a(앱 배경과 동일)', ok: themeColor === '#05060a' })

    const title = await page.title()
    results.push({ check: 'A7: 문서 title = DeskPad', ok: title === 'DeskPad' })

    await context.close()
  }

  // ---- B. 사진 배치 중 일부 실패해도 나머지는 정상 등록되는지 ----
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 1024 } })
    const page = await context.newPage()
    await page.addInitScript(() => window.localStorage.setItem('deskpad:view-mode', 'default'))
    await page.route('**/api/calendar-events', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) }),
    )
    await page.goto(BASE_URL)
    await page.waitForTimeout(300)

    // 설정 열기
    await page.getByRole('button', { name: '사진 관리 설정' }).click()
    await page.waitForTimeout(200)

    // 정상 PNG 2장 + "이미지가 아닌 파일"(디코드 실패 유도) 1장 섞어서 한 번에 선택
    const validPng = await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 40
      canvas.height = 30
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 40, 30)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      const buf = await blob.arrayBuffer()
      return Array.from(new Uint8Array(buf))
    })

    const fileInput = page.locator('.photo-manager-file-input')
    await fileInput.setInputFiles([
      { name: 'photo1.png', mimeType: 'image/png', buffer: Buffer.from(validPng) },
      { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from([0x00, 0x01, 0x02, 0x03]) }, // 손상된 파일 -> 디코드 실패 유도
      { name: 'photo2.png', mimeType: 'image/png', buffer: Buffer.from(validPng) },
    ])

    await page.waitForTimeout(1500)

    const summaryText = await page.locator('.photo-manager-summary').innerText()
    results.push({
      check: 'B1: 3장 중 1장 실패해도 나머지 2장은 등록됨(등록된 사진 2장)',
      ok: summaryText.includes('2장'),
      detail: summaryText,
    })

    const errorText = await page.locator('.photo-manager-error').innerText().catch(() => '')
    results.push({
      check: 'B2: 실패 안내 문구 표시(몇 장 실패했는지 + 나머지는 정상 등록 안내)',
      ok: errorText.includes('1장') && errorText.includes('2장'),
      detail: errorText,
    })

    const items = await page.locator('.photo-manager-item').count()
    results.push({ check: 'B3: 사진 목록에 정확히 2개 항목 표시', ok: items === 2 })

    await page.screenshot({ path: path.join(OUT_DIR, '1-partial-failure.png') })
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
