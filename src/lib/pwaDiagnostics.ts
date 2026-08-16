// iOS(구형 iPad 포함) Safari에서 "홈 화면에 추가"한 DeskPad가 실제로
// standalone(주소창/툴바 없는 독립 앱)으로 실행되고 있는지 화면에는 아무것도
// 표시하지 않고 확인하기 위한 진단 유틸리티.
//
// - navigator.standalone: iOS Safari 전용(비표준) 플래그. 홈 화면 아이콘에서
//   실행되면 true, Safari 탭/북마크로 열리면 false 또는 undefined.
// - matchMedia('(display-mode: standalone)'): 표준 방식. manifest의
//   display:"standalone"이 적용된 상태로 실행 중이면 matches가 true.
//
// 두 값이 UI에 노출되진 않지만(요청사항: "화면에 보이지 않는 방식"),
// 개발자 도구 콘솔에서 확인할 수 있고, `<html>`의 data-* 속성에도 반영해
// Playwright 등 자동화 테스트에서 읽을 수 있게 한다.
export interface PwaStandaloneStatus {
  navigatorStandalone: boolean | undefined
  displayModeStandalone: boolean
  isStandalone: boolean
}

export function getPwaStandaloneStatus(): PwaStandaloneStatus {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  const navigatorStandalone = typeof nav.standalone === 'boolean' ? nav.standalone : undefined

  let displayModeStandalone = false
  try {
    displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches
  } catch {
    // matchMedia를 지원하지 않는 아주 오래된 환경 대비 — 조용히 무시
  }

  return {
    navigatorStandalone,
    displayModeStandalone,
    isStandalone: navigatorStandalone === true || displayModeStandalone,
  }
}

// 화면에는 아무것도 그리지 않는다 — <html> data 속성 갱신 + 콘솔 로그만 남긴다.
export function reportPwaStandaloneStatus(): PwaStandaloneStatus {
  const status = getPwaStandaloneStatus()

  document.documentElement.dataset.pwaStandalone = String(status.isStandalone)
  document.documentElement.dataset.pwaNavigatorStandalone = String(status.navigatorStandalone)
  document.documentElement.dataset.pwaDisplayModeStandalone = String(status.displayModeStandalone)

  // eslint-disable-next-line no-console
  console.log('[DeskPad PWA] standalone 실행 여부 진단', status)

  return status
}
