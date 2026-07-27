'use client'

import Link from 'next/link'
import { Goal, Radio, Trophy, Blocks, Gift, Wallet } from 'lucide-react'
import { spinxpressHref } from '@/lib/spinxpress'

// SportyBet-style quick-action tiles: a thumb-friendly row of the main
// destinations right under the hero. Colourful icon chips, one tap each.
interface Tile {
  label: string
  href: string
  external?: boolean
  cls: string
  icon: typeof Goal
  live?: boolean
}

export function QuickActions({ userId }: { userId: string | null }) {
  const tiles: Tile[] = [
    { label: 'Sports', href: '/football', cls: 'from-emerald-500 to-emerald-600', icon: Goal },
    { label: 'Live', href: '/live', cls: 'from-rose-500 to-rose-600', icon: Radio, live: true },
    { label: 'Leagues', href: '/leagues', cls: 'from-amber-500 to-orange-600', icon: Trophy },
    {
      label: 'Games',
      href: spinxpressHref(userId),
      external: true,
      cls: 'from-indigo-500 to-blue-600',
      icon: Blocks,
    },
    {
      label: 'Deposit',
      href: userId ? `/users/first-deposit?userId=${userId}` : '/register',
      cls: 'from-violet-500 to-fuchsia-600',
      icon: Wallet,
    },
    { label: 'Gifts', href: '/me/gifts', cls: 'from-pink-500 to-rose-600', icon: Gift },
  ]

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-3">
      {tiles.map((t) => {
        const Icon = t.icon
        const inner = (
          <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-card border border-border p-2.5 sm:p-3 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-primary/40 transition-all">
            <span
              className={`relative w-11 h-11 rounded-xl bg-gradient-to-br ${t.cls} flex items-center justify-center shadow-md`}
            >
              <Icon className="w-5 h-5 text-white" strokeWidth={2.2} />
              {t.live && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-live ring-2 ring-card animate-pulse" />
              )}
            </span>
            <span className="text-[11px] font-bold text-foreground leading-none">{t.label}</span>
          </div>
        )
        return t.external ? (
          <a key={t.label} href={t.href} target="_blank" rel="noopener noreferrer">
            {inner}
          </a>
        ) : (
          <Link key={t.label} href={t.href}>
            {inner}
          </Link>
        )
      })}
    </div>
  )
}
