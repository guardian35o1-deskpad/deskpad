// 사진 배경 모드에 등록한 사진을 IndexedDB에 저장/조회/삭제하는 얇은 래퍼.
// 외부 라이브러리(idb 등) 없이 네이티브 IndexedDB API만 사용한다.

export interface PhotoRecord {
  id: string
  blob: Blob
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

export async function addPhoto(blob: Blob): Promise<PhotoRecord> {
  const db = await openDatabase()
  const record: PhotoRecord = { id: createId(), blob, createdAt: Date.now() }

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
  return records.sort((a, b) => a.createdAt - b.createdAt)
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
