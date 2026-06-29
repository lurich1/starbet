// Flutterwave integration via a hosted Payment Link.
//
// Customers pay on Flutterwave's hosted page (the link below, "customer enters
// amount"). We don't move money through the API — instead Flutterwave POSTs a
// webhook to /api/payments/flutterwave/webhook on every completed charge and we
// credit the matching user (by account email) there.
//
// Dashboard setup required:
//   1. Payment link → set its Redirect URL to
//        {APP_ORIGIN}/api/payments/flutterwave/callback?returnPath=/me
//   2. Settings → Webhooks → URL = {APP_ORIGIN}/api/payments/flutterwave/webhook
//      and a "Secret hash" that matches FLUTTERWAVE_WEBHOOK_SECRET.

const DEFAULT_PAYMENT_LINK = 'https://flutterwave.com/pay/cn9cbe4b2mxd'

/** The hosted payment-link URL customers are sent to. */
export function getPaymentLink(): string {
  return process.env.FLUTTERWAVE_PAYMENT_LINK?.trim() || DEFAULT_PAYMENT_LINK
}

/** Secret hash configured on the Flutterwave webhook (header `verif-hash`). */
export function getWebhookSecret(): string | null {
  return process.env.FLUTTERWAVE_WEBHOOK_SECRET?.trim() || null
}

/**
 * Validate the `verif-hash` header Flutterwave sends with every webhook. If no
 * secret is configured we refuse all webhooks (fail closed) so a missing env
 * var can never let unsigned requests credit wallets.
 */
export function isValidWebhookSignature(headerValue: string | null): boolean {
  const secret = getWebhookSecret()
  if (!secret) return false
  return headerValue === secret
}

export interface FlutterwaveWebhookCustomer {
  email?: string
  name?: string
  phone_number?: string
}

export interface FlutterwaveWebhookData {
  id?: number | string
  tx_ref?: string
  flw_ref?: string
  status?: string // 'successful' | 'failed' | ...
  amount?: number
  currency?: string
  customer?: FlutterwaveWebhookCustomer
}

export interface FlutterwaveWebhookPayload {
  event?: string // 'charge.completed' | 'charge.updated' | ...
  data?: FlutterwaveWebhookData
}

/** True once the gateway reports the money actually landed. */
export function isChargeSuccessful(status: string | undefined): boolean {
  const s = (status ?? '').toLowerCase()
  return s === 'successful' || s === 'succeeded' || s === 'success' || s === 'completed'
}
