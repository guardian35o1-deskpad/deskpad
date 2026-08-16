import { useEffect, useState } from 'react'

export type ViewMode = 'default' | 'photo'

const STORAGE_KEY = 'deskpad:view-mode'

function readStoredMode(): ViewMode {
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'photo' ? 'photo' : 'default'
}

export function useViewMode() {
  const [mode, setMode] = useState<ViewMode>(readStoredMode)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  return { mode, setMode }
}
