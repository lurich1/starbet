'use client'

import { useState } from 'react'
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

        {/* Hero graphic — swap /hero-player.svg for a licensed player cutout. */}
        <Image
          src="/hero-player.svg"
          alt=""
          width={320}
          height={320}
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-64 h-64 object-contain opacity-90"
        />

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

            <AuthSocial />
          </div>
        </div>
      </main>
    </div>
  )
}

// Social sign-in row (Google / Facebook / Steam). Visual-only for now — there's
// no social-auth backend, so tapping one explains it's coming rather than
// silently doing nothing.
function AuthSocial() {
  const [msg, setMsg] = useState<string | null>(null)
  const soon = () => setMsg('Social sign-in is coming soon — use email/phone for now.')

  const providers = [
    { key: 'google', label: 'Continue with Google', icon: <GoogleIcon /> },
    { key: 'facebook', label: 'Continue with Facebook', icon: <FacebookIcon /> },
    { key: 'steam', label: 'Continue with Steam', icon: <SteamIcon /> },
  ]

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[#232a35]" />
        <span className="text-xs font-medium text-gray-500">OR</span>
        <span className="h-px flex-1 bg-[#232a35]" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {providers.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={soon}
            aria-label={p.label}
            title={p.label}
            className="h-12 rounded-xl bg-[#161b22] border border-[#232a35] flex items-center justify-center hover:border-[#8bc34a]/50 hover:bg-[#1b212b] transition"
          >
            {p.icon}
          </button>
        ))}
      </div>
      {msg && <p className="mt-3 text-center text-[11px] text-gray-500">{msg}</p>}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#1877F2" aria-hidden>
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.1 24 18.1 24 12.07z" />
    </svg>
  )
}

function SteamIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#c7d5e0" aria-hidden>
      <path d="M11.98 0C5.66 0 .48 4.88.03 11.09l6.44 2.66a3.4 3.4 0 0 1 1.92-.59l2.86-4.15v-.06a4.53 4.53 0 1 1 4.53 4.53h-.1l-4.09 2.92c0 .05.01.1.01.15a3.41 3.41 0 0 1-6.75.66L.28 15.2C1.71 20.27 6.41 24 11.98 24 18.61 24 24 18.62 24 12S18.61 0 11.98 0zM7.55 18.21l-1.47-.61a2.56 2.56 0 0 0 4.72-1.4 2.56 2.56 0 0 0-3.32-2.44l1.52.63a1.89 1.89 0 1 1-1.45 3.48v-.01zm11.7-8.13a3.02 3.02 0 1 0-6.04 0 3.02 3.02 0 0 0 6.04 0zm-5.29-.01a2.27 2.27 0 1 1 4.54 0 2.27 2.27 0 0 1-4.54 0z" />
    </svg>
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
