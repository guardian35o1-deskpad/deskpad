import type { MarketProvider } from './types'
import { mockMarketProvider } from './mockMarketProvider'

// 지금은 mock provider만 활성화되어 있다.
// 나중에 실제 API(예: Twelve Data 등)를 붙일 때는 이 파일에서
// activeMarketProvider만 실제 provider로 교체하면 되고,
// marketService / useMarket / Market.tsx는 손댈 필요가 없다.
export const activeMarketProvider: MarketProvider = mockMarketProvider
