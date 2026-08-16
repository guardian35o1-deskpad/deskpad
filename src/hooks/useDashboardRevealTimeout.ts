import { useEffect, useState } from 'react'

const STORAGE_KEY = 'deskpad:dashboard-reveal-timeout-ms'
const DEFAULT_TIMEOUT_MS = 30 * 1000

// 사진 모드에서 화면을 터치해 정보 Dashboard를 잠깐 띄운 뒤, 추가 조작이 없으면 다시
// 사진+시계 화면으로 자동 복귀하기까지 기다리는 시간(ms). 하드코딩하지 않고 localStorage에
// 저장해 두어, 나중에 설정 화면에서 아래 옵션 중 고를 수 있도록 미리 구조화해 둔다.
// (지금은 값을 바꾸는 UI가 없어 항상 기본값 30초로 시작한다.)
export const DASHBOARD_REVEAL_TIMEOUT_OPTIONS_MS = [15_000, 30_000, 60_000, 180_000, 300_000] as const

function readStoredTimeout(): number {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  const parsed = stored ? Number(stored) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS
}

export function useDashboardRevealTimeout() {
  const [timeoutMs, setTimeoutMs] = useState<number>(readStoredTimeout)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(timeoutMs))
  }, [timeoutMs])

  return { timeoutMs, setTimeoutMs }
}
