// LAB: corrida de aprovação. Bruno e Carla aprovam o mesmo pedido ao mesmo tempo, rodada após rodada.
// O esperado é sempre um 200 e um 409, e uma concessão só por pedido. Depois, uma carga leve de leitura na fila.
// Uso: pnpm --silent db:seed:json | tail -1 > demo.json && node infra/carga/aprovacao-concorrente.mjs demo.json [rodadas] [url]
import { readFileSync } from 'node:fs';

const [file, rounds = '30', base = 'http://localhost:3000'] = process.argv.slice(2);
if (!file) throw new Error('Informe o JSON do pnpm db:seed:json');
const users = JSON.parse(readFileSync(file, 'utf8'));
const origin = 'http://localhost:3000';

async function session(role, nth = 0) {
  const u = users.filter((x) => x.role === role)[nth];
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: u.password }),
  });
  if (res.status !== 204) throw new Error(`Login de ${u.email} recusado (${res.status})`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const call = (path, body) =>
    fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', headers: { origin, cookie, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return Object.assign(call, { email: u.email });
}
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))].toFixed(0);
const timed = async (fn) => { const t = performance.now(); const r = await fn(); return [r, performance.now() - t]; };

const [diego, bruno, carla] = await Promise.all([session('REQUESTER'), session('APPROVER', 0), session('APPROVER', 1)]);
const resource = (await (await diego('/resources')).json()).find((r) => r.sensitivity === 'LOW');
const live = async () => (await (await bruno('/grants/active')).json()).filter((g) => g.resource.id === resource.id && g.user.email === diego.email);
const tally = { umVenceu: 0, falhas: [] };
const approveMs = [];

for (let i = 1; i <= Number(rounds); i++) {
  // Ponto de partida limpo: sem pedido pendente nem concessão viva do Diego neste recurso
  for (const r of (await (await diego('/requests/mine')).json()).filter((r) => r.status === 'PENDING' && r.resource.id === resource.id))
    await diego(`/requests/${r.id}/cancel`, {});
  for (const g of await live()) await bruno(`/grants/${g.id}/revoke`, { reason: 'LAB: limpeza da corrida de aprovação' });
  const created = await diego('/requests', { resourceId: resource.id, accessLevel: 'READ', requestedMinutes: 5, justification: `LAB: corrida de aprovação, rodada ${i}` });
  if (created.status !== 201) throw new Error(`Pedido da rodada ${i} recusado (${created.status})`);
  const { id } = await created.json();
  const results = await Promise.all([bruno, carla].map((who) => timed(() => who(`/requests/${id}/approve`, {}))));
  results.forEach(([, t]) => approveMs.push(t));
  const codes = results.map(([r]) => r.status).sort().join(',');
  const grants = (await live()).length;
  if (codes === '200,409' && grants === 1) tally.umVenceu++;
  else tally.falhas.push(`rodada ${i}: respostas ${codes}, concessões vivas ${grants}`);
}

// Carga leve de leitura: 200 consultas à fila, 20 de cada vez
const readMs = [];
const errors = [];
for (let i = 0; i < 10; i++)
  await Promise.all(Array.from({ length: 20 }, () => timed(() => bruno('/requests/queue')).then(([r, t]) => (readMs.push(t), r.ok || errors.push(r.status)))));

console.log(`Corrida: ${tally.umVenceu}/${rounds} rodadas com um 200, um 409 e uma concessão só`);
for (const f of tally.falhas) console.log(`  FALHA ${f}`);
console.log(`Aprovar (concorrente): p50 ${pct(approveMs, 0.5)} ms, p95 ${pct(approveMs, 0.95)} ms`);
console.log(`Fila (200 leituras, 20 em paralelo): p50 ${pct(readMs, 0.5)} ms, p95 ${pct(readMs, 0.95)} ms, erros ${errors.length}`);
process.exitCode = tally.falhas.length || errors.length ? 1 : 0;
