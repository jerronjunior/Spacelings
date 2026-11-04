// SPACELINGS design tokens. Every screen pulls colours, type and spacing from here.

export const colors = {
  bg: '#060B18',
  bg2: '#0B1426',
  card: '#111F35',
  cardGlass: 'rgba(17, 31, 53, 0.72)',
  cardGlassStrong: 'rgba(17, 31, 53, 0.92)',
  border: 'rgba(148, 163, 184, 0.14)',
  borderStrong: 'rgba(0, 212, 255, 0.35)',
  cyan: '#00D4FF',
  cyanSoft: 'rgba(0, 212, 255, 0.12)',
  blue: '#3478F6',
  blueSoft: 'rgba(52, 120, 246, 0.14)',
  purple: '#8B5CF6',
  purpleSoft: 'rgba(139, 92, 246, 0.15)',
  text: '#F5F8FF',
  text2: '#94A3B8',
  text3: '#64748B',
  // Status colours (used only for state, never for decoration)
  ok: '#34D399',
  okSoft: 'rgba(52, 211, 153, 0.14)',
  caution: '#FBBF24',
  cautionSoft: 'rgba(251, 191, 36, 0.14)',
  warning: '#FB7185',
  warningSoft: 'rgba(251, 113, 133, 0.15)',
};

// Data-provenance colours: a reading's source must always be visible.
export const sourceColors: Record<string, string> = {
  SIMULATED: colors.purple,
  MANUAL: colors.cyan,
  DEVICE: colors.ok,
  NASA: colors.blue,
};

export const severityColors: Record<string, { fg: string; bg: string }> = {
  info: { fg: colors.cyan, bg: colors.cyanSoft },
  caution: { fg: colors.caution, bg: colors.cautionSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
};

export const fonts = {
  display: 'SpaceGrotesk_600SemiBold',
  displayBold: 'SpaceGrotesk_700Bold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 };

export const breakpoints = { tablet: 720, desktop: 1100 };
