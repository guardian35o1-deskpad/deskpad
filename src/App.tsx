import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Clock from './components/Clock'
import Calendar from './components/Calendar'
import Weather from './components/Weather'
import Market from './components/Market'
import ViewToggle from './components/ViewToggle'
import PhotoManager from './components/PhotoManager'
import PhotoBackground from './components/PhotoBackground'
import ScreenSaver from './components/ScreenSaver'
import { useViewMode } from './hooks/useViewMode'
import { usePhotos } from './hooks/usePhotos'
import { useLongIdleTimer, LONG_IDLE_TIMEOUT_MS } from './hooks/useLongIdleTimer'
import { useWeather } from './hooks/useWeather'
import { useCalendarEvents } from './hooks/useCalendarEvents'
import { useMarket } from './hooks/useMarket'
import './App.css'

// 수동 새로고침(도크 ↻) 완료 후 "방금 갱신됨" 체크 아이콘을 잠깐 보여주는 시간.
const REFRESH_DONE_BADGE_MS = 1500

function App() {
  // 저장된 화면 모드(기본/사진, localStorage). 42번(1차)에서는 사진 모드 안에 "탭하면 잠깐
  // 정보 노출"이라는 별도의 임시 상태(isIdle)를 뒀었지만, 스샷 확인 후 그 구조가 요구사항과
  // 달라 제거했다(42번 2차) — 지금은 mode 하나만 있다. 사진 배경을 탭하면 실제로
  // setMode('default')가 호출되어 진짜 기본 모드로 바뀐다(아래 PhotoBackground 배경 참고).
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

  // 사진 관리 화면에서 체크 해제(active:false)한 사진은 보관은 계속하되 액자(사진 모드/
  // 30분 Idle 슬라이드쇼)에는 나오지 않아야 한다 — 두 화면 모두 photos 전체가 아니라
  // 이 필터링된 목록만 받는다. PhotoManager는 켜고 끄는 UI를 보여줘야 하므로 photos
  // 전체를 그대로 받는다(아래 참고).
  const activePhotos = useMemo(() => photos.filter((photo) => photo.active), [photos])

  // 외부 데이터 3종(날씨/캘린더/시장) — 각 훅이 자체적으로 자동 갱신(주기/visibilitychange/
  // focus)을 갖고 있는 것은 그대로다. 여기서 App.tsx가 직접 호출하는 이유는 오직 하나 —
  // 아래 refreshAll()이 도크의 ↻ 버튼 한 번으로 세 소스를 동시에 새로고침하려면, 그 refresh
  // 함수들을 한 곳에서 쥐고 있어야 하기 때문(공통 refresh 함수 설계, 중복 fetch 로직 없음).
  // Calendar는 사진 모드에서는 아예 화면에 마운트되지 않으므로, 그동안 캘린더 API를
  // 불필요하게 폴링하지 않도록 isPhotoMode를 그대로 넘겨 훅 내부에서 갱신을 쉬게 한다.
  const weather = useWeather()
  const calendar = useCalendarEvents(isPhotoMode)
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

  // iPad Safari의 핀치 확대 제스처(gesturestart/gesturechange, WebKit 전용 이벤트)만 막는다.
  // touchmove 전체를 preventDefault하지 않으므로 Calendar의 좌우 스와이프(useSwipeNav,
  // passive 리스너)나 도크 버튼 탭 등 다른 터치 동작에는 영향이 없다. index.html의
  // viewport maximum-scale/user-scalable과 함께 이중으로 확대를 막기 위한 보강 장치.
  useEffect(() => {
    function preventPinchZoom(event: Event) {
      event.preventDefault()
    }
    document.addEventListener('gesturestart', preventPinchZoom)
    document.addEventListener('gesturechange', preventPinchZoom)
    return () => {
      document.removeEventListener('gesturestart', preventPinchZoom)
      document.removeEventListener('gesturechange', preventPinchZoom)
    }
  }, [])

  // 30분 무조작 시 전체 화면 대기(디지털 액자) 모드로 전환 — 단, 기본(정보) 모드에서만
  // 동작한다. 사진 모드는 이미 그 자체가 액자 역할이라 여기서 또 다른 Idle 오버레이를
  // 얹지 않는다: isPhotoMode도 suspend 조건에 포함시켜, 사진 모드에 있는 동안은 경과 시간을
  // 아예 세지 않고(useLongIdleTimer 내부에서 suspend=true면 판정을 건너뜀) 대기 화면도
  // 뜨지 않는다. 기본 모드에서 대기 화면이 뜬 뒤 터치하면 오버레이만 사라지고, 이미 기본
  // 모드였으므로 자연히 기본 정보화면으로 복귀한다. (이번 42번 2차 수정과 무관, 그대로 유지)
  const isLongIdle = useLongIdleTimer(LONG_IDLE_TIMEOUT_MS, settingsOpen || isPhotoMode)

  return (
    <div className={`app ${isPhotoMode ? 'is-photo-mode' : ''}`}>
      {/* 배경 레이어. 기본 모드는 기존처럼 앱 내장 고정 자연 풍경 이미지 1장 + 어두운 오버레이.
          사진 모드는 사용자가 등록한 사진이 viewport 전체 배경으로 깔린다(PhotoBackground를
          하단 전용 박스가 아니라 원래 목적대로 전체 화면 레이어로 사용). 배경을 탭하면 즉시
          setMode('default')로 실제 모드가 바뀐다 — 임시로 정보만 잠깐 보여주는 것이 아니라
          "사진 모드는 배경일 뿐, 실제 화면은 기본 모드"로 전환되는 것이다(42번 2차 핵심 수정).
          도크는 이 레이어 밖의 별도 형제 요소라 이 탭 핸들러가 도크 클릭을 가로채지 않는다. */}
      {isPhotoMode ? (
        <div
          className="photo-mode-backdrop"
          role="button"
          tabIndex={-1}
          aria-label="터치하면 기본 화면으로 전환"
          onClick={() => setMode('default')}
        >
          <PhotoBackground photos={activePhotos} />
        </div>
      ) : (
        <div className="photo-background-layer">
          <div className="default-background" />
          <div className="photo-overlay photo-overlay-dim" />
        </div>
      )}

      <div className="app-content">
        {/* 상단(시계+날씨)은 기본/사진 모드와 무관하게 항상 같은 위치·크기로 유지된다. */}
        <header className="app-header-row">
          <Clock />
          <Weather data={weather.data} hasError={weather.hasError} />
        </header>

        {/* 사진 모드에서는 달력을 아예 마운트하지 않는다(사진이 그 자리를 대신함). 대신
            app-main과 같은 flex:1 공간을 차지하는 빈 스페이서를 둬서, 아래 도크가 있는
            footer가 기본 모드와 동일하게 화면 맨 아래에 그대로 붙어 있게 한다. */}
        {isPhotoMode ? (
          <div className="app-main-spacer" />
        ) : (
          <main className="app-main">
            <Calendar events={calendar.events} status={calendar.status} />
          </main>
        )}

        <footer className="app-footer">
          {/* 사진 모드에서는 Market도 함께 숨긴다(달력과 한 세트). 도크는 아래에서 항상 그대로
              렌더링되고, .control-dock에 margin-left:auto가 있어 Market이 없어도 우측에 붙는다. */}
          {!isPhotoMode && (
            <Market
              quotes={market.quotes}
              updatedAt={market.updatedAt}
              loading={market.loading}
              error={market.error}
              isMock={market.isMock}
            />
          )}
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

      {/* 기본 모드일 때만 마운트한다(사진 모드는 이미 그 자체가 액자라 이 오버레이가 필요 없음).
          마운트돼 있는 동안은 opacity로만 나타나고 사라진다. */}
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
