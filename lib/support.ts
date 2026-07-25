/**
 * Customer-service contact URL. Set NEXT_PUBLIC_TELEGRAM_SUPPORT_HANDLE in
 * .env.local to override the default handle. The variable is build-time
 * inlined by Next, so changes require a redeploy.
 */
const RAW_HANDLE = process.env.NEXT_PUBLIC_TELEGRAM_SUPPORT_HANDLE ?? 'Betfus'

// Strip a leading "@" or whole URL in case someone pasted the wrong shape into the env var.
function cleanHandle(raw: string): string {
  const trimmed = raw.trim().replace(/^@+/, '')
  const m = trimmed.match(/t\.me\/([^/?#]+)/i)
  return (m ? m[1] : trimmed) || 'Betfus'
}

export const SUPPORT_TELEGRAM_HANDLE = cleanHandle(RAW_HANDLE)
export const SUPPORT_TELEGRAM_URL = `https://t.me/${SUPPORT_TELEGRAM_HANDLE}`
