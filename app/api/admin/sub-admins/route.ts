import { NextResponse } from 'next/server'
import { readSubAdmins } from '@/lib/sub-admins-store'
import { readUsers, readCommissions } from '@/lib/users-store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [subAdmins, users, commissions] = await Promise.all([
    readSubAdmins(),
    readUsers(),
    readCommissions(),
  ])

  // Enrich each sub-admin with referral / commission stats
  const enriched = subAdmins.map((sa) => {
    const refs = users.filter((u) => u.referredBySubAdminId === sa.id)
    const withDeposit = refs.filter((u) => u.firstDepositAt).length
    const myCommissions = commissions.filter((c) => c.subAdminId === sa.id)
    return {
      id: sa.id,
      name: sa.name,
      email: sa.email,
      referralCode: sa.referralCode,
      approved: sa.approved,
      createdAt: sa.createdAt,
      commissionBalance: sa.commissionBalance,
      totalCommissionEarned: sa.totalCommissionEarned,
      referrals: refs.length,
      withDeposit,
      commissionsCount: myCommissions.length,
    }
  })

  // Platform-level totals. For every commission row, the user deposited
  // `depositAmount`, the sub-admin received `commission` (60%), and the
  // admin keeps the rest (40%). We compute the admin's share by summing
  // `depositAmount - commission` so it stays correct if the rate ever
  // changes per-row.
  const totals = commissions.reduce(
    (acc, c) => {
      acc.deposits += c.depositAmount
      acc.subAdminShare += c.commission
      acc.adminShare += c.depositAmount - c.commission
      return acc
    },
    { deposits: 0, subAdminShare: 0, adminShare: 0 },
  )

  return NextResponse.json({
    subAdmins: enriched,
    platform: {
      referredDeposits: +totals.deposits.toFixed(2),
      subAdminShare: +totals.subAdminShare.toFixed(2),
      adminShare: +totals.adminShare.toFixed(2),
    },
  })
}
