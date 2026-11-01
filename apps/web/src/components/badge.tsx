import type { Tone } from '../lib/pam';

// A cor nunca está sozinha: o texto do estado vai junto, para leitor de tela e daltonismo
export function Badge({
  entry,
  fallback,
}: {
  entry: [string, Tone] | undefined;
  fallback: string;
}) {
  const [label, tone] = entry ?? [fallback, 'muted'];
  return <span className={`badge badge-${tone}`}>{label}</span>;
}
