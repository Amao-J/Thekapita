/**
 * Pulled directly from apps/web/css/*.css (not invented) so mobile matches
 * the real brand, not an approximation:
 *   #00d084 — brand emerald (primary)      #008f5a — emerald, pressed/dark
 *   #121212 — ink / primary text            #718096 — muted text
 *   #e5e7eb — border/divider                #f8f9fa — surface
 *   #ff6b6b — danger/alert accent           #ffd93d — warning accent
 *
 * If the web palette changes, update here too — there is currently no
 * automated check that the two stay in sync (a real follow-up: extract
 * both from one JSON file at build time instead of maintaining two files
 * by hand).
 */
export const colors = {
  emerald: '#00d084',
  emeraldDark: '#008f5a',
  ink: '#121212',
  muted: '#718096',
  border: '#e5e7eb',
  surface: '#f8f9fa',
  white: '#ffffff',
  danger: '#ff6b6b',
  warning: '#ffd93d',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radii = { sm: 8, md: 12, lg: 16, pill: 999 };

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' },
  h2: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '400' },
};
