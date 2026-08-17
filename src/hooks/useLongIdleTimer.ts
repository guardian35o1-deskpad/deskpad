import { useEffect, useRef, useState } from 'react'

// 실제 터치/클릭/키 입력만 "사용 중"으로 본다(사진 모드의 짧은 대기 타이머와 동일 기준).
// Calendar/날씨 등 내부 데이터 자동 갱신은 이 이벤트들을 발생시키지 않으므로
// 자동으로 "사용자 조작"에서 제외된다 — 별도 예외 처리가 필요 없다.
const ACTIVITY_EVENTS = ['pointerdown', 'touchstart', 'keydown'] as const

const STORAGE_KEY = 'deskpad:last-interaction-at'

// 기본(정보) 모드에서 30분 동안 조작이 없으면 전체 화면 대기(디지털 액자) 모드로
// 전환하기까지 기다리는 시간(ms). 사진 모드는 이미 그 자체가 액자 역할이라 호출하는 쪽
// (App.tsx)에서 isPhotoMode를 suspend 조건에 포함시켜 이 훅이 아예 카운트하지 않게 한다.
export const LONG_IDLE_TIMEOUT_MS = 30 * 60 * 1000

// 15초마다 경과 시간을 다시 계산한다. setTimeout 하나로 30분을 예약하는 대신 짧은 주기로
// "지금까지 얼마나 지났는지"를 반복 확인하는 방식을 쓰는 이유: 구형 iPad가 화면 꺼짐/백그라운드
// 전환으로 JS 타이머 자체를 멈췄다가 다시 켜졌을 때도(= setTimeout 콜백이 유실됐어도), 다음 틱이나
// visibilitychange/focus 시점에 실제 경과 시간을 기준으로 즉시 올바르게 판정하기 위함이다.
const CHECK_INTERVAL_MS = 15 * 1000

function readLastInteractionAt(): number {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  const parsed = stored ? Number(stored) : NaN
  // 저장된 값이 없으면(최초 실행) "방금 조작함"으로 간주해 앱을 열자마자 대기 화면으로
  // 튀지 않게 한다.
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function writeLastInteractionAt(value: number) {
  window.localStorage.setItem(STORAGE_KEY, String(value))
}

// suspend(설정 모달이 열려 있는 동안, 또는 이미 사진 모드라 이 대기 화면이 필요 없는 동안 등)가
// true인 동안은 경과 시간을 세지 않고 대기 화면으로 전환하지 않는다.
export function useLongIdleTimer(timeoutMs: number, suspend: boolean): boolean {
  const lastInteractionRef = useRef<number>(readLastInteractionAt())
  const [isLongIdle, setIsLongIdle] = useState<boolean>(
    () => Date.now() - lastInteractionRef.current >= timeoutMs,
  )

  // suspend가 시작되면(설정 모달이 열리면) 대기 화면을 즉시 내리고, suspend가 끝나는 시점부터
  // 다시 경과 시간을 계산한다.
  useEffect(() => {
    if (suspend) {
      setIsLongIdle(false)
    }
  }, [suspend])

  useEffect(() => {
    function markInteraction() {
      const now = Date.now()
      lastInteractionRef.current = now
      writeLastInteractionAt(now)
      setIsLongIdle(false)
    }

    function checkElapsed() {
      if (suspend) return
      const elapsed = Date.now() - lastInteractionRef.current
      if (elapsed >= timeoutMs) {
        setIsLongIdle(true)
      }
    }

    // 마운트 시점(앱 최초 실행, 재시작, 화면 재활성화 포함)에 이미 timeoutMs가 지났다면
    // 곧바로 대기 화면부터 시작한다.
    checkElapsed()

    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, markInteraction)
    })
    // 구형 iPad가 화면 꺼짐/백그라운드에서 돌아오는 시점을 최대한 빨리 잡기 위한 보강 신호.
    document.addEventListener('visibilitychange', checkElapsed)
    window.addEventListener('focus', checkElapsed)
    const interval = window.setInterval(checkElapsed, CHECK_INTERVAL_MS)

    return () => {
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, markInteraction)
      })
      document.removeEventListener('visibilitychange', checkElapsed)
      window.removeEventListener('focus', checkElapsed)
      window.clearInterval(interval)
    }
  }, [timeoutMs, suspend])

  return isLongIdle
}
