'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, ChevronLeft, ChevronRight, Gift, Sparkles, Trophy } from 'lucide-react'
import { getUserId } from '@/lib/user-session'
import { formatMoney } from '@/lib/format-money'
import {
  DEFAULT_CURRENCY,
  isCurrencyCode,
  type CurrencyCode,
} from '@/lib/countries'

// One slide's content. Amounts are stored per currency so each market shows a
// number that actually makes sense — we don't FX-convert at runtime since the
// real bonus terms are set by operations, not a forex feed.
interface Promo {
  id: string
  eyebrow: string
  /** Tiny line just above the giant headline ("WIN UP TO", "EARN", "GET"). */
  preheadline?: string
  /** The huge number/percentage that dominates the card. */
  headline: string
  /** Smaller word(s) immediately after the headline ("BONUS", "CEDIS"). */
  subheadline?: string
  /** Caption line under the headline cluster ("Up to GHS 500 · T&Cs apply"). */
  caption: (currency: CurrencyCode) => string
  cta: string
  /** Destination depends on whether the user is signed in. */
  href: (userId: string | null) => string
  Icon: typeof Trophy
  /** Tailwind gradient utility classes (background fill). */
  gradient: string
  /** Tailwind text color for the headline. */
  accent: string
  /** Optional banner image path in /public — overlays under the copy. Drop a
   *  licensed/commissioned banner here and it replaces the gradient art. */
  image?: string
}

// Per-currency amount maps. Tune these per market; they're marketing values,
// not derived from FX. Fallback to GHS when an entry is missing.
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
const WEEKEND_PRIZE: Record<CurrencyCode, number> = {
  GHS: 3_000,
  NGN: 450_000,
  KES: 39_000,
  ZAR: 5_400,
}

function pick<T>(map: Record<CurrencyCode, T>, currency: CurrencyCode): T {
  return map[currency] ?? map[DEFAULT_CURRENCY]
}

const PROMOS: Promo[] = [
  {
    id: 'first-deposit',
    eyebrow: 'First Deposit Bonus',
    headline: '100%',
    subheadline: 'BONUS',
    caption: (c) => `Up to ${c} ${formatMoney(pick(FIRST_DEPOSIT_MAX, c), c)} · T&Cs apply`,
    cta: 'Claim now',
    href: (userId) => (userId ? `/users/first-deposit?userId=${userId}` : '/register'),
    Icon: Trophy,
    gradient: 'from-amber-400 via-orange-500 to-rose-600',
    accent: 'text-white',
    image: '/promo-bonus.jpg',
  },
  {
    id: 'refer-a-friend',
    eyebrow: 'Refer a Friend',
    preheadline: 'EARN',
    headline: '',
    subheadline: 'per friend',
    caption: (c) =>
      `When they make their first deposit of ${c} ${formatMoney(pick(FIRST_DEPOSIT_MAX, c), c)}`,
    cta: 'Get my link',
    href: (userId) => (userId ? '/me' : '/register'),
    Icon: Gift,
    gradient: 'from-fuchsia-500 via-purple-600 to-indigo-700',
    accent: 'text-white',
    image: '/promo-referral.jpg',
  },
  {
    id: 'weekend-booster',
    eyebrow: 'Weekend Booster',
    preheadline: 'WIN UP TO',
    headline: '',
    caption: () => 'Place 5+ bets this weekend · biggest wins go bigger',
    cta: 'View boost',
    href: () => '/live',
    Icon: Sparkles,
    gradient: 'from-cyan-500 via-blue-600 to-violet-700',
    accent: 'text-white',
    image: '/group-young-people-looking-excited-spinning-roulette-roulette-table-casino-black-background.jpg',
  },
]

/**
 * Resolve a slide's headline. For the two refer / weekend slides the headline
 * is the per-currency amount; for first-deposit it's the literal "100%".
 */
function headlineFor(promo: Promo, currency: CurrencyCode): string {
  if (promo.id === 'refer-a-friend') {
    return `${currency} ${formatMoney(pick(REFERRAL_AMOUNT, currency), currency)}`
  }
  if (promo.id === 'weekend-booster') {
    return `${currency} ${formatMoney(pick(WEEKEND_PRIZE, currency), currency)}`
  }
  return promo.headline
}

