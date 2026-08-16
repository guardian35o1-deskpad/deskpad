// 최초 1회, 브라우저로 이 URL(/api/google-auth-start)을 직접 열어서 Google 계정 연결을
// 시작하는 함수. DeskPad 프론트엔드(iPad 화면)에서는 호출하지 않는다 — 사람이 딱 한 번
// 수동으로 방문해서 Google 로그인/동의를 완료하기 위한 진입점이다.
import { buildAuthUrl, readGoogleEnv } from './lib/googleAuth.ts'

export default async () => {
  try {
    const env = readGoogleEnv()
    const state = crypto.randomUUID()
    const authUrl = buildAuthUrl(env, state)
    return Response.redirect(authUrl, 302)
  } catch (err) {
    return new Response(`설정 오류: ${(err as Error).message}`, { status: 500 })
  }
}

export const config = {
  path: '/api/google-auth-start',
}
