/*
 * brand.js — design tokens from the Course Visual Style Guide.
 * The player's CSS lives in src/shell/styles.css; this exposes the palette in JS,
 * mainly the module ACCENT rotation used when assembling screens.
 */
const BRAND = {
  navy: '#1e3a8a',
  navyDark: '#0f172a',
  teal: '#14b8a6',
  orange: '#f97316',
  purple: '#8b5cf6',
  slate: '#334155',
  slateMuted: '#64748b',
  bgLight: '#eaf0fa',
  bgCard: '#ffffff',
  gradTeal: 'linear-gradient(135deg, #1e3a8a 0%, #14b8a6 100%)',
  gradPurple: 'linear-gradient(135deg, #1e3a8a 0%, #8b5cf6 100%)',
  fontBody: "'Inter', system-ui, -apple-system, sans-serif",
};

// Each module gets one accent, rotated in this order (per the style guide).
const ACCENTS = [BRAND.teal, BRAND.orange, BRAND.purple];

module.exports = { BRAND, ACCENTS };