export function PromoCarousel() {
  const [index, setIndex] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY)

  // Resolve the signed-in user's currency on mount so amounts render in their
  // wallet currency. Logged-out users keep the GHS default.
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

  // Autoplay every 5s, no pause logic — keeps the slideshow visibly alive on
  // both mobile and desktop. Manual taps on a dot/arrow just reset to a new
  // index; the interval keeps marching on its own from there.
  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % PROMOS.length), 5000)
    return () => clearInterval(t)
  }, [])

  const ctaHref = PROMOS[index].href(userId)

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Sliding track: full-width strip of slides translated by index ×100%. */}
      <div
        className="relative flex h-[210px] sm:h-[230px] transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {PROMOS.map((promo, i) => {
          const Glyph = promo.Icon
          const slideHeadline = headlineFor(promo, currency)
          const active = i === index
          return (
            <div
              key={promo.id}
              aria-hidden={!active}
              className="relative flex-shrink-0 w-full"
            >
              <div className={`relative h-full bg-gradient-to-br ${promo.gradient} text-white overflow-hidden ring-1 ring-white/10`}>
                {/* Optional banner image (overlays under the copy) + readability scrim */}
                {promo.image && (
                  <>
                    <Image src={promo.image} alt="" fill priority={active} className="object-cover" />
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/20" />
                  </>
                )}
                {/* Subtle radial-dot pattern overlay so the gradient doesn't read flat */}
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-[0.12]"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                    backgroundSize: '14px 14px',
                  }}
                />
                {/* Diagonal sheen */}
                <div aria-hidden className="absolute inset-0 bg-gradient-to-tr from-black/30 via-transparent to-white/15" />
                {/* Glow blobs */}
                <div aria-hidden className="absolute -right-12 -top-10 w-56 h-56 rounded-full bg-white/20 blur-2xl" />
                <div aria-hidden className="absolute -left-16 -bottom-14 w-56 h-56 rounded-full bg-black/25 blur-3xl" />

                <div className="relative h-full px-5 sm:px-6 py-5 flex items-center gap-4">
                  {/* Left: copy + CTA */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
                    <div className="min-w-0">
                      <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] font-bold text-white/85">
                        {promo.eyebrow}
                      </p>
                      {promo.preheadline && (
                        <p className="text-xs sm:text-sm font-bold text-white/85 mt-2 leading-none uppercase tracking-wider">
                          {promo.preheadline}
                        </p>
                      )}
                      <p className={`mt-1 font-black leading-none ${promo.accent} drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)] tabular-nums`}
                        style={{
                          // Scale headline down for big currency strings (e.g. "NGN 450,000")
                          // so it doesn't wrap on narrow phones.
                          fontSize:
                            slideHeadline.length > 8
                              ? 'clamp(1.75rem, 7vw, 2.75rem)'
                              : 'clamp(2.5rem, 10vw, 3.5rem)',
                        }}
                      >
                        {slideHeadline}
                      </p>
                      {promo.subheadline && (
                        <p className="text-base sm:text-lg font-extrabold uppercase tracking-wide text-white/90 mt-0.5">
                          {promo.subheadline}
                        </p>
                      )}
                      <p className="text-[10px] sm:text-xs text-white/80 mt-1.5 line-clamp-2">
                        {promo.caption(currency)}
                      </p>
                    </div>

                    <Link
                      href={promo.href(userId)}
                      className="mt-3 inline-flex items-center gap-1.5 self-start px-4 py-2 rounded-full bg-white text-foreground font-bold text-xs sm:text-sm hover:bg-white/90 transition-colors shadow-md"
                    >
                      {promo.cta}
                      <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </Link>
                  </div>

                  {/* Right: oversized icon in a glowing halo */}
                  <div className="relative shrink-0 flex items-center justify-center w-20 sm:w-32">
                    <div aria-hidden className="absolute inset-0 m-auto w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-white/15 blur-xl" />
                    <div className="relative flex items-center justify-center w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-white/10 ring-1 ring-white/25 backdrop-blur-sm">
                      <Glyph className="w-9 h-9 sm:w-14 sm:h-14 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]" strokeWidth={1.75} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Arrows — hidden on touch so they don't fight the swipe area; visible on hover for desktop */}
      <button
        onClick={() => setIndex((i) => (i - 1 + PROMOS.length) % PROMOS.length)}
        className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 transition-colors"
        aria-label="Previous promo"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => setIndex((i) => (i + 1) % PROMOS.length)}
        className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 transition-colors"
        aria-label="Next promo"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Dots — anchored to the top-right so they never overlap the CTA on the bottom-left */}
      <div className="absolute top-3 right-3 flex gap-1.5">
        {PROMOS.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'bg-white w-5' : 'bg-white/50 hover:bg-white/80 w-1.5'
            }`}
            aria-label={`Go to ${p.eyebrow}`}
          />
        ))}
      </div>

      {/* Hidden CTA route reference so dev tools / accessibility tree see the resolved URL */}
      <span className="sr-only">{ctaHref}</span>
    </div>
  )
}
