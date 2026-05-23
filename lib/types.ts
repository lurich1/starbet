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
  commissionBalance: number
  totalCommissionEarned: number
}

export interface AppUser {
  id: string
  name: string
  email: string
  passwordHash: string
  phone?: string
  referredByCode?: string
  referredBySubAdminId?: string
  firstDepositAmount: number
  firstDepositAt?: string
  totalDeposited: number
  totalWithdrawn?: number
  balance?: number
  verificationStep?: 0 | 1 | 2
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
  createdAt: string
}

export const COMMISSION_RATE = 0.6 // 60% of every deposit from a referred user

export interface PlacedBet {
  id: string
  code: string
  userId?: string | null
  placedAt: string
  stake: number
  totalOdds: number
  potentialWin: number
  status: 'pending' | 'won' | 'lost'
  selections: BetSelection[]
  settledAt?: string
  payout?: number
}
