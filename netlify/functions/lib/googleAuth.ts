// Google OAuth 2.0 Authorization Code 흐름 공용 헬퍼.
// client_secret과 refresh_token은 이 서버 함수들 밖으로(프론트엔드로) 절대 내려가지 않는다.

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

// 읽기 전용, 최소 권한만 요청한다.
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'

export interface GoogleEnv {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function readGoogleEnv(): GoogleEnv {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI 환경변수가 설정되지 않았습니다. ' +
        'Netlify 사이트 환경변수를 먼저 설정해주세요.',
    )
  }
  return { clientId, clientSecret, redirectUri }
}

// access_type=offline + prompt=consent: 이 두 개가 있어야 매번(재동의 시에도) refresh_token이 발급된다.
// 개인용 단일 사용자 앱이라 별도 세션 저장소로 state를 검증하지는 않는다 — 실제 보안 경계는
// (1) 이 시작 URL 자체가 공개되지 않고, (2) Google이 등록된 redirect_uri로만 리다이렉트한다는 점이다.
export function buildAuthUrl(env: GoogleEnv, state: string): string {
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

export async function exchangeCodeForTokens(env: GoogleEnv, code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    redirect_uri: env.redirectUri,
    grant_type: 'authorization_code',
  })
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google 토큰 교환 실패 (${response.status}): ${text}`)
  }
  return (await response.json()) as TokenResponse
}

export async function refreshAccessToken(env: GoogleEnv, refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: 'refresh_token',
  })
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google access token 갱신 실패 (${response.status}): ${text}`)
  }
  return (await response.json()) as TokenResponse
}
