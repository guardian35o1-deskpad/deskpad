import { useState } from 'react'
import Clock from './components/Clock'
import Calendar from './components/Calendar'
import Weather from './components/Weather'
import Market from './components/Market'
import ViewToggle from './components/ViewToggle'
import PhotoManager from './components/PhotoManager'
import IdleScreen from './components/IdleScreen'
import { useViewMode } from './hooks/useViewMode'
import { usePhotos } from './hooks/usePhotos'
import { useIdleTimer } from './hooks/useIdleTimer'
import { useDashboardRevealTimeout } from './hooks/useDashboardRevealTimeout'
import './App.css'

function App() {
  // 저장된 화면 모드(기본/사진, localStorage)와 사진 모드 안에서 Dashboard를 잠깐 보여주는
  // 임시 상태(isIdle, 아래)는 서로 다른 상태다. 화면을 탭해도 mode(viewMode)는 바뀌지 않는다 —
  // 오직 사용자가 도크의 [기본]/[사진] 버튼을 눌렀을 때만 setMode가 호출된다.
  const { mode, setMode } = useViewMode()
  const { photos, processing, error, addPhotos, removePhoto, clearPhotos } = usePhotos()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isPhotoMode = mode === 'photo'
  const { timeoutMs: dashboardRevealTimeoutMs } = useDashboardRevealTimeout()

  // 기본 모드 = 정보모드: Dashboard를 계속 유지하고, 이 타이머는 아예 동작하지 않는다.
  // 사진 모드 = 사진+시계가 기본(대기) 화면이고, 탭하면 dashboardRevealTimeoutMs(기본 30초)
  // 동안 정보 Dashboard를 임시로 보여준다. 이 과정에서 viewMode 저장값은 photo로 그대로 유지된다.
  // 설정(사진 관리) 모달이 열려 있는 동안에는 자동으로 사진 화면으로 되돌아가지 않는다.
  const isIdle = useIdleTimer(isPhotoMode, dashboardRevealTimeoutMs, settingsOpen)
  const dashboardHidden = isPhotoMode && isIdle

  return (
    <div className={`app ${isPhotoMode ? 'is-photo-mode' : ''}`}>
      {/* 기본(정보) 모드의 홈 화면 배경. 사용자가 등록한 사진은 여기서 쓰지 않는다 —
          기본 모드는 "정보판" 역할이 우선이라 앱에 내장된 고정 자연 풍경 이미지 1장을
          항상 그대로 사용하고(배경마다 바뀌지 않음), 그 위에 반투명 Dashboard 패널이 얹힌다.
          사용자 등록 사진은 사진 모드/Idle 액자에서만 등장한다(PhotoBackground, 아래 참고). */}
      {!isPhotoMode && (
        <div className="photo-background-layer">
          <div className="default-background" />
          <div className="photo-overlay photo-overlay-dim" />
        </div>
      )}

      <div className={`app-content ${dashboardHidden ? 'is-idle' : ''}`}>
        <header className="app-header-row">
          <Clock />
          <Weather />
        </header>

        <main className="app-main">
          <Calendar dashboardHidden={dashboardHidden} />
        </main>

        <footer className="app-footer">
          <Market />
          <ViewToggle mode={mode} onChange={setMode} onOpenSettings={() => setSettingsOpen(true)} />
        </footer>
      </div>

      {/* 사진 모드일 때만 마운트한다. 사진+시계 화면 자체가 사진 모드의 기본(대기) 화면이다. */}
      {isPhotoMode && (
        <div className="idle-layer">
          <IdleScreen photos={photos} active={isIdle} />
        </div>
      )}

      {settingsOpen && (
        <PhotoManager
          photos={photos}
          processing={processing}
          error={error}
          onAddPhotos={addPhotos}
          onRemovePhoto={removePhoto}
          onClearPhotos={clearPhotos}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

export default App
