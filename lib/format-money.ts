/**
 * Format a number as "1,234,567.89" — two decimals, thousands separators,
 * en-GB locale (matches the GHS convention).
 */
export function formatMoney(n: number): string {
  return n.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
