import { useEffect, useRef, useState } from 'react'

// 실제 터치/클릭/키 입력만 "사용 중"으로 본다. mousemove는 일부러 제외한다
// (탁상 디스플레이에서 마우스가 살짝 움직인 정도로 계속 대기모드 진입이 막히는 것을 피하기 위함).
const ACTIVITY_EVENTS = ['pointerdown', 'touchstart', 'keydown'] as const

// active(사진 모드)일 때만 동작한다. 기본 모드에서는 항상 정보 화면을 유지해야 하므로 이 타이머
// 자체가 동작하지 않는다.
// 사진 모드에 들어오면 항상 "사진+시계"(idle) 상태부터 시작한다. 터치/클릭/키 입력이 있으면
// 정보 Dashboard를 잠깐 보여주고(isIdle=false), timeoutMs 동안 추가 입력이 없으면 다시
// 사진+시계 화면으로 돌아간다(isIdle=true).
// suspend가 true인 동안(예: 설정 모달이 열려 있을 때)은 자동으로 사진 화면으로 되돌아가지 않는다.
export function useIdleTimer(active: boolean, timeoutMs: number, suspend: boolean): boolean {
  const [isIdle, setIsIdle] = useState(active)
  const timerRef = useRef<number | null>(null)

  // 사진 모드로 (다시) 들어올 때마다 항상 사진+시계 화면부터 보여준다.
  useEffect(() => {
    if (active) {
      setIsIdle(true)
    }
  }, [active])

  useEffect(() => {
    if (!active) return

    function clearTimer() {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    function scheduleIdle() {
      clearTimer()
      if (suspend) return
      timerRef.current = window.setTimeout(() => {
        setIsIdle(true)
      }, timeoutMs)
    }

    function handleActivity() {
      setIsIdle(false)
      scheduleIdle()
    }

    if (suspend) {
      clearTimer()
    } else {
      // 설정 모달이 닫히는 등 suspend가 풀리는 순간에도 카운트다운이 바로 재개되도록
      // 액티비티 발생 여부와 무관하게 여기서도 한 번 예약해 둔다.
      scheduleIdle()
    }

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleActivity)
    })

    return () => {
      clearTimer()
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleActivity)
      })
    }
  }, [active, timeoutMs, suspend])

  return isIdle
}
