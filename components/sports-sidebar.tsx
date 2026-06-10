'use client'

import Link from 'next/link'
import { sports, countries } from '@/lib/mock-data'

interface SportsSidebarProps {
  activeSport: string
  onSportChange: (sport: string) => void
}

export function SportsSidebar({ activeSport, onSportChange }: SportsSidebarProps) {
  return (
    <aside className="w-64 bg-card border-r border-border h-[calc(100vh-64px)] sticky top-16 overflow-y-auto custom-scrollbar hidden lg:block">
      <div className="p-4">
        {/* Sports */}
        <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider mb-2 px-1">
          Sports
        </p>
        <div className="space-y-1">
          {sports.map((sport) => {
            const active = activeSport === sport.id
            return (
              <button
                key={sport.id}
                onClick={() => onSportChange(sport.id)}
                className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md shadow-primary/30'
                    : 'text-foreground/80 hover:text-foreground hover:bg-secondary'
                }`}
              >
                {active && <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r bg-white/80" />}
                <span className="text-lg">{sport.icon}</span>
                <span>{sport.name}</span>
              </button>
            )
          })}
        </div>

        {/* Countries A-Z */}
        <div className="mt-6">
          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider mb-2 px-1">
            Countries
          </p>
          <div className="space-y-0.5">
            {countries.map((country) => (
              <Link
                key={country.code}
                href={`/football/${country.code.toLowerCase()}`}
                className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-foreground/75 hover:text-foreground hover:bg-secondary transition-colors"
              >
                <span className="shrink-0">{country.flag}</span>
                <span className="text-sm truncate">{country.name}</span>
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary/0 group-hover:bg-primary transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
