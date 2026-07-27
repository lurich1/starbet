'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, ChevronRight } from 'lucide-react'
import { sports, countries } from '@/lib/mock-data'

interface SportsSidebarProps {
  activeSport: string
  onSportChange: (sport: string) => void
}

// Flag emoji don't render on Windows/Chrome, so we show a clean 2-letter
// monogram badge instead of relying on the emoji falling back to a raw code.
function monogram(code: string, name: string) {
  return (code.includes('-') ? name.slice(0, 2) : code).toUpperCase()
}

export function SportsSidebar({ activeSport, onSportChange }: SportsSidebarProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return countries
    return countries.filter((c) => c.name.toLowerCase().includes(q))
  }, [query])

  return (
    <aside className="w-64 bg-card border-r border-border h-[calc(100vh-64px)] sticky top-16 overflow-y-auto custom-scrollbar hidden lg:flex flex-col">
      {/* Sports — compact tile grid */}
      <div className="p-3">
        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.14em] mb-2.5 px-1">
          Sports
        </p>
        <div className="grid grid-cols-3 gap-2">
          {sports.map((sport) => {
            const active = activeSport === sport.id
            return (
              <button
                key={sport.id}
                onClick={() => onSportChange(sport.id)}
                aria-pressed={active}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-3 transition-all cursor-pointer ${
                  active
                    ? 'border-primary/60 bg-primary/15 text-primary shadow-sm shadow-primary/20'
                    : 'border-border bg-secondary/40 text-foreground/70 hover:border-primary/40 hover:text-foreground hover:-translate-y-0.5'
                }`}
              >
                <span className="text-xl leading-none">{sport.icon}</span>
                <span className="text-[10.5px] font-semibold leading-none">{sport.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="h-px bg-border mx-3" />

      {/* Countries — searchable list with monogram badges */}
      <div className="p-3 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2.5 px-1">
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.14em]">
            Countries
          </p>
          <span className="text-[10px] font-semibold text-muted-foreground/70">
            {filtered.length}
          </span>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country"
            className="w-full h-9 rounded-lg bg-secondary/60 border border-border pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition"
          />
        </div>

        <div className="space-y-0.5 overflow-y-auto custom-scrollbar -mr-1 pr-1">
          {filtered.map((country) => (
            <Link
              key={country.code}
              href={`/football/${country.code.toLowerCase()}`}
              className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-foreground/80 hover:text-foreground hover:bg-secondary transition-colors"
            >
              <span className="shrink-0 grid place-items-center w-7 h-7 rounded-md bg-secondary border border-border text-[10px] font-bold tracking-wide text-muted-foreground group-hover:bg-primary/15 group-hover:border-primary/40 group-hover:text-primary transition-colors">
                {monogram(country.code, country.name)}
              </span>
              <span className="text-[13px] font-medium truncate">{country.name}</span>
              <ChevronRight className="ml-auto w-3.5 h-3.5 shrink-0 text-transparent group-hover:text-primary transition-colors" />
            </Link>
          ))}

          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No country matches “{query}”.
            </p>
          )}
        </div>
      </div>
    </aside>
  )
}
