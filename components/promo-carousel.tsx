'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getUserId } from '@/lib/user-session'
import { formatMoney } from '@/lib/format-money'
import {
  DEFAULT_CURRENCY,
  isCurrencyCode,
  type CurrencyCode,
} from '@/lib/countries'

// Per-currency marketing amounts (not FX-derived). Fallback to GHS.
const FIRST_DEPOSIT_MAX: Record<CurrencyCode, number> = {
  GHS: 500,
  NGN: 75_000,
  KES: 6_500,
  ZAR: 900,
}
const REFERRAL_AMOUNT: Record<CurrencyCode, number> = {
  GHS: 50,
  NGN: 7_500,
  KES: 650,
  ZAR: 90,
}

function pick<T>(map: Record<CurrencyCode, T>, currency: CurrencyCode): T {
  return map[currency] ?? map[DEFAULT_CURRENCY]
}

interface PromoCard {
  id: string
  title: string
  /** Small accent chip, top-left (e.g. "100%"). */
  tag?: string
  sub: (currency: CurrencyCode) => string
  image: string
  href: (userId: string | null) => string
}

// football.com-style promo cards — a horizontally scrollable row of image
// tiles with a label at the bottom, replacing the old full-width banner.
const CARDS: PromoCard[] = [
  {
    id: 'welcome',
    title: 'Welcome Bonus',
    tag: '100%',
    sub: (c) => `Up to ${c} ${formatMoney(pick(FIRST_DEPOSIT_MAX, c), c)}`,
    image: '/promo-bonus.jpg',
    href: (uid) => (uid ? `/users/first-deposit?userId=${uid}` : '/register'),
  },
  {
    id: 'top-matches',
    title: 'Top Matches',
    sub: () => "Biggest games today",
    image: '/first.png',
    href: () => '/football',
  },
  {
    id: 'refer',
    title: 'Refer & Earn',
    sub: (c) => `Earn ${c} ${formatMoney(pick(REFERRAL_AMOUNT, c), c)} / friend`,
    image: '/promo-referral.jpg',
    href: (uid) => (uid ? '/me' : '/register'),
  },
  {
    id: 'games',
    title: 'Casino & Games',
    sub: () => 'Play & win instantly',
    image: '/group-young-people-looking-excited-spinning-roulette-roulette-table-casino-black-background.jpg',
    href: () => '/games',
  },
]

export function PromoCarousel() {
  const [userId, setUserId] = useState<string | null>(null)
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY)

  // Resolve the signed-in user's currency so amounts render in their wallet
  // currency. Logged-out users keep the GHS default.
  useEffect(() => {
    const uid = getUserId()
    setUserId(uid)
    if (!uid) return
    let cancelled = false
    void fetch(`/api/users/${uid}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        if (isCurrencyCode(data.currency)) setCurrency(data.currency)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="-mx-3 sm:mx-0">
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-3 sm:px-0 py-0.5">
        {CARDS.map((card) => (
          <Link
            key={card.id}
            href={card.href(userId)}
            className="group relative shrink-0 w-[132px] h-[104px] sm:w-[168px] sm:h-[112px] rounded-2xl overflow-hidden ring-1 ring-border hover:ring-primary/50 transition-all"
          >
            <Image
              src={card.image}
              alt=""
              fill
              sizes="168px"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10"
            />

            {card.tag && (
              <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground text-[11px] font-extrabold leading-none shadow">
                {card.tag}
              </span>
            )}

            <div className="absolute inset-x-2.5 bottom-2">
              <p className="text-white font-extrabold text-[13px] leading-tight drop-shadow">
                {card.title}
              </p>
              <p className="text-white/80 text-[10px] font-medium leading-tight mt-0.5 line-clamp-1">
                {card.sub(currency)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
