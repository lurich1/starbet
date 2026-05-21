import path from 'path'
import { randomUUID } from 'crypto'
import type { AppUser, Commission } from '@/lib/types'
import { readJsonArray, writeJsonArray } from '@/lib/json-store'

const DATA_DIR = path.join(process.cwd(), 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const COMMISSIONS_FILE = path.join(DATA_DIR, 'commissions.json')

export async function readUsers(): Promise<AppUser[]> {
  return readJsonArray<AppUser>(USERS_FILE)
}

async function writeUsers(all: AppUser[]): Promise<void> {
  await writeJsonArray(USERS_FILE, all)
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const all = await readUsers()
  const lower = email.toLowerCase()
  return all.find((u) => u.email.toLowerCase() === lower) ?? null
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const all = await readUsers()
  const user = all.find((u) => u.id === id) ?? null
  if (user && user.balance === undefined) {
    return { ...user, balance: user.totalDeposited - (user.totalWithdrawn ?? 0) }
  }
  return user
}

export async function addUser(
  input: Omit<AppUser, 'id' | 'createdAt' | 'firstDepositAmount' | 'totalDeposited' | 'totalWithdrawn' | 'balance'>,
): Promise<AppUser> {
  const all = await readUsers()
  const user: AppUser = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    firstDepositAmount: 0,
    totalDeposited: 0,
    totalWithdrawn: 0,
    balance: 0,
  }
  all.unshift(user)
  await writeUsers(all)
  return user
}

export async function recordDeposit(
  userId: string,
  amount: number,
): Promise<{ user: AppUser; isFirst: boolean } | null> {
  const all = await readUsers()
  const idx = all.findIndex((u) => u.id === userId)
  if (idx === -1) return null
  const user = all[idx]
  const isFirst = !user.firstDepositAt
  const currentBalance = user.balance ?? user.totalDeposited - (user.totalWithdrawn ?? 0)
  const next: AppUser = {
    ...user,
    firstDepositAmount: isFirst ? amount : user.firstDepositAmount,
    firstDepositAt: user.firstDepositAt ?? new Date().toISOString(),
    totalDeposited: +(user.totalDeposited + amount).toFixed(2),
    totalWithdrawn: user.totalWithdrawn ?? 0,
    balance: +(currentBalance + amount).toFixed(2),
  }
  all[idx] = next
  await writeUsers(all)
  return { user: next, isFirst }
}

export async function recordWithdrawal(
  userId: string,
  amount: number,
): Promise<{ user: AppUser } | { error: 'not-found' | 'insufficient-funds' | 'no-deposit' }> {
  const all = await readUsers()
  const idx = all.findIndex((u) => u.id === userId)
  if (idx === -1) return { error: 'not-found' }
  const user = all[idx]
  if (!user.firstDepositAt) return { error: 'no-deposit' }
  const currentBalance = user.balance ?? user.totalDeposited - (user.totalWithdrawn ?? 0)
  if (amount > currentBalance) return { error: 'insufficient-funds' }
  const next: AppUser = {
    ...user,
    totalWithdrawn: +((user.totalWithdrawn ?? 0) + amount).toFixed(2),
    balance: +(currentBalance - amount).toFixed(2),
  }
  all[idx] = next
  await writeUsers(all)
  return { user: next }
}

export async function listUsersReferredBy(subAdminId: string): Promise<AppUser[]> {
  const all = await readUsers()
  return all.filter((u) => u.referredBySubAdminId === subAdminId)
}

// Commissions

export async function readCommissions(): Promise<Commission[]> {
  return readJsonArray<Commission>(COMMISSIONS_FILE)
}

export async function addCommission(c: Omit<Commission, 'id' | 'createdAt'>): Promise<Commission> {
  const all = await readCommissions()
  const record: Commission = {
    ...c,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  }
  all.unshift(record)
  await writeJsonArray(COMMISSIONS_FILE, all)
  return record
}

export async function listCommissionsForSubAdmin(subAdminId: string): Promise<Commission[]> {
  const all = await readCommissions()
  return all.filter((c) => c.subAdminId === subAdminId)
}
