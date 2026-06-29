import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function sanitizeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/me'
  return raw
}

// The Flutterwave payment link redirects the customer here after they pay,
// appending ?status=&tx_ref=&transaction_id=. Crediting happens out-of-band in
// the webhook, so this route only normalizes the status into ?flw= and bounces
// the user back to the app (which then re-fetches the fresh balance).
export async function GET(request: Request) {
  const url = new URL(request.url)
  const returnPath = sanitizeReturnPath(url.searchParams.get('returnPath'))
  const status = (url.searchParams.get('status') ?? '').toLowerCase()
  const flw =
    status === 'successful' || status === 'completed' ? 'success' : status || 'failed'

  const target = new URL(returnPath, url)
  target.searchParams.set('flw', flw)
  return NextResponse.redirect(target, 303)
}
