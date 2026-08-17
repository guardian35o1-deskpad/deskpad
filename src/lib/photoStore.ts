// 사진 배경 모드에 등록한 사진을 IndexedDB에 저장/조회/삭제하는 얇은 래퍼.
// 외부 라이브러리(idb 등) 없이 네이티브 IndexedDB API만 사용한다.

export interface PhotoRecord {
  id: string
  blob: Blob
  /** 사진 관리 그리드용 작은 미리보기(imageResize.ts의 createThumbnail 결과). 이 필드가
   * 추가되기 전에 저장된 사진은 없을 수 있어 getAllPhotos()에서 blob으로 보정한다. */
  thumbnail: Blob
  /** true면 사진 모드/30분 Idle 액자의 랜덤 슬라이드쇼에 포함된다. 사진 자체는 삭제하지
   * 않고 보관만 하고 싶을 때 false로 끈다. 이 필드가 추가되기 전에 저장된 사진은
   * getAllPhotos()에서 true(기존과 동일하게 액자에 표시)로 보정한다. */
  active: boolean
  createdAt: number
}

const DB_NAME = 'deskpad'
const DB_VERSION = 1
const STORE_NAME = 'photos'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB를 열 수 없습니다.'))
  })
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function addPhoto(blob: Blob, thumbnail: Blob): Promise<PhotoRecord> {
  const db = await openDatabase()
  // 새로 추가하는 사진은 기본적으로 액자 사용(active: true) 상태로 등록한다.
  const record: PhotoRecord = { id: createId(), blob, thumbnail, active: true, createdAt: Date.now() }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('사진 저장에 실패했습니다.'))
  })

  db.close()
  return record
}

export async function getAllPhotos(): Promise<PhotoRecord[]> {
  const db = await openDatabase()

  const records = await new Promise<PhotoRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as PhotoRecord[])
    request.onerror = () => reject(request.error ?? new Error('사진 목록을 불러오지 못했습니다.'))
  })

  db.close()

  // 하위 호환 보정: thumbnail/active 필드가 생기기 전에 저장된 사진은 이 두 값이
  // 없으므로, 읽을 때만 기본값(썸네일=원본, active=true)으로 채워서 반환한다.
  // IndexedDB에 다시 쓰지는 않으므로(그리드에서 보정된 값으로만 보임), 사진을 다시
  // 등록하거나 개별적으로 active를 한 번 바꾸면 그 시점에 실제 레코드에도 반영된다.
  const normalized = records.map((record) => ({
    ...record,
    thumbnail: record.thumbnail ?? record.blob,
    active: record.active ?? true,
  }))

  return normalized.sort((a, b) => a.createdAt - b.createdAt)
}

// 사진 1장의 액자 사용 여부만 바꾼다(삭제 아님 — blob/thumbnail은 그대로 보관).
export async function setPhotoActive(id: string, active: boolean): Promise<void> {
  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const getRequest = store.get(id)
    getRequest.onsuccess = () => {
      const record = getRequest.result as PhotoRecord | undefined
      if (record) {
        store.put({ ...record, active })
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('사진 상태 변경에 실패했습니다.'))
  })

  db.close()
}

// "전체 선택"/"전체 해제" — 등록된 모든 사진의 액자 사용 여부를 한 번에 같은 값으로 바꾼다.
export async function setAllPhotosActive(active: boolean): Promise<void> {
  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const cursorRequest = store.openCursor()
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (cursor) {
        store.put({ ...(cursor.value as PhotoRecord), active })
        cursor.continue()
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('사진 상태 일괄 변경에 실패했습니다.'))
  })

  db.close()
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('사진 삭제에 실패했습니다.'))
  })

  db.close()
}

export async function clearAllPhotos(): Promise<void> {
  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('사진 전체 삭제에 실패했습니다.'))
  })

  db.close()
}
