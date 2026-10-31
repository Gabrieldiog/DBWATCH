'use client';

import { useEffect, useState } from 'react';
import { parseTheme, THEME_KEY, THEME_LABEL, THEMES, type Theme } from '../lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    try {
      setTheme(parseTheme(localStorage.getItem(THEME_KEY)));
    } catch {
      setTheme('system');
    }
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Navegação privada pode bloquear o armazenamento; o tema vale só nesta visita
    }
  }

  return (
    <div className="segmented" role="group" aria-label="Tema">
      {THEMES.map((option) => (
        <button key={option} type="button" aria-pressed={theme === option} onClick={() => choose(option)}>
          {THEME_LABEL[option]}
        </button>
      ))}
    </div>
  );
}
