import type { MarketProvider } from './types'
// mockMarketProvider는 더 이상 activeMarketProvider로 쓰지 않지만, 실제 API 없이
// UI만 다시 확인하고 싶을 때 되돌릴 수 있도록 파일은 그대로 남겨둔다.
// import { mockMarketProvider } from './mockMarketProvider'
import { liveMarketProvider } from './liveMarketProvider'

// 실제 시장 데이터(Netlify Function /api/market → Naver/Yahoo 프록시)로 교체됨.
// marketService / useMarket / Market.tsx는 이 교체를 몰라도 되도록 그대로 두었다.
// 다시 mock으로 되돌리려면 이 줄만 mockMarketProvider로 바꾸면 된다.
export const activeMarketProvider: MarketProvider = liveMarketProvider
