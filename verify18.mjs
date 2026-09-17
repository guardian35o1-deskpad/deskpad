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

// 실제로 디코딩 가능한 사진(canvas → PNG blob)을 지정한 가로/세로 크기로 심는다.
// AUTO FIT(가로=cover 한 장 / 세로·정사각=cover+dim+contain 3겹) 판정은 실제 이미지의
// naturalWidth/naturalHeight를 읽어야 하므로, 기존 seedOnePhoto의 가짜 바이트로는
// 이 판정을 검증할 수 없어 별도 헬퍼로 둔다.
async function seedPhotoWithSize(page, id, width, height) {
  await page.evaluate(
    async ({ id, width, height }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#3366cc'
      ctx.fillRect(0, 0, width, height)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('deskpad', 1)
        req.onupgradeneeded = () => {
          const d = req.result
          if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' })
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      await new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readwrite')
        tx.objectStore('photos').add({ id, blob, createdAt: Date.now(), active: true })
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    },
    { id, width, height },
  )
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

  // ---- 6) [42번 2차, 경로 B 가상 시계] 사진 모드는 mode='photo' 그 자체가 액자다.
  //     45분(가상)이 지나도 자동으로는 아무것도 바뀌지 않는다 — mode는 오직 도크 버튼
  //     또는 사진 배경을 직접 탭했을 때만 바뀐다. 30분 스크린세이버도 여전히 뜨지 않는다. ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.clock.install({ time: Date.now() })
    await page.goto(BASE_URL)
    await page.waitForTimeout(200)

    await page.click('.dock-btn:has-text("사진")')
    await page.waitForTimeout(100)
    const modeBefore = await page.evaluate(() => window.localStorage.getItem('deskpad:view-mode'))
    const backdropBefore = await page.evaluate(() => !!document.querySelector('.photo-mode-backdrop'))

    await page.clock.runFor(45 * 60 * 1000)

    const screensaverNotShown = await page.evaluate(() => !document.querySelector('.screensaver.is-visible'))
    const stillPhotoBackdrop = await page.evaluate(() => !!document.querySelector('.photo-mode-backdrop'))
    const headerStillPresent = await page.evaluate(() => !!document.querySelector('.app-header-row'))
    const modeAfter = await page.evaluate(() => window.localStorage.getItem('deskpad:view-mode'))

    check('6) 사진 모드로 전환됨(전제 조건)', modeBefore === 'photo' && backdropBefore)
    check(
      '6) 사진 모드에서는 45분(가상)이 지나도 30분 스크린세이버가 뜨지 않음(이미 액자라 불필요)',
      screensaverNotShown,
    )
    check('6) 45분이 지나도 탭/버튼 없이는 자동으로 기본 모드로 바뀌지 않음(photo-mode-backdrop 유지)', stillPhotoBackdrop)
    check('6) 사진 모드에서도 상단 시계+날씨(app-header-row)는 그대로 유지', headerStillPresent)
    check('6) viewMode="photo" 그대로 유지(자동 전환 없음)', modeAfter === 'photo')

    await context.close()
  }

  // ---- 7) [42번 2차 핵심] 사진 배경을 탭하면 임시로 정보만 보여주는 것이 아니라
  //     실제로 setMode('default')가 호출되어 mode 자체가 바뀐다. ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await page.waitForTimeout(200)

    await page.click('.dock-btn:has-text("사진")')
    await page.waitForTimeout(100)

    // 사진 배경 자체를 탭한다(사진 버튼이 아니라 화면 중앙의 사진 영역).
    await page.click('.photo-mode-backdrop')
    await page.waitForTimeout(100)

    const modeAfterTap = await page.evaluate(() => window.localStorage.getItem('deskpad:view-mode'))
    const backdropGone = await page.evaluate(() => !document.querySelector('.photo-mode-backdrop'))
    const defaultBtnActive = await page.evaluate(() =>
      document.querySelector('.dock-btn.active')?.textContent?.trim(),
    )
    const calendarShown = await page.evaluate(() => !!document.querySelector('.app-main'))

    check('7) 사진 배경 탭 → localStorage view-mode가 실제로 "default"로 바뀜', modeAfterTap === 'default')
    check('7) 탭 이후 photo-mode-backdrop(사진 배경)은 더 이상 없음', backdropGone)
    check('7) 도크의 [기본] 버튼이 active 상태로 표시됨', defaultBtnActive === '기본', defaultBtnActive)
    check('7) 달력(.app-main)이 다시 렌더링됨', calendarShown)

    await context.close()
  }

  // ---- 8) 도크 버튼 클릭이 사진 배경 탭으로 새지 않는다(⚙/↻ 클릭 시 mode가 실수로
  //     default로 바뀌면 안 됨 — 도크는 사진 배경의 형제 요소라 이벤트가 섞이지 않아야 한다). ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await page.waitForTimeout(200)

    await page.click('.dock-btn:has-text("사진")')
    await page.waitForTimeout(100)

    await page.click('button[aria-label="사진 관리 설정"]')
    await page.waitForTimeout(100)
    const modalOpen = await page.evaluate(() => !!document.querySelector('.photo-manager'))
    const modeAfterSettings = await page.evaluate(() => window.localStorage.getItem('deskpad:view-mode'))
    await page.click('.photo-manager-close')
    await page.waitForTimeout(100)

    await page.click('.dock-refresh-btn')
    await page.waitForTimeout(100)
    const modeAfterRefresh = await page.evaluate(() => window.localStorage.getItem('deskpad:view-mode'))

    check('8) 사진 모드에서 ⚙ 클릭 → 설정 모달이 정상적으로 열림', modalOpen)
    check('8) ⚙ 클릭이 사진 배경 탭으로 새지 않아 mode="photo" 유지', modeAfterSettings === 'photo')
    check('8) ↻ 클릭도 사진 배경 탭으로 새지 않아 mode="photo" 유지', modeAfterRefresh === 'photo')

    await context.close()
  }

  // ---- 9) 사진 모드에서는 하단 달력/일정/주식이 아예 렌더링되지 않는다(숨김이 아니라 언마운트). ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await page.waitForTimeout(200)

    const shownInDefault = await page.evaluate(
      () => !!document.querySelector('.app-main') && !!document.querySelector('.market'),
    )

    await page.click('.dock-btn:has-text("사진")')
    await page.waitForTimeout(100)
    const hiddenInPhoto = await page.evaluate(
      () => !document.querySelector('.app-main') && !document.querySelector('.market'),
    )
    const dockStillThere = await page.evaluate(() => !!document.querySelector('.control-dock'))

    check('9) 기본 모드에서는 달력(.app-main)/주식(.market) 모두 표시(전제 조건)', shownInDefault)
    check('9) 사진 모드에서는 달력/주식이 DOM에서 아예 사라짐', hiddenInPhoto)
    check('9) 사진 모드에서도 도크(.control-dock)는 그대로 표시', dockStillThere)

    await context.close()
  }

  // ---- 10) 기본 ↔ 사진 반복 전환이 대기시간 없이 매번 즉시 반영된다(단순 구조 확인). ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await page.waitForTimeout(200)

    await page.click('.dock-btn:has-text("사진")')
    await page.waitForTimeout(80)
    const firstPhoto = await page.evaluate(() => !!document.querySelector('.photo-mode-backdrop'))

    await page.click('.dock-btn:has-text("기본")')
    await page.waitForTimeout(80)
    const backToDefault = await page.evaluate(() => !!document.querySelector('.app-main'))

    await page.click('.dock-btn:has-text("사진")')
    await page.waitForTimeout(80)
    const secondPhoto = await page.evaluate(() => !!document.querySelector('.photo-mode-backdrop'))

    check('10) 기본 → [사진] 클릭 → 즉시 사진 배경 표시', firstPhoto)
    check('10) 사진 → [기본] 클릭 → 즉시 달력 화면 복귀', backToDefault)
    check('10) 기본 → [사진] 재클릭 → 대기시간 없이 다시 즉시 사진 표시', secondPhoto)

    await context.close()
  }

  // ---- 11) 상단 시계+날씨(app-header-row)는 기본/사진 모드와 무관하게 위치·크기가 그대로다. ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await page.waitForTimeout(200)

    const readHeaderBox = () =>
      page.evaluate(() => {
        const el = document.querySelector('.app-header-row')
        const r = el?.getBoundingClientRect()
        return r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
      })

    const headerInDefault = await readHeaderBox()

    await page.click('.dock-btn:has-text("사진")')
    await page.waitForTimeout(100)
    const headerInPhoto = await readHeaderBox()

    check('11) 기본 모드에서 헤더(시계+날씨) 위치/크기 확인(기준값)', !!headerInDefault, headerInDefault)
    check(
      '11) 사진 모드에서도 헤더 위치/크기 동일(상단 고정)',
      JSON.stringify(headerInDefault) === JSON.stringify(headerInPhoto),
      { headerInDefault, headerInPhoto },
    )

    await context.close()
  }

  // ---- 12) AUTO FIT: 가로 사진은 단일 cover, 세로/정사각 사진은 뒤(cover+dim)+앞(contain)
  //     3겹 구조로 렌더링된다. ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await seedPhotoWithSize(page, 'landscape-1', 1600, 900)
    await page.reload()
    await page.waitForTimeout(200)

    await page.click('.dock-btn:has-text("사진")')
    // Image() 로드 + 판정까지 약간의 시간을 둔다.
    await page.waitForTimeout(400)

    const landscapeIsSingleLayer = await page.evaluate(() => {
      const fill = document.querySelector('.photo-background-fill')
      const layers = document.querySelectorAll('.photo-mode-backdrop .photo-background')
      return !fill && layers.length === 1
    })
    check('12) 가로 사진(1600x900) → AUTO FIT 없이 단일 cover 레이어만 렌더링', landscapeIsSingleLayer)

    await context.close()
  }
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await seedPhotoWithSize(page, 'portrait-1', 900, 1600)
    await page.reload()
    await page.waitForTimeout(200)

    await page.click('.dock-btn:has-text("사진")')
    await page.waitForTimeout(400)

    const portraitIsAutoFit = await page.evaluate(() => {
      const fill = document.querySelector('.photo-mode-backdrop .photo-background-fill')
      const dim = document.querySelector('.photo-mode-backdrop .photo-background-fill-dim')
      const layers = document.querySelectorAll('.photo-mode-backdrop .photo-background')
      return !!fill && !!dim && layers.length === 2
    })
    check(
      '12) 세로 사진(900x1600) → AUTO FIT 적용(뒤 cover+dim, 앞 contain 2겹)',
      portraitIsAutoFit,
    )

    await context.close()
  }

  // ---- 13) iPad 핀치/더블탭 확대 방지용 viewport meta 값 확인 ----
  {
    const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await page.waitForTimeout(100)

    const viewportContent = await page.evaluate(
      () => document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
    )

    check(
      '13) viewport meta에 확대 방지 설정(maximum-scale=1.0, user-scalable=no) 포함',
      viewportContent.includes('maximum-scale=1.0') && viewportContent.includes('user-scalable=no'),
      viewportContent,
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
