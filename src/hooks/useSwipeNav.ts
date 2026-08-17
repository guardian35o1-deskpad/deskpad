import { useEffect, useRef } from 'react'

// 아이패드 Safari 터치와 PC 마우스 드래그를 동일한 판정 로직으로 처리하는 범용 좌우 스와이프
// 훅. 지금은 Calendar(월 이동)에만 연결하지만, 세로 스크롤/탭과 충돌하지 않는 판정 규칙 자체는
// 다른 화면(예: 사진 모드)에서도 그대로 재사용할 수 있게 특정 컴포넌트에 종속되지 않게 짰다.
//
// 판정 규칙:
// - 가로 이동량(|dx|)이 세로 이동량(|dy|)보다 클 때만 스와이프로 인정한다(세로 스크롤/탭과 구분).
// - 최소 이동거리(threshold, 기본 60px) 이상 움직였을 때만 전환 콜백을 호출한다.
// - 한 번의 드래그(누른 순간부터 뗄 때까지)당 콜백은 최대 1회만 호출된다 — 임계값을 넘는 순간
//   즉시 확정하고, 이후 같은 드래그 동안의 추가 이동은 무시한다(빠르게 여러 번 미는 게 아니라
//   "쭉 미는" 동작이 두 번 판정되는 걸 막기 위함).
// - 스와이프가 확정된 드래그는 그 드래그의 click 이벤트를 취소한다(스와이프 도중 마우스를
//   뗀 지점에 있던 날짜 셀이 실수로 선택되는 것을 방지).
export function useSwipeNav<T extends HTMLElement>(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  disabled = false,
  threshold = 60,
) {
  const ref = useRef<T | null>(null)
  const onSwipeLeftRef = useRef(onSwipeLeft)
  const onSwipeRightRef = useRef(onSwipeRight)
  onSwipeLeftRef.current = onSwipeLeft
  onSwipeRightRef.current = onSwipeRight

  useEffect(() => {
    const el = ref.current
    if (!el || disabled) return

    let startX = 0
    let startY = 0
    let tracking = false
    let triggered = false

    function handleStart(x: number, y: number) {
      startX = x
      startY = y
      tracking = true
      triggered = false
    }

    function handleMove(x: number, y: number) {
      if (!tracking || triggered) return
      const dx = x - startX
      const dy = y - startY
      if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy)) return
      triggered = true
      tracking = false
      if (dx < 0) onSwipeLeftRef.current()
      else onSwipeRightRef.current()
    }

    function handleEnd() {
      tracking = false
    }

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0]
      if (t) handleStart(t.clientX, t.clientY)
    }
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0]
      if (t) handleMove(t.clientX, t.clientY)
    }
    function onTouchEnd() {
      handleEnd()
    }

    function onMouseDown(e: MouseEvent) {
      handleStart(e.clientX, e.clientY)
    }
    function onMouseMove(e: MouseEvent) {
      handleMove(e.clientX, e.clientY)
    }
    function onMouseUp() {
      handleEnd()
    }

    // 스와이프가 확정된 직후 발생하는 click(mouseup 시점에 있던 날짜 셀의 클릭)을 1회만 취소한다.
    function onClickCapture(e: MouseEvent) {
      if (!triggered) return
      e.preventDefault()
      e.stopPropagation()
      triggered = false
    }

    // 터치: passive로 등록해 iPad에서 스크롤 성능에 영향 주지 않는다(preventDefault를 아예
    // 안 쓰므로 passive와 충돌하지 않음).
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    // 마우스: mousedown은 대상 요소에서, move/up은 손가락(마우스)이 요소 밖으로 나가도
    // 드래그를 계속 추적할 수 있도록 window에 붙인다.
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    el.addEventListener('click', onClickCapture, { capture: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      el.removeEventListener('click', onClickCapture, { capture: true })
    }
  }, [disabled, threshold])

  return ref
}
