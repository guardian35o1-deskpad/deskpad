import { chromium } from 'playwright'

// 17번(구형 iPad 실기기 테스트)에서 사용자가 발견한 "홈 화면 추가 후에도 Safari
// 주소창/툴바가 보인다"는 문제를 iOS standalone PWA 체크리스트 기준으로 점검한다.
// 프로덕션 빌드(vite preview)를 대상으로, 배포 전 마지막 확인 단계로 수행.
const BASE_URL = 'http://localhost:4241'

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
  const page = await context.newPage()

  const consoleLogs = []
  page.on('console', (msg) => {
    if (msg.text().includes('[DeskPad PWA]')) consoleLogs.push(msg.text())
  })

  await page.goto(BASE_URL)
  await page.waitForTimeout(500)

  const results = []

  // 1~9. index.html의 iOS standalone 체크리스트 (raw HTML에서 직접 확인 — 런타임 DOM 조작 영향 없음)
  const html = await page.evaluate(() => document.documentElement.outerHTML)
  const checks = [
    ['apple-mobile-web-app-capable=yes', /<meta[^>]*name="apple-mobile-web-app-capable"[^>]*content="yes"/],
    ['apple-mobile-web-app-status-bar-style=black-translucent', /<meta[^>]*name="apple-mobile-web-app-status-bar-style"[^>]*content="black-translucent"/],
    ['apple-mobile-web-app-title=DeskPad', /<meta[^>]*name="apple-mobile-web-app-title"[^>]*content="DeskPad"/],
    ['apple-touch-icon 링크(+ sizes 속성)', /<link[^>]*rel="apple-touch-icon"[^>]*sizes="180x180"[^>]*href="\/icons\/apple-touch-icon\.png"/],
    ['manifest 링크', /<link[^>]*rel="manifest"[^>]*href="\/manifest\.webmanifest"/],
    ['viewport-fit=cover', /<meta[^>]*name="viewport"[^>]*viewport-fit=cover/],
  ]
  for (const [label, re] of checks) {
    results.push({ check: `[index.html] ${label}`, ok: re.test(html) })
  }

  // 7. manifest.webmanifest 실제 응답 + 필드 검증(vite preview가 정적 파일을 그대로 서빙)
  const manifestRes = await page.request.get(`${BASE_URL}/manifest.webmanifest`)
  const manifestJson = await manifestRes.json().catch(() => null)
  results.push({
    check: 'manifest.webmanifest 200 응답 + display/start_url/scope 정상',
    ok:
      manifestRes.status() === 200 &&
      manifestJson?.display === 'standalone' &&
      manifestJson?.start_url === '/' &&
      manifestJson?.scope === '/',
    detail: { status: manifestRes.status(), manifestJson },
  })

  // 8. apple-touch-icon.png / icon-192 / icon-512 실제 응답 확인 (Netlify 대신 vite preview로 대리 검증)
  const iconChecks = await Promise.all(
    ['/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png'].map(async (p) => {
      const res = await page.request.get(`${BASE_URL}${p}`)
      return { path: p, status: res.status(), contentType: res.headers()['content-type'] }
    }),
  )
  results.push({
    check: '아이콘 3종(apple-touch-icon/192/512) 200 응답 + image/png',
    ok: iconChecks.every((c) => c.status === 200 && c.contentType?.includes('image/png')),
    detail: iconChecks,
  })

  // 9. 로드 시 다른 origin/URL로 리다이렉트되지 않는지 (최종 URL이 시작 URL과 동일 origin, 경로도 "/")
  results.push({
    check: '페이지 로드 시 리다이렉트 없음(최종 URL이 요청 URL과 동일)',
    ok: page.url() === `${BASE_URL}/`,
    detail: page.url(),
  })

  // 10. 진단 스크립트: 일반 브라우저(비-standalone)에서 isStandalone=false로 정확히 판정되는지
  const normalStatus = await page.evaluate(() => ({
    dataset: { ...document.documentElement.dataset },
  }))
  results.push({
    check: '진단: 일반 브라우저 컨텍스트에서 pwaStandalone=false로 정확히 판정',
    ok: normalStatus.dataset.pwaStandalone === 'false',
    detail: normalStatus.dataset,
  })
  results.push({
    check: '진단: 콘솔에 [DeskPad PWA] 로그가 화면 UI 없이 기록됨',
    ok: consoleLogs.length === 1,
    detail: consoleLogs,
  })

  // 11. 진단 로직 자체 검증: matchMedia(display-mode: standalone)를 강제로 true로 스텁했을 때
  //     isStandalone 판정이 올바르게 true로 뒤집히는지(코드 로직 정확성 확인, 실제 standalone 없이도 가능)
  const page2 = await context.newPage()
  await page2.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query) => {
      if (query === '(display-mode: standalone)') {
        return { matches: true, media: query, addListener() {}, removeListener() {} }
      }
      return originalMatchMedia(query)
    }
  })
  await page2.goto(BASE_URL)
  await page2.waitForTimeout(500)
  const stubbedStatus = await page2.evaluate(() => ({ ...document.documentElement.dataset }))
  results.push({
    check: '진단 로직 검증: display-mode:standalone 스텁 시 pwaStandalone=true로 정확히 반영',
    ok: stubbedStatus.pwaStandalone === 'true' && stubbedStatus.pwaDisplayModeStandalone === 'true',
    detail: stubbedStatus,
  })

  console.log(JSON.stringify(results, null, 2))
  await context.close()
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
