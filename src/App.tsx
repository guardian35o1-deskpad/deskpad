import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Clock from './components/Clock'
import Calendar from './components/Calendar'
import Weather from './components/Weather'
import Market from './components/Market'
import ViewToggle from './components/ViewToggle'
import PhotoManager from './components/PhotoManager'
import IdleScreen from './components/IdleScreen'
import ScreenSaver from './components/ScreenSaver'
import { useViewMode } from './hooks/useViewMode'
import { usePhotos } from './hooks/usePhotos'
import { useIdleTimer } from './hooks/useIdleTimer'
import { useDashboardRevealTimeout } from './hooks/useDashboardRevealTimeout'
import { useLongIdleTimer, LONG_IDLE_TIMEOUT_MS } from './hooks/useLongIdleTimer'
import { useWeather } from './hooks/useWeather'
import { useCalendarEvents } from './hooks/useCalendarEvents'
import { useMarket } from './hooks/useMarket'
import './App.css'

// 수동 새로고침(도크 ↻) 완료 후 "방금 갱신됨" 체크 아이콘을 잠깐 보여주는 시간.
const REFRESH_DONE_BADGE_MS = 1500

function App() {
  // 저장된 화면 모드(기본/사진, localStorage)와 사진 모드 안에서 Dashboard를 잠깐 보여주는
  // 임시 상태(isIdle, 아래)는 서로 다른 상태다. 화면을 탭해도 mode(viewMode)는 바뀌지 않는다 —
  // 오직 사용자가 도크의 [기본]/[사진] 버튼을 눌렀을 때만 setMode가 호출된다.
  const { mode, setMode } = useViewMode()
  const {
    photos,
    processing,
    progress,
    error,
    addPhotos,
    removePhoto,
    clearPhotos,
    setPhotoActive,
    setAllPhotosActive,
  } = usePhotos()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isPhotoMode = mode === 'photo'
  const { timeoutMs: dashboardRevealTimeoutMs } = useDashboardRevealTimeout()

  // 사진 관리 화면에서 체크 해제(active:false)한 사진은 보관은 계속하되 액자(사진 모드/
  // 30분 Idle 슬라이드쇼)에는 나오지 않아야 한다 — 두 화면 모두 photos 전체가 아니라
  // 이 필터링된 목록만 받는다. PhotoManager는 켜고 끄는 UI를 보여줘야 하므로 photos
  // 전체를 그대로 받는다(아래 참고).
  const activePhotos = useMemo(() => photos.filter((photo) => photo.active), [photos])

  // 기본 모드 = 정보모드: Dashboard를 계속 유지하고, 이 타이머는 아예 동작하지 않는다.
  // 사진 모드 = 사진+시계가 기본(대기) 화면이고, 탭하면 dashboardRevealTimeoutMs(기본 30초)
  // 동안 정보 Dashboard를 임시로 보여준다. 이 과정에서 viewMode 저장값은 photo로 그대로 유지된다.
  // 설정(사진 관리) 모달이 열려 있는 동안에는 자동으로 사진 화면으로 되돌아가지 않는다.
  const isIdle = useIdleTimer(isPhotoMode, dashboardRevealTimeoutMs, settingsOpen)
  const dashboardHidden = isPhotoMode && isIdle

  // 외부 데이터 3종(날씨/캘린더/시장) — 각 훅이 자체적으로 자동 갱신(주기/visibilitychange/
  // focus)을 갖고 있는 것은 그대로다. 여기서 App.tsx가 직접 호출하는 이유는 오직 하나 —
  // 아래 refreshAll()이 도크의 ↻ 버튼 한 번으로 세 소스를 동시에 새로고침하려면, 그 refresh
  // 함수들을 한 곳에서 쥐고 있어야 하기 때문(공통 refresh 함수 설계, 중복 fetch 로직 없음).
  const weather = useWeather()
  const calendar = useCalendarEvents(dashboardHidden)
  const market = useMarket()

  const [isRefreshingAll, setIsRefreshingAll] = useState(false)
  const [justRefreshed, setJustRefreshed] = useState(false)
  const refreshLockRef = useRef(false)
  const refreshDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 도크의 ↻ 버튼 핸들러. 세 소스를 병렬로 강제 새로고침한다 — Promise.allSettled를 써서
  // 하나가 실패해도(예: Calendar API 오류) 나머지는 정상적으로 갱신되고 전체를 실패로 처리하지
  // 않는다(요구사항). 연속 클릭은 refreshLockRef + 버튼 disabled로 이중 방지한다.
  const refreshAll = useCallback(async () => {
    if (refreshLockRef.current) return
    refreshLockRef.current = true
    setIsRefreshingAll(true)
    if (refreshDoneTimerRef.current) clearTimeout(refreshDoneTimerRef.current)

    await Promise.allSettled([weather.refresh(true), calendar.refresh(), market.refresh(true)])

    setIsRefreshingAll(false)
    setJustRefreshed(true)
    refreshDoneTimerRef.current = setTimeout(() => setJustRefreshed(false), REFRESH_DONE_BADGE_MS)
    refreshLockRef.current = false
  }, [weather.refresh, calendar.refresh, market.refresh])

  useEffect(() => {
    return () => {
      if (refreshDoneTimerRef.current) clearTimeout(refreshDoneTimerRef.current)
    }
  }, [])

  // 30분 무조작 시 전체 화면 대기(디지털 액자) 모드로 전환 — 단, 기본(정보) 모드에서만
  // 동작한다. 사진 모드는 이미 그 자체가 액자 역할(위 isIdle/IdleScreen)이라 여기서 또
  // 다른 Idle 오버레이를 얹지 않는다: isPhotoMode도 suspend 조건에 포함시켜, 사진 모드에
  // 있는 동안은 경과 시간을 아예 세지 않고(useLongIdleTimer 내부에서 suspend=true면
  // 판정을 건너뜀) 대기 화면도 뜨지 않는다. 기본 모드에서 대기 화면이 뜬 뒤 터치하면
  // 오버레이만 사라지고, 이미 기본 모드였으므로 자연히 기본 정보화면으로 복귀한다.
  const isLongIdle = useLongIdleTimer(LONG_IDLE_TIMEOUT_MS, settingsOpen || isPhotoMode)

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
          <Weather data={weather.data} hasError={weather.hasError} />
        </header>

        <main className="app-main">
          <Calendar events={calendar.events} status={calendar.status} />
        </main>

        <footer className="app-footer">
          <Market
            quotes={market.quotes}
            updatedAt={market.updatedAt}
            loading={market.loading}
            error={market.error}
            isMock={market.isMock}
          />
          <ViewToggle
            mode={mode}
            onChange={setMode}
            onOpenSettings={() => setSettingsOpen(true)}
            onRefresh={refreshAll}
            isRefreshing={isRefreshingAll}
            justRefreshed={justRefreshed}
          />
        </footer>
      </div>

      {/* 사진 모드일 때만 마운트한다. 사진+시계 화면 자체가 사진 모드의 기본(대기) 화면이다. */}
      {isPhotoMode && (
        <div className="idle-layer">
          <IdleScreen photos={activePhotos} active={isIdle} />
        </div>
      )}

      {/* 기본 모드일 때만 마운트한다(사진 모드는 이미 액자 화면이라 이 오버레이가 필요 없음).
          마운트돼 있는 동안은 opacity로만 나타나고 사라진다(기존 idle-layer와 동일한 방식). */}
      {!isPhotoMode && (
        <div className="screensaver-layer">
          <ScreenSaver photos={activePhotos} active={isLongIdle} />
        </div>
      )}

      {settingsOpen && (
        <PhotoManager
          photos={photos}
          processing={processing}
          progress={progress}
          error={error}
          onAddPhotos={addPhotos}
          onRemovePhoto={removePhoto}
          onClearPhotos={clearPhotos}
          onSetPhotoActive={setPhotoActive}
          onSetAllPhotosActive={setAllPhotosActive}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

export default App
