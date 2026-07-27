'use client'

import Link from 'next/link'
import { Star, CalendarDays, Clock } from 'lucide-react'

// Quick-filter chips under the category row (My Favourites / Today's Football
// / Next 3 Hours), matching the reference. Each links to a real destination.
const CHIPS = [
  { label: 'My Favourites', href: '/me/bets', Icon: Star, badge: null as string | null },
  { label: "Today's Football", href: '/football', Icon: CalendarDays, badge: null },
  { label: 'Next 3 Hours', href: '/football', Icon: Clock, badge: null },
]

export function HomeQuickChips() {
  return (
    <div className="-mx-3 sm:mx-0">
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 sm:px-0">
        {CHIPS.map(({ label, href, Icon, badge }) => (
          <Link
            key={label}
            href={href}
            className="shrink-0 inline-flex items-center gap-2 h-11 pl-2.5 pr-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors"
          >
            <span className="grid place-items-center w-7 h-7 rounded-lg bg-primary/10 text-primary">
              {badge ? (
                <span className="text-xs font-extrabold tabular-nums">{badge}</span>
              ) : (
                <Icon className="w-4 h-4" />
              )}
            </span>
            <span className="text-[13px] font-semibold text-foreground/85 whitespace-nowrap">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
