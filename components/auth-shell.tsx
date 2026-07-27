'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'

// Client-requested palette: dark surface + bright lime-green accent.
export const AUTH_GREEN = '#8bc34a'

// Shared auth layout: a green promo panel beside the form on desktop, a compact
// header on mobile, and a Register / Log In tab switcher above the form.
export function AuthShell({
  active,
  children,
}: {
  active: 'login' | 'register'
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#0d1117] text-white lg:grid lg:grid-cols-2">
      {/* Promo panel — desktop only */}
      <aside
        className="relative hidden lg:flex flex-col justify-between overflow-hidden p-10"
        style={{
          background:
            'radial-gradient(130% 110% at 0% 0%, #3aa53f 0%, #1c5a24 45%, #0d1117 100%)',
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.10]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '18px 18px',
          }}
        />
        <div aria-hidden className="absolute -top-20 -left-16 w-72 h-72 rounded-full bg-[#8bc34a]/25 blur-3xl" />

        <Link href="/" className="relative z-10 inline-flex" aria-label="Betfus home">
          <Image
            src="/betfus-logo.svg"
            alt="Betfus"
            width={360}
            height={104}
            className="logo-img h-9 w-auto brightness-0 invert"
          />
        </Link>

        <div className="relative z-10 max-w-md">
          <h2 className="text-4xl font-black uppercase leading-[1.03] tracking-tight">
            Welcome to
            <br />
            Betfus Betting
          </h2>
          <p className="mt-4 text-white/85 leading-relaxed">
            Live football, instant mobile-money deposits, and fast withdrawals.
          </p>
          <Link
            href="/football"
            className="mt-6 inline-flex items-center px-7 py-3 rounded-xl bg-[#8bc34a] text-[#0d1117] font-extrabold text-sm hover:brightness-105 active:scale-[0.98] transition"
          >
            Bet Now
          </Link>
        </div>

        <p className="relative z-10 text-xs text-white/60">
          © {new Date().getFullYear()} Betfus · 18+ · Play responsibly.
        </p>
      </aside>

      {/* Form side */}
      <main className="flex flex-col min-h-screen">
        <header className="border-b border-white/10">
          <div className="max-w-md mx-auto w-full px-4 h-14 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm">Back</span>
            </Link>
            <Link href="/" className="flex items-center lg:hidden" aria-label="Betfus home">
              <Image
                src="/betfus-logo.svg"
                alt="Betfus"
                width={360}
                height={104}
                className="logo-img h-7 w-auto brightness-0 invert"
              />
            </Link>
            <div className="w-14" />
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-4 py-8">
          <div className="w-full max-w-md">
            <h1 className="text-2xl font-bold tracking-tight mb-4">Welcome</h1>

            {/* Register / Log In tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#161b22] border border-[#232a35] mb-6">
              <Link
                href="/register"
                className={`h-10 flex items-center justify-center rounded-lg text-sm font-bold transition ${
                  active === 'register'
                    ? 'bg-[#8bc34a]/15 text-[#8bc34a]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Register
              </Link>
              <Link
                href="/login"
                className={`h-10 flex items-center justify-center rounded-lg text-sm font-bold transition ${
                  active === 'login'
                    ? 'bg-[#8bc34a]/15 text-[#8bc34a]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Log In
              </Link>
            </div>

            {children}
          </div>
        </div>
      </main>
    </div>
  )
}

// Icon-prefixed dark input matching the reference. `trailing` slots a button
// (e.g. the password eye) on the right.
export function AuthField({
  icon: Icon,
  trailing,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ComponentType<{ className?: string }>
  trailing?: React.ReactNode
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      <input
        {...props}
        className={`w-full h-12 rounded-xl bg-[#1b212b] border border-[#2a323e] pl-11 ${
          trailing ? 'pr-11' : 'pr-4'
        } text-sm text-white placeholder:text-gray-500 outline-none focus:border-[#8bc34a]/70 focus:ring-2 focus:ring-[#8bc34a]/30 transition ${className}`}
      />
      {trailing && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>
      )}
    </div>
  )
}

// Full-width lime-green submit button.
export function AuthButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full h-12 rounded-xl bg-[#8bc34a] text-[#0d1117] font-extrabold text-sm hover:brightness-105 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
    >
      {children}
    </button>
  )
}
