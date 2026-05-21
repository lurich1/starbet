'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Moon, Sun, Menu, X, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getUserId } from '@/lib/user-session'
import { formatMoney } from '@/lib/format-money'

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [balance, setBalance] = useState<number | null>(null)

  useEffect(() => {
    setUserId(getUserId())
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  useEffect(() => {
    if (!userId) {
      setBalance(null)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/users/${userId}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setBalance(typeof data.balance === 'number' ? data.balance : 0)
      } catch {
        /* ignore */
      }
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [userId])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
  }

  const depositHref = userId
    ? `/users/first-deposit?userId=${userId}`
    : '/register'

  return (
    <header className="sticky top-0 z-50 bg-card border-b border-border">
      <nav className="max-w-[1400px] mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center" aria-label="Prime Bet home">
            <Image
              src="/primebet.png"
              alt="Prime Bet"
              width={282}
              height={123}
              priority
              className="logo-img h-7 sm:h-8 w-auto"
            />
          </Link>

          <div className="hidden md:flex items-center gap-1">
            <Link
              href="/sports"
              className="px-4 py-2 rounded-lg text-foreground hover:bg-secondary transition-colors font-medium"
            >
              Sports
            </Link>
            <Link
              href="/football"
              className="px-4 py-2 rounded-lg text-foreground hover:bg-secondary transition-colors font-medium"
            >
              Football
            </Link>
            <Link
              href="/live"
              className="px-4 py-2 rounded-lg text-foreground hover:bg-secondary transition-colors font-medium flex items-center gap-2"
            >
              <span className="w-2 h-2 bg-live rounded-full animate-pulse-live" />
              Live
            </Link>
            <Link
              href="/leagues"
              className="px-4 py-2 rounded-lg text-foreground hover:bg-secondary transition-colors font-medium"
            >
              Leagues
            </Link>
            <Link
              href="/me"
              className="px-4 py-2 rounded-lg text-foreground hover:bg-secondary transition-colors font-medium"
            >
              Me
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {userId ? (
              <>
                <Link
                  href="/me"
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#2ecc71]/10 border border-[#2ecc71]/40 hover:bg-[#2ecc71]/20 transition-colors"
                  aria-label="View account balance"
                >
                  <Wallet className="w-4 h-4 text-[#2ecc71]" />
                  <span className="text-xs text-muted-foreground">Balance</span>
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {balance === null ? '—' : `GHS ${formatMoney(balance)}`}
                  </span>
                </Link>
                <Link href={depositHref} className="hidden sm:block">
                  <Button
                    size="sm"
                    className="bg-[#2ecc71] hover:bg-[#27ae60] text-white font-bold gap-1.5"
                  >
                    <Wallet className="w-4 h-4" />
                    Deposit
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="outline" className="hidden sm:flex">
                    Login
                  </Button>
                </Link>
                <Link href="/register">
                  <Button className="hidden sm:flex bg-primary text-primary-foreground hover:bg-primary/90">
                    Register
                  </Button>
                </Link>
              </>
            )}

            <button
              className="md:hidden p-2 rounded-lg hover:bg-secondary transition-colors"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-2">
              <Link
                href="/sports"
                className="px-4 py-2 rounded-lg hover:bg-secondary transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Sports
              </Link>
              <Link
                href="/football"
                className="px-4 py-2 rounded-lg hover:bg-secondary transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Football
              </Link>
              <Link
                href="/live"
                className="px-4 py-2 rounded-lg hover:bg-secondary transition-colors flex items-center gap-2"
                onClick={() => setIsMenuOpen(false)}
              >
                <span className="w-2 h-2 bg-live rounded-full animate-pulse-live" />
                Live
              </Link>
              <Link
                href="/leagues"
                className="px-4 py-2 rounded-lg hover:bg-secondary transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Leagues
              </Link>
              <Link
                href="/me"
                className="px-4 py-2 rounded-lg hover:bg-secondary transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Me
              </Link>
              {userId ? (
                <div className="flex gap-2 mt-2 px-4">
                  <Link href={depositHref} className="flex-1" onClick={() => setIsMenuOpen(false)}>
                    <Button className="w-full bg-[#2ecc71] hover:bg-[#27ae60] text-white font-bold">
                      Deposit
                    </Button>
                  </Link>
                  <Link href="/me" className="flex-1" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full border-[#2ecc71] text-[#2ecc71]">
                      Account
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="flex gap-2 mt-2 px-4">
                  <Link href="/login" className="flex-1" onClick={() => setIsMenuOpen(false)}>
                    <Button variant="outline" className="w-full">Login</Button>
                  </Link>
                  <Link href="/register" className="flex-1" onClick={() => setIsMenuOpen(false)}>
                    <Button className="w-full bg-primary text-primary-foreground">Register</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}
