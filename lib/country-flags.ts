/**
 * Country name → emoji flag map.
 *
 * Match cards and bet legs use match.country (a free-form string set by the
 * Odds API mapping or by custom matches). This is a defensive lookup — if
 * a country isn't in the map we return a generic globe so we never render
 * a broken / missing-glyph box.
 */

const FLAGS: Record<string, string> = {
  argentina: '🇦🇷',
  australia: '🇦🇺',
  austria: '🇦🇹',
  belgium: '🇧🇪',
  brazil: '🇧🇷',
  chile: '🇨🇱',
  china: '🇨🇳',
  denmark: '🇩🇰',
  england: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  europe: '🇪🇺',
  finland: '🇫🇮',
  france: '🇫🇷',
  germany: '🇩🇪',
  greece: '🇬🇷',
  international: '🌍',
  italy: '🇮🇹',
  japan: '🇯🇵',
  mexico: '🇲🇽',
  netherlands: '🇳🇱',
  norway: '🇳🇴',
  poland: '🇵🇱',
  portugal: '🇵🇹',
  scotland: '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  'south america': '🌎',
  'south korea': '🇰🇷',
  spain: '🇪🇸',
  sweden: '🇸🇪',
  switzerland: '🇨🇭',
  turkey: '🇹🇷',
  usa: '🇺🇸',
  'united states': '🇺🇸',
  'united kingdom': '🇬🇧',
  uk: '🇬🇧',
}

export function getCountryFlag(country: string | undefined | null): string {
  if (!country) return '🌍'
  return FLAGS[country.trim().toLowerCase()] ?? '🌍'
}
