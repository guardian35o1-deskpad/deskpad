// refresh_token 보관소. Netlify Blobs(사이트에 딸린 key-value 저장소)를 사용해
// 별도 DB 없이 서버 쪽에만 안전하게 보관한다. 배포된 Netlify Function 안에서는
// getStore()가 사이트 컨텍스트를 자동으로 인식하므로 별도 설정이 필요 없다.
import { getStore } from '@netlify/blobs'

const STORE_NAME = 'deskpad-google-calendar'
const REFRESH_TOKEN_KEY = 'refresh-token'

function store() {
  return getStore(STORE_NAME)
}

export async function saveRefreshToken(token: string): Promise<void> {
  await store().set(REFRESH_TOKEN_KEY, token)
}

export async function readRefreshToken(): Promise<string | null> {
  const value = await store().get(REFRESH_TOKEN_KEY, { type: 'text' })
  return value ?? null
}
