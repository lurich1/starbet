'use client'

import { Flame } from 'lucide-react'

export type HomeTab = 'hot' | 'matches' | 'live'

const TABS: { key: HomeTab; label: string }[] = [
  { key: 'hot', label: 'Hot' },
  { key: 'matches', label: 'Matches' },
  { key: 'live', label: 'Live' },
]

// SportyBet-style HOT | Matches | Live strip that filters the home match list.
export function HomeHotTabs({
  value,
  onChange,
  liveCount,
}: {
  value: HomeTab
  onChange: (t: HomeTab) => void
  liveCount: number
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border">
      <span className="inline-flex items-center gap-1.5 pb-2.5 text-sm font-extrabold uppercase tracking-wide text-foreground">
        <Flame className="w-4 h-4 text-primary" />
        Hot
      </span>
      <span className="w-px h-4 bg-border" />
      <div className="flex items-center gap-4 -mb-px">
        {TABS.map((t) => {
          const active = value === t.key
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={`relative pb-2.5 text-sm font-bold transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {t.key === 'live' && liveCount > 0 && (
                  <span className="grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-live text-white text-[10px] font-bold tabular-nums">
                    {liveCount}
                  </span>
                )}
              </span>
              {active && (
                <span className="absolute left-0 right-0 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
