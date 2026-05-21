'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
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
            className="flex flex-col items-center gap-1 px-3 py-2 text-muted-foreground hover:text-primary transition-colors"
          >
            <span className="text-lg">⚽</span>
            <span className="text-[11px] font-medium">Football</span>
          </Link>
          <Link
            href="/sports"
            className="flex flex-col items-center gap-1 px-3 py-2 text-muted-foreground hover:text-primary transition-colors"
          >
            <span className="text-lg">🏆</span>
            <span className="text-[11px] font-medium">Sports</span>
          </Link>
          <Link
            href="/live"
            className="flex flex-col items-center gap-1 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="relative">
              <span className="text-lg">📺</span>
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-live rounded-full animate-pulse-live" />
            </span>
            <span className="text-[11px] font-medium">Live</span>
          </Link>
          <Link
            href="/me"
            className={`flex flex-col items-center gap-1 px-3 py-2 transition-colors relative ${
              activeTab === 'me'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="text-lg">👤</span>
            {activeTab === 'me' && (
              <span className="absolute top-0 right-2 w-1.5 h-1.5 bg-live rounded-full" />
            )}
            <span className="text-[11px] font-medium">Me</span>
          </Link>
          <button
            onClick={() => setIsSlipOpen(true)}
            className={`flex flex-col items-center gap-1 px-3 py-2 transition-colors relative ${
              activeTab === 'betslip'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="text-lg">📋</span>
            {selectedBets.length > 0 && (
              <span className="absolute top-0 right-1 w-5 h-5 bg-primary text-primary-foreground rounded-full text-xs flex items-center justify-center font-bold">
                {selectedBets.length}
              </span>
            )}
            <span className="text-[11px] font-medium">Betslip</span>
          </button>
        </div>
      </nav>

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

  return (
    <div className="fixed inset-0 z-50 xl:hidden">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="absolute bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-2xl max-h-[88vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
        style={{ overscrollBehavior: 'contain' }}
      >
        <div className="sticky top-0 bg-card px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-lg text-foreground">Bet Slip</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-secondary transition-colors"
            aria-label="Close bet slip"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

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
