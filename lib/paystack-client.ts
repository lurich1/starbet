/**
 * Shared types for the Paystack inline checkout JS SDK.
 * Loaded from a CDN at runtime — we declare its shape here.
 */

export interface PaystackSuccess {
  reference: string
  status?: string
  trans?: string
  transaction?: string
  message?: string
}

export interface PaystackSetupConfig {
  key: string
  email: string
  /** Amount in the smallest currency unit (pesewa for GHS, kobo for NGN). */
  amount: number
  currency: string
  /** Unique reference. We always pass one so the server can verify it. */
  ref: string
  /** Optional invoice metadata sent to Paystack. */
  metadata?: Record<string, unknown>
  /** Cash channels and card support are enabled by default. */
  channels?: string[]
  callback: (response: PaystackSuccess) => void
  onClose: () => void
}

export interface PaystackHandler {
  openIframe: () => void
}

export interface PaystackSDK {
  setup: (config: PaystackSetupConfig) => PaystackHandler
}

declare global {
  interface Window {
    PaystackPop?: PaystackSDK
  }
}

export const PAYSTACK_SDK_SRC = 'https://js.paystack.co/v1/inline.js'

/** Convert a GHS amount (e.g. 200.50) to pesewas (20050) for Paystack. */
export function ghsToPesewas(amount: number): number {
  return Math.round(amount * 100)
}
