'use client'

import Link from 'next/link'
import { Radio, Gamepad2, Ticket, Gift, LayoutGrid, CircleDot } from 'lucide-react'

// SportyBet-style category strip under the header: quick jumps to the main
// sections. Anchors (#booking / #promos) scroll to on-page blocks; the rest
// are real routes.
const CATEGORIES = [
  { label: 'Football', href: '/football', Icon: CircleDot },
  { label: 'Live', href: '/live', Icon: Radio },
  { label: 'Virtuals', href: '/games', Icon: Gamepad2 },
  { label: 'Code Center', href: '#booking', Icon: Ticket },
  { label: 'Promotions', href: '#promos', Icon: Gift },
  { label: 'More', href: '/me', Icon: LayoutGrid },
]

export function HomeCategoryRow() {
  return (
    <div className="-mx-3 sm:mx-0">
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 sm:px-0 py-0.5">
        {CATEGORIES.map(({ label, href, Icon }) => (
          <Link
            key={label}
            href={href}
            scroll={!href.startsWith('#')}
            className="group shrink-0 flex flex-col items-center gap-1.5 w-[72px]"
          >
            <span className="grid place-items-center w-12 h-12 rounded-2xl bg-card border border-border text-foreground/80 group-hover:border-primary/50 group-hover:text-primary group-hover:-translate-y-0.5 transition-all shadow-sm">
              <Icon className="w-5 h-5" />
            </span>
            <span className="text-[11px] font-semibold text-foreground/75 group-hover:text-foreground text-center leading-tight">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
