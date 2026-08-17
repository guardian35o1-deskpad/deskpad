import type { ViewMode } from '../hooks/useViewMode'

interface ViewToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  onOpenSettings: () => void
  // 날씨/캘린더/시장 데이터를 한 번에 강제 새로고침한다(App.tsx의 refreshAll).
  onRefresh: () => void
  // 진행 중일 때 ↻ 아이콘을 회전시키고 버튼을 비활성화해 연속 클릭을 막는다.
  isRefreshing: boolean
  // 완료 직후 잠깐(1.5초) ✓로 바뀌어 "갱신 완료"를 알린다.
  justRefreshed: boolean
}

// 화면 우측 최하단에 작게 배치되는 컨트롤 독: 기본 · 사진 · ⚙ · ↻
function ViewToggle({ mode, onChange, onOpenSettings, onRefresh, isRefreshing, justRefreshed }: ViewToggleProps) {
  return (
    <div className="control-dock">
      <button
        type="button"
        className={`dock-btn ${mode === 'default' ? 'active' : ''}`}
        onClick={() => onChange('default')}
      >
        기본
      </button>
      <span className="dock-sep">·</span>
      <button
        type="button"
        className={`dock-btn ${mode === 'photo' ? 'active' : ''}`}
        onClick={() => onChange('photo')}
      >
        사진
      </button>
      <span className="dock-sep">·</span>
      <button type="button" className="dock-btn" onClick={onOpenSettings} aria-label="사진 관리 설정">
        ⚙
      </button>
      <span className="dock-sep">·</span>
      <button
        type="button"
        className={`dock-btn dock-refresh-btn ${isRefreshing ? 'is-spinning' : ''}`}
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label={justRefreshed ? '방금 갱신됨' : '날씨·일정·시장 데이터 새로고침'}
        title={justRefreshed ? '방금 갱신됨' : '날씨·일정·시장 데이터 새로고침'}
      >
        {justRefreshed ? '✓' : '↻'}
      </button>
    </div>
  )
}

export default ViewToggle
