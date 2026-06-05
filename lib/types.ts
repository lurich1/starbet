export interface Match {
  id: string
  league: string
  country: string
  homeTeam: string
  awayTeam: string
  homeScore?: number
  awayScore?: number
  minute?: string
  startTime?: string
  startTimeISO?: string
  isLive: boolean
  odds: {
    home: number
    draw: number
    away: number
  }
  markets?: MarketBook
  sport?: string
  custom?: boolean
  demo?: boolean
  /** Public image URLs for team flags / crests, set by admin on custom matches. */
  homeFlagUrl?: string
  awayFlagUrl?: string
  /** Admin manual lock — when true, no new bets are accepted regardless of isLive / startTime. */
  locked?: boolean
}

export interface OverUnderLine {
  line: number
  over: number
  under: number
}

export interface ScoreOdds {
  score: string
  odds: number
}

export interface HtFtOdds {
  code: string
  label: string
  odds: number
}

export interface MarketBook {
  matchWinner: { home: number; draw: number; away: number }
  doubleChance: { homeOrDraw: number; homeOrAway: number; drawOrAway: number }
  overUnder: OverUnderLine[]
  btts: { yes: number; no: number }
  correctScore: ScoreOdds[]
  halfTimeFullTime: HtFtOdds[]
  firstHalf1X2?: { home: number; draw: number; away: number }
  drawNoBet?: { home: number; away: number }
}

export interface BetSelection {
  id: string
  matchId: string
  match: Match
  marketKey: string
  marketLabel: string
  outcomeKey: string
  outcomeLabel: string
  odds: number
  selection?: 'home' | 'draw' | 'away'
  /** Per-leg result: 'pending' until the bet settles, then 'won' / 'lost'. */
  status?: 'pending' | 'won' | 'lost'
}

export interface League {
  id: string
  name: string
  country: string
  flag: string
  matchCount: number
}

export interface Sport {
  id: string
  name: string
  icon: string
  matchCount: number
}

export interface SubAdmin {
  id: string
  name: string
  email: string
  passwordHash: string
  referralCode: string
  approved: boolean
  createdAt: string
  /** Legacy GHS-only scalar (kept for back-compat reads). */
  commissionBalance: number
  /** Legacy GHS-only scalar (kept for back-compat reads). */
  totalCommissionEarned: number
  /** Per-currency balances. The application reads/writes these as authoritative. */
  commissionBalances: Partial<Record<'GHS' | 'NGN' | 'KES' | 'ZAR', number>>
  /** Per-currency lifetime totals. */
  totalCommissionEarnedBy: Partial<Record<'GHS' | 'NGN' | 'KES' | 'ZAR', number>>
}

export interface AppUser {
  id: string
  name: string
  email: string
  passwordHash: string
  phone?: string
  /** ISO country code: 'GH' | 'NG' | 'KE' | 'ZA'. */
  country: 'GH' | 'NG' | 'KE' | 'ZA'
  /** Wallet currency: 'GHS' | 'NGN' | 'KES' | 'ZAR'. Mirrors country. */
  currency: 'GHS' | 'NGN' | 'KES' | 'ZAR'
  /** Ghana Card number (legacy column; only populated for GH users). */
  ghanaCard?: string
  /** Country-specific KYC value: Ghana Card, BVN/NIN, Kenyan/SA national ID. */
  kycId?: string
  referredByCode?: string
  referredBySubAdminId?: string
  firstDepositAmount: number
  firstDepositAt?: string
  totalDeposited: number
  totalWithdrawn?: number
  balance?: number
  verificationStep?: 0 | 1 | 2 | 3 | 4
  withdrawalApproved?: boolean
  createdAt: string
}

export interface Commission {
  id: string
  subAdminId: string
  userId: string
  depositAmount: number
  commission: number
  rate: number
  currency: 'GHS' | 'NGN' | 'KES' | 'ZAR'
  createdAt: string
}

export const COMMISSION_RATE = 0.7 // 70% of every deposit from a referred user

export interface PlacedBet {
  id: string
  code: string
  userId?: string | null
  placedAt: string
  stake: number
  totalOdds: number
  potentialWin: number
  currency: 'GHS' | 'NGN' | 'KES' | 'ZAR'
  status: 'pending' | 'won' | 'lost'
  selections: BetSelection[]
  settledAt?: string
  payout?: number
}
