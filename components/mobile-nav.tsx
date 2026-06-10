'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Blocks, Goal, Radio, Receipt, Trophy, User, X } from 'lucide-react'
import type { BetSelection } from '@/lib/types'
import { BetSlipPanel } from '@/components/bet-slip-panel'

interface MobileNavProps {
  selectedBets: BetSelection[]
  onRemoveSelection?: (selectionId: string) => void
  onClearAll?: () => void
  onLoadSelections?: (selections: BetSelection[]) => void
  activeTab?: 'football' | 'sports' | 'live' | 'leagues' | 'betslip' | 'me'
}

export function MobileNav({
  selectedBets,
  onRemoveSelection = () => {},
  onClearAll = () => {},
  onLoadSelections,
  activeTab,
}: MobileNavProps) {
  const [isSlipOpen, setIsSlipOpen] = useState(false)

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border xl:hidden z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around py-2">
          <Link
            href="/football"
            className="flex flex-col items-center gap-1 px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
          >
            <Goal className="w-5 h-5" strokeWidth={2} />
            <span className="text-[11px] font-medium">Football</span>
          </Link>
          <Link
            href="/sports"
            className="flex flex-col items-center gap-1 px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
          >
            <Trophy className="w-5 h-5" strokeWidth={2} />
            <span className="text-[11px] font-medium">Sports</span>
          </Link>
          <Link
            href="/live"
            className="flex flex-col items-center gap-1 px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="relative">
              <Radio className="w-5 h-5" strokeWidth={2} />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-live rounded-full animate-pulse-live" />
            </span>
            <span className="text-[11px] font-medium">Live</span>
          </Link>
          <Link
            href="/games/tower-rush"
            className="flex flex-col items-center gap-1 px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors"
          >
            <Blocks className="w-5 h-5" strokeWidth={2} />
            <span className="text-[11px] font-medium">Tower</span>
          </Link>
          <Link
            href="/me"
            className={`flex flex-col items-center gap-1 px-3 py-1.5 transition-colors relative ${
              activeTab === 'me'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="w-5 h-5" strokeWidth={2} />
            {activeTab === 'me' && (
              <span className="absolute top-0 right-2 w-1.5 h-1.5 bg-live rounded-full" />
            )}
            <span className="text-[11px] font-medium">Me</span>
          </Link>
        </div>
      </nav>

      {/* Floating bet slip button — appears above the nav once you have
          selections, opens the slip drawer. */}
      {selectedBets.length > 0 && (
        <button
          onClick={() => setIsSlipOpen(true)}
          aria-label={`Open bet slip, ${selectedBets.length} selection${selectedBets.length > 1 ? 's' : ''}`}
          className="fixed right-3 bottom-24 z-50 xl:hidden flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-b from-primary to-primary/85 text-primary-foreground shadow-xl shadow-primary/40 ring-1 ring-white/20 active:scale-95 transition-transform animate-in fade-in zoom-in duration-200"
        >
          <span className="relative">
            <Receipt className="w-6 h-6" strokeWidth={2} />
            <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-extrabold flex items-center justify-center ring-2 ring-card tabular-nums">
              {selectedBets.length}
            </span>
          </span>
          <span className="text-[9px] font-bold tracking-wide mt-1">BET SLIP</span>
        </button>
      )}

      <MobileBetSlipDrawer
        isOpen={isSlipOpen}
        onClose={() => setIsSlipOpen(false)}
        selections={selectedBets}
        onRemoveSelection={onRemoveSelection}
        onClearAll={onClearAll}
        onLoadSelections={onLoadSelections}
      />
    </>
  )
}

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  selections: BetSelection[]
  onRemoveSelection: (selectionId: string) => void
  onClearAll: () => void
  onLoadSelections?: (selections: BetSelection[]) => void
}

function MobileBetSlipDrawer({
  isOpen,
  onClose,
  selections,
  onRemoveSelection,
  onClearAll,
  onLoadSelections,
}: DrawerProps) {
  if (!isOpen) return null

  // Full-screen sheet (Sportybet-style): slides in from the bottom and fills
  // the entire viewport so the stake input and totals are always visible
  // when the keyboard is open.
  return (
    <div className="fixed inset-0 z-50 xl:hidden bg-background flex flex-col">
      <div className="bg-card px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
        <h2 className="font-bold text-lg text-foreground">Bet Slip</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-secondary transition-colors"
          aria-label="Close bet slip"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>
      <div
        className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        style={{ overscrollBehavior: 'contain' }}
      >
        <BetSlipPanel
          selections={selections}
          onRemoveSelection={onRemoveSelection}
          onClearAll={onClearAll}
          onLoadSelections={onLoadSelections}
        />
      </div>
    </div>
  )
}
