import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL('https://betfus.com'),
  title: 'Betfus | Sports Betting',
  description: 'Betfus — Live sports odds, real matches, smart betting.',
  applicationName: 'Betfus',
  icons: {
    icon: [
      { url: '/betfus-icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/betfus-icon.svg',
    apple: '/betfus-icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#0d1117',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
