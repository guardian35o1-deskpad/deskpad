import type { ViewMode } from '../hooks/useViewMode'

interface ViewToggleProps {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  onOpenSettings: () => void
}

// 화면 우측 최하단에 작게 배치되는 컨트롤 독: 기본 · 사진 · ⚙
function ViewToggle({ mode, onChange, onOpenSettings }: ViewToggleProps) {
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
    </div>
  )
}

export default ViewToggle
