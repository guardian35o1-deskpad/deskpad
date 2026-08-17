import { chromium } from 'playwright'

// 30분 무조작 시 전체 화면 대기(디지털 액자, ScreenSaver) 전환 기능 검증.
// 두 가지 코드 경로를 모두 검증한다:
//  A) "이미 30분이 지난 채로 (재)시작"됨 — localStorage에 과거 lastInteractionAt을 미리
//     심어 두고 로드 → useLongIdleTimer의 마운트 시점 즉시-판정 로직(구형 iPad가 화면 꺼짐/
//     백그라운드에서 돌아왔을 때와 동일 경로).
//  B) "앱을 계속 켜 둔 채로 30분이 흐름" — Playwright의 가상 시계(page.clock)로 실제 setInterval
//     폴링이 여러 번 실행되게 하여, 실행 중 자연스럽게 30분이 지나는 경우를 그대로 재현.
const BASE_URL = 'http://localhost:4300'

const results = []
function check(label, ok, detail) {
  results.push({ check: label, ok, detail })
}

async function seedOnePhoto(page) {
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('deskpad', 1)
      req.onupgradeneeded = () => {
        const d = req.result
        if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite')
      tx.objectStore('photos').add({ id: 'test-1', blob, createdAt: Date.now() })
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
}

async function setOldLastInteraction(context) {
  await context.addInitScript(() => {
    const thirtyOneMinAgo = Date.now() - 31 * 60 * 1000
    window.localStorage.setItem('deskpad:last-interaction-at', String(thirtyOneMinAgo))
  })
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

  // ---- 1) [경로 A] 사진이 있는 상태로 30분 지난 채 시작 → 스크린세이버(사진+시계) 표시 ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    await setOldLastInteraction(context)
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await seedOnePhoto(page)
    await page.reload()
    await page.waitForTimeout(600)

    const visible = await page.evaluate(() => !!document.querySelector('.screensaver.is-visible'))
    check('1) 사진 있음 + 30분 경과 상태로 시작 → .screensaver.is-visible', visible)

    const hasPhotoBg = await page
      .waitForSelector('.screensaver.is-visible .photo-background', { timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    check('1) 스크린세이버에 등록 사진(PhotoBackground) 렌더링됨', hasPhotoBg)

    const dashboardStillThere = await page.evaluate(() => !!document.querySelector('.app-content'))
    check('1) 대시보드 DOM은 여전히 존재(오버레이일 뿐, 상태 파괴 아님)', dashboardStillThere)

    await context.close()
  }

  // ---- 2) [경로 A] 사진이 없는 상태로 30분 지난 채 시작 → 기본 자연풍경 + 시계 fallback ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    await setOldLastInteraction(context)
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await page.waitForTimeout(600)

    const visible = await page.evaluate(() => !!document.querySelector('.screensaver.is-visible'))
    check('2) 사진 없음 + 30분 경과 상태로 시작 → .screensaver.is-visible', visible)

    const fallback = await page.evaluate(
      () => !!document.querySelector('.screensaver.is-visible .default-background'),
    )
    check('2) 사진 없을 때 기본 자연풍경(default-background)으로 fallback', fallback)

    const clockShown = await page.evaluate(() => {
      const el = document.querySelector('.screensaver.is-visible .screensaver-time')
      return !!el && /\d{2}:\d{2}/.test(el.textContent || '')
    })
    check('2) 스크린세이버에 시:분 시계 표시', clockShown)

    await context.close()
  }

  // ---- 3) [경로 A] 스크린세이버 표시 중 터치 → 즉시 사라지고(원래 화면 복귀) 타이머 리셋 ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    await setOldLastInteraction(context)
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await page.waitForTimeout(600)

    const wasVisible = await page.evaluate(() => !!document.querySelector('.screensaver.is-visible'))

    // 실제 터치를 흉내: pointerdown 디스패치(앱 전체 window 리스너가 감지)
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    await page.waitForTimeout(200)

    const hiddenAfterTap = await page.evaluate(() => !document.querySelector('.screensaver.is-visible'))
    const dashboardVisible = await page.evaluate(() => {
      const el = document.querySelector('.app-content')
      return !!el && getComputedStyle(el).opacity !== '0'
    })
    const timerReset = await page.evaluate(() => {
      const v = Number(window.localStorage.getItem('deskpad:last-interaction-at'))
      return Number.isFinite(v) && Date.now() - v < 5000
    })

    check('3) 터치 전 스크린세이버 표시 상태였음(전제 조건)', wasVisible)
    check('3) 터치 즉시 스크린세이버 사라짐(원래 화면 복귀)', hiddenAfterTap)
    check('3) 복귀 후 기본 정보 화면(app-content) opacity 정상(1)', dashboardVisible)
    check('3) 터치 시 lastInteractionAt이 현재 시각으로 갱신(30분 타이머 재시작)', timerReset)

    await context.close()
  }

  // ---- 4) Calendar 자동 갱신 같은 내부 이벤트는 타이머를 초기화하지 않음 ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await page.waitForTimeout(300)

    const before = await page.evaluate(() => window.localStorage.getItem('deskpad:last-interaction-at'))
    await page.evaluate(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      window.dispatchEvent(new Event('some-internal-refresh-event', { bubbles: true }))
    })
    await page.waitForTimeout(200)
    const after = await page.evaluate(() => window.localStorage.getItem('deskpad:last-interaction-at'))

    check(
      '4) mousemove/내부 이벤트로는 lastInteractionAt이 바뀌지 않음(자동 갱신이 조작으로 오인되지 않음)',
      before === after,
      { before, after },
    )

    await context.close()
  }

  // ---- 5) [경로 B, 가상 시계] 켜 둔 채로 30분 경과 + 설정 모달이 열려 있으면 전환 보류(suspend) ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.clock.install({ time: Date.now() })
    await page.goto(BASE_URL)
    await page.waitForTimeout(200)

    await page.click('button[aria-label="사진 관리 설정"]')
    await page.waitForTimeout(100)
    const modalOpen = await page.evaluate(() => !!document.querySelector('.photo-manager'))

    // 설정 모달을 열어 둔 채로 실제 시간 흐름을 가상으로 31분 진행(내부 setInterval이 실제로 여러 번 실행됨).
    await page.clock.runFor(31 * 60 * 1000)
    const stillHiddenWhileModalOpen = await page.evaluate(
      () => !document.querySelector('.screensaver.is-visible'),
    )

    // 모달을 "닫는 클릭" 자체도 실제 조작이므로 그 시점부터 30분 타이머가 다시 시작된다.
    // 닫은 직후에는 아직 스크린세이버가 뜨면 안 되고, 그 뒤로 다시 30분(가상)이 지나야 뜬다.
    await page.click('.photo-manager-close')
    await page.waitForTimeout(100)
    const hiddenRightAfterClose = await page.evaluate(
      () => !document.querySelector('.screensaver.is-visible'),
    )

    await page.clock.runFor(31 * 60 * 1000)
    const shownAfterAnother31Min = await page.evaluate(
      () => !!document.querySelector('.screensaver.is-visible'),
    )

    check('5) 설정 모달 열림 확인(전제 조건)', modalOpen)
    check('5) 설정 모달이 열린 채로 30분(가상) 경과해도 스크린세이버가 뜨지 않음(suspend)', stillHiddenWhileModalOpen)
    check(
      '5) 모달을 닫는 클릭도 조작으로 인정되어 타이머가 재시작됨(닫은 직후엔 뜨지 않음)',
      hiddenRightAfterClose,
    )
    check('5) 모달을 닫은 뒤 다시 30분(가상) 조작이 없으면 정상적으로 스크린세이버 표시', shownAfterAnother31Min)

    await context.close()
  }

  // ---- 6) [경로 B, 가상 시계] 사진 모드는 이미 액자 화면이므로 30분이 지나도
  //     스크린세이버 오버레이를 추가로 띄우지 않는다(최신 규칙: 30분 Idle은 기본 모드 전용). ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.clock.install({ time: Date.now() })
    await page.goto(BASE_URL)
    await page.waitForTimeout(200)

    await page.click('.dock-btn:has-text("사진")')
    await page.waitForTimeout(100)
    const modeBefore = await page.evaluate(() => window.localStorage.getItem('deskpad:view-mode'))

    await page.clock.runFor(45 * 60 * 1000)
    const screensaverNotShown = await page.evaluate(() => !document.querySelector('.screensaver.is-visible'))
    // 사진 모드 자체의 기존 "탭→30초간 Dashboard→자동 복귀" 동작(15번)은 이번 변경과
    // 무관하게 그대로 살아있어야 한다 — idle-layer(사진 모드 전용)는 여전히 존재.
    const photoModeIdleLayerPresent = await page.evaluate(() => !!document.querySelector('.idle-layer'))
    const modeAfter = await page.evaluate(() => window.localStorage.getItem('deskpad:view-mode'))

    check('6) 사진 모드로 전환됨(전제 조건)', modeBefore === 'photo')
    check(
      '6) 사진 모드에서는 45분(가상)이 지나도 30분 스크린세이버가 뜨지 않음(이미 액자라 불필요)',
      screensaverNotShown,
    )
    check('6) 사진 모드 전용 idle-layer(15번, 탭-리빌 30초 타이머)는 그대로 존재', photoModeIdleLayerPresent)
    check('6) viewMode="photo" 그대로 유지', modeAfter === 'photo')

    await context.close()
  }

  // ---- 7) [경로 B, 가상 시계] 사진 모드에서 오래 있다가 기본 모드로 전환 → 그 시점부터
  //     새로 30분을 세고, 지나면 정상적으로 스크린세이버 표시 ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.clock.install({ time: Date.now() })
    await page.goto(BASE_URL)
    await page.waitForTimeout(200)

    await page.click('.dock-btn:has-text("사진")')
    await page.waitForTimeout(100)
    await page.clock.runFor(45 * 60 * 1000) // 사진 모드에서 오래 방치(카운트되지 않아야 함)

    // 45분 방치로 사진 모드 자체의 idle-screen(15번, 탭-리빌 30초 타이머)이 사진+시계 화면을
    // 덮고 있어 도크 버튼을 가리므로, 먼저 터치해 정보 Dashboard를 잠깐 띄운 뒤 버튼을 누른다
    // (실기기에서도 동일한 순서로만 도크에 접근 가능).
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    await page.waitForTimeout(200)

    // 기본 모드로 전환하는 클릭 자체가 조작이므로, 그 시점부터 30분을 다시 센다.
    await page.click('.dock-btn:has-text("기본")')
    await page.waitForTimeout(100)
    const shownRightAfterSwitch = await page.evaluate(
      () => !document.querySelector('.screensaver.is-visible'),
    )

    await page.clock.runFor(31 * 60 * 1000)
    const shownAfter31MinInDefault = await page.evaluate(
      () => !!document.querySelector('.screensaver.is-visible'),
    )

    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    await page.waitForTimeout(200)
    const hiddenAfterTap = await page.evaluate(() => !document.querySelector('.screensaver.is-visible'))
    const modeAfterTap = await page.evaluate(() => window.localStorage.getItem('deskpad:view-mode'))

    check('7) 기본 모드로 전환한 직후엔 스크린세이버가 뜨지 않음(전환 자체가 조작으로 인정)', shownRightAfterSwitch)
    check('7) 기본 모드에서 다시 30분(가상) 지나면 정상적으로 스크린세이버 표시', shownAfter31MinInDefault)
    check('7) 터치하면 사라지고, 이미 기본 모드였으므로 자연히 기본 정보화면으로 복귀', hiddenAfterTap)
    check('7) viewMode="default" 그대로 유지(도크 버튼으로만 변경되는 원칙 유지)', modeAfterTap === 'default')

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
