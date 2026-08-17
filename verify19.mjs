import { chromium } from 'playwright'

// 사진 관리 화면 개편(썸네일 그리드 + 체크로 액자 사용 on/off) 검증.
// 34번까지의 기능(30분 대기 화면 등)에는 손대지 않았으므로 여기서는 새 기능만 확인한다.
const BASE_URL = 'http://localhost:4300'
const TEST_IMAGES = ['/tmp/photofix/test1.jpg', '/tmp/photofix/test2.jpg', '/tmp/photofix/test3.jpg']

const results = []
function check(label, ok, detail) {
  results.push({ check: label, ok, detail })
}

async function openSettings(page) {
  await page.click('button[aria-label="사진 관리 설정"]')
  await page.waitForSelector('.photo-manager')
}

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
  const context = await browser.newContext({ viewport: { width: 2048, height: 1536 } })
  const page = await context.newPage()
  await page.goto(BASE_URL)
  await page.waitForTimeout(300)

  // ---- 1) 빈 상태 ----
  await openSettings(page)
  const emptyShown = await page.evaluate(() => !!document.querySelector('.photo-manager-empty'))
  const summaryEmpty = await page.evaluate(
    () => document.querySelector('.photo-manager-summary')?.textContent,
  )
  check('1) 사진 없을 때 빈 상태 문구 표시', emptyShown)
  check('1) 요약 텍스트: "등록된 사진 0장 · 액자 사용 0장"', summaryEmpty === '등록된 사진 0장 · 액자 사용 0장', summaryEmpty)

  // ---- 2) 사진 3장 업로드 → 썸네일 그리드 + 기본 active=true ----
  const fileInput = await page.$('.photo-manager-file-input')
  await fileInput.setInputFiles(TEST_IMAGES)
  await page.waitForFunction(
    () => document.querySelectorAll('.photo-manager-cell').length === 3,
    { timeout: 15000 },
  )
  await page.waitForTimeout(300)

  const cellCount = await page.evaluate(() => document.querySelectorAll('.photo-manager-cell').length)
  const allActiveByDefault = await page.evaluate(
    () => document.querySelectorAll('.photo-manager-cell.is-inactive').length === 0,
  )
  const thumbsHaveImage = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.photo-manager-thumb')).every(
      (el) => el.style.backgroundImage && el.style.backgroundImage.includes('blob:'),
    ),
  )
  const summaryAfterAdd = await page.evaluate(
    () => document.querySelector('.photo-manager-summary')?.textContent,
  )

  check('2) 사진 3장 추가 → 그리드 셀 3개', cellCount === 3, cellCount)
  check('2) 새로 추가한 사진은 기본적으로 액자 사용(active=true) 상태', allActiveByDefault)
  check('2) 각 셀에 썸네일 object URL(blob:)이 배경으로 렌더링됨', thumbsHaveImage)
  check(
    '2) 요약: "등록된 사진 3장 · 액자 사용 3장"',
    summaryAfterAdd === '등록된 사진 3장 · 액자 사용 3장',
    summaryAfterAdd,
  )

  // ---- 3) 체크 해제 → 보관은 유지, 액자 사용 수만 감소 ----
  await page.click('.photo-manager-cell:nth-child(1) .photo-manager-check')
  await page.waitForTimeout(150)
  const firstCellInactive = await page.evaluate(() =>
    document.querySelector('.photo-manager-cell:nth-child(1)')?.classList.contains('is-inactive'),
  )
  const cellCountAfterUncheck = await page.evaluate(
    () => document.querySelectorAll('.photo-manager-cell').length,
  )
  const summaryAfterUncheck = await page.evaluate(
    () => document.querySelector('.photo-manager-summary')?.textContent,
  )

  check('3) 체크 해제한 사진의 셀에 is-inactive 클래스 부여(썸네일 어둡게)', firstCellInactive === true)
  check('3) 체크 해제해도 사진 자체는 그리드에서 사라지지 않음(3장 유지)', cellCountAfterUncheck === 3)
  check(
    '3) 요약: "등록된 사진 3장 · 액자 사용 2장"(삭제 아니라 액자 사용만 감소)',
    summaryAfterUncheck === '등록된 사진 3장 · 액자 사용 2장',
    summaryAfterUncheck,
  )

  // ---- 4) 전체 해제 / 전체 선택 ----
  await page.click('button:has-text("전체 해제")')
  await page.waitForTimeout(150)
  const allInactive = await page.evaluate(
    () => document.querySelectorAll('.photo-manager-cell.is-inactive').length === 3,
  )
  await page.click('button:has-text("전체 선택")')
  await page.waitForTimeout(150)
  const allActiveAgain = await page.evaluate(
    () => document.querySelectorAll('.photo-manager-cell.is-inactive').length === 0,
  )

  check('4) "전체 해제" 클릭 → 3장 모두 비활성', allInactive)
  check('4) "전체 선택" 클릭 → 3장 모두 다시 활성', allActiveAgain)

  // ---- 5) 큰 미리보기(사진 본체 클릭) ----
  await page.click('.photo-manager-cell:nth-child(1) .photo-manager-thumb')
  await page.waitForSelector('.photo-preview-backdrop', { timeout: 3000 })
  // object URL은 useObjectUrls의 useEffect(렌더 이후)에서 생성되므로, backdrop이
  // 나타난 직후 바로 확인하면 아직 src가 비어 있을 수 있다 — 한 프레임 더 기다린다.
  await page.waitForFunction(
    () => {
      const img = document.querySelector('.photo-preview-image')
      return !!img && img.src.startsWith('blob:')
    },
    { timeout: 3000 },
  )
  const previewImageShown = await page.evaluate(() => {
    const img = document.querySelector('.photo-preview-image')
    return !!img && img.src.startsWith('blob:')
  })
  await page.click('.photo-preview-close')
  await page.waitForTimeout(150)
  const previewClosed = await page.evaluate(() => !document.querySelector('.photo-preview-backdrop'))

  check('5) 사진 본체를 누르면 큰 미리보기(원본 blob) 표시', previewImageShown)
  check('5) 닫기 버튼으로 미리보기 닫힘', previewClosed)

  // ---- 6) 체크/삭제가 서로 다른 컨트롤인지(미리보기를 열어도 active 상태 안 바뀜) ----
  const stillAllActive = await page.evaluate(
    () => document.querySelectorAll('.photo-manager-cell.is-inactive').length === 0,
  )
  check('6) 미리보기를 열고 닫아도 액자 사용 상태는 그대로 유지됨', stillAllActive)

  // ---- 7) 개별 삭제(휴지통 아이콘) ----
  await page.click('.photo-manager-cell:nth-child(1) .photo-manager-trash')
  await page.waitForFunction(() => document.querySelectorAll('.photo-manager-cell').length === 2, {
    timeout: 3000,
  })
  const cellCountAfterDelete = await page.evaluate(
    () => document.querySelectorAll('.photo-manager-cell').length,
  )
  check('7) 휴지통 아이콘 클릭 → 확인창 없이 즉시 1장 삭제(2장 남음)', cellCountAfterDelete === 2)

  // ---- 8) 삭제/선택 상태가 모달을 닫았다 다시 열어도 유지되는지(IndexedDB 반영 확인) ----
  await page.click('.photo-manager-close')
  await page.waitForTimeout(150)
  await openSettings(page)
  const cellCountAfterReopen = await page.evaluate(
    () => document.querySelectorAll('.photo-manager-cell').length,
  )
  check('8) 모달을 닫았다 다시 열어도 삭제 결과(2장) 유지 — IndexedDB에 실제로 반영됨', cellCountAfterReopen === 2)

  // ---- 9) 남은 2장 중 1장만 활성 상태로 두고, ScreenSaver/사진 모드가 "액자 사용" 사진만
  //     쓰는지 확인 — 전체 해제한 뒤(활성 0장)에는 사진이 있어도 fallback(기본 자연풍경)이
  //     떠야 한다(App.tsx가 photos 전체가 아니라 activePhotos만 ScreenSaver에 넘기기 때문).
  await page.click('button:has-text("전체 해제")')
  await page.waitForTimeout(150)
  await page.click('.photo-manager-close')
  await page.waitForTimeout(150)

  await page.evaluate(() => {
    window.localStorage.setItem('deskpad:last-interaction-at', String(Date.now() - 31 * 60 * 1000))
  })
  await page.reload()
  await page.waitForTimeout(700)

  const fallbackShownDespiteStoredPhotos = await page.evaluate(
    () => !!document.querySelector('.screensaver.is-visible .default-background'),
  )
  check(
    '9) 사진이 2장 있어도 전부 액자 사용 해제 상태면 스크린세이버가 기본 자연풍경으로 fallback',
    fallbackShownDespiteStoredPhotos,
  )

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
