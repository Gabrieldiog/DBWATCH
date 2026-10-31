export const THEME_KEY = 'dbwatch-theme';
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABEL: Record<Theme, string> = { system: 'Sistema', light: 'Claro', dark: 'Escuro' };

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : 'system';
}

// Roda antes da primeira pintura: sem isso a página pisca no tema errado ao carregar
export const themeInitScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
