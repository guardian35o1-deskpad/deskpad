// Google이 동의 후 redirect_uri로 돌려보내는 콜백. code를 refresh_token으로 교환해
// Netlify Blobs에 저장한다. 사람이 브라우저로 한 번 거쳐가는 화면이라 간단한 HTML만 반환한다.
import { exchangeCodeForTokens, readGoogleEnv } from './lib/googleAuth.ts'
import { saveRefreshToken } from './lib/tokenStore.ts'

function htmlResponse(message: string, status: number): Response {
  return new Response(
    `<!doctype html>
<html lang="ko">
  <head><meta charset="utf-8" /><title>DeskPad · Google Calendar 연결</title></head>
  <body style="font-family: -apple-system, sans-serif; padding: 48px; text-align: center; color: #222;">
    <h2>DeskPad · Google Calendar 연결</h2>
    <p>${message}</p>
  </body>
</html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

export default async (request: Request) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const errorParam = url.searchParams.get('error')

  if (errorParam) {
    return htmlResponse(`Google 인증이 취소되었거나 실패했습니다 (${errorParam}). 처음부터 다시 시도해주세요.`, 400)
  }
  if (!code) {
    return htmlResponse('인증 코드(code)가 전달되지 않았습니다. 처음부터 다시 시도해주세요.', 400)
  }

  try {
    const env = readGoogleEnv()
    const tokens = await exchangeCodeForTokens(env, code)

    if (!tokens.refresh_token) {
      return htmlResponse(
        '이미 이전에 이 앱에 동의한 계정이라 refresh_token이 새로 발급되지 않았습니다.<br/>' +
          'Google 계정의 <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">' +
          '보안 → 타사 액세스 권한이 있는 앱</a>에서 DeskPad 연결을 제거한 뒤 다시 시도해주세요.',
        400,
      )
    }

    await saveRefreshToken(tokens.refresh_token)
    return htmlResponse('Google Calendar 연결이 완료되었습니다. 이 창은 닫으셔도 됩니다.', 200)
  } catch (err) {
    return htmlResponse(`연결 중 오류가 발생했습니다: ${(err as Error).message}`, 500)
  }
}

export const config = {
  path: '/api/google-auth-callback',
}
