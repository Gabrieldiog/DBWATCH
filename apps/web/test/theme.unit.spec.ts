import { describe, expect, it } from 'vitest';
import { parseTheme, themeInitScript, THEME_KEY } from '../src/lib/theme';

describe('parseTheme (unitário)', () => {
  it('aceita só os temas conhecidos e cai no do sistema para o resto', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('system')).toBe('system');
    for (const junk of [null, undefined, '', 'DARK', 'roxo', 42, '<script>']) expect(parseTheme(junk)).toBe('system');
  });
});

describe('themeInitScript (unitário)', () => {
  const run = (stored: string | null, throws = false) => {
    const dataset: Record<string, string> = {};
    const localStorage = {
      getItem: (key: string) => {
        if (throws) throw new Error('bloqueado');
        return key === THEME_KEY ? stored : null;
      },
    };
    new Function('localStorage', 'document', themeInitScript)(localStorage, { documentElement: { dataset } });
    return dataset.theme;
  };

  it('aplica claro ou escuro salvos antes da primeira pintura', () => {
    expect(run('dark')).toBe('dark');
    expect(run('light')).toBe('light');
  });

  it('ignora valor desconhecido e não quebra com armazenamento bloqueado', () => {
    expect(run('roxo')).toBeUndefined();
    expect(run(null)).toBeUndefined();
    expect(run('dark', true)).toBeUndefined();
  });
});
