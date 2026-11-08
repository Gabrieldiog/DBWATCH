import { Client } from 'pg';

// LAB: incidente de "fechamento do mês", acontecendo de verdade no schema lab com quatro conexões reais.
// Nada é inventado: cada passo é um comando no PostgreSQL, e cada erro é o SQLSTATE que o banco devolveu
// correlationId liga o evento ao registro da auditoria daquela ação (o Monitor mostra o link)
export type Narrate = (severity: 'info' | 'medium' | 'high', titulo: string, texto: string, correlationId?: string) => Promise<void>;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sqlstate = (err: unknown) => (err as { code?: string }).code ?? 'XX000';
const DEBIT = 'UPDATE lab.accounts SET balance = balance - 10 WHERE id = 1';
const MOVE = (from: number, to: number) => [
  `UPDATE lab.accounts SET balance = balance - 5 WHERE id = ${from}`,
  `UPDATE lab.accounts SET balance = balance + 5 WHERE id = ${to}`,
];

async function transfer(c: Client, [first, second]: string[]) {
  await c.query('BEGIN');
  await c.query(first!);
  await c.query(second!);
  await c.query('COMMIT');
}

// hold: no passo a passo, o bot para ali até o próximo clique; só é chamado quando nenhuma transação está aberta
export async function runIncident(url: string, narrate: Narrate, hold: () => Promise<void> = async () => undefined): Promise<void> {
  const open = async (app: string) => {
    const c = new Client({ connectionString: url, application_name: `dbwatch-sim:${app}` });
    await c.connect();
    return c;
  };
  const clients = await Promise.all(['relatorio', 'caixa', 'carga', 'transferencia'].map(open));
  const [relatorio, caixa, carga, transferencia] = clients as [Client, Client, Client, Client];
  // O PostgreSQL encerra a sessão do relatório por conta própria; sem ouvinte, o erro derrubaria a API
  let killed = false;
  relatorio.on('error', () => void (killed = true));
  let running = true;
  const background = (async () => {
    while (running) await carga.query('SELECT count(*) FROM lab.accounts').then(() => pause(250));
  })();
  try {
    await narrate('info', 'Ato 2: incidente no fechamento do mês', 'Um caixa faz movimentações normais; o gráfico de commits sobe com elas.');
    await pause(4_000);
    await hold();

    await relatorio.query('BEGIN');
    await relatorio.query('UPDATE lab.accounts SET balance = balance WHERE id = 1');
    await narrate('medium', 'O relatório travou a conta da Ana', 'Abriu uma transação, alterou a linha e não confirmou: o lock fica preso.');
    await pause(3_000);

    // O caixa aceita esperar até 8 s por tentativa (o papel do lab desiste em 5 s): tempo de o monitor ver a espera
    await caixa.query("SET lock_timeout = '8s'");
    await narrate('medium', 'O caixa tenta debitar a conta da Ana', 'Fica esperando o lock do relatório. Veja o grafo: relatório → caixa.');
    for (let attempt = 1; ; attempt++) {
      try {
        await caixa.query(DEBIT);
        break;
      } catch (err) {
        await narrate('high', `O caixa desistiu (tentativa ${attempt})`, `Esperou 8 s e o banco cancelou com ${sqlstate(err)} (lock_timeout). Vai tentar de novo.`);
        await pause(1_000);
      }
    }
    // O aviso de erro da conexão do relatório chega no Node depois de o caixa já ter destravado: em vez de depender
    // dessa ordem, pergunta à própria conexão se o banco a encerrou
    killed ||= await relatorio.query('SELECT 1').then(() => false, () => true);
    await narrate(
      killed ? 'high' : 'info',
      'O banco destravou sozinho',
      killed
        ? 'O PostgreSQL encerrou a transação esquecida do relatório depois de 20 s parada (idle_in_transaction_session_timeout) e o débito do caixa passou.'
        : 'O lock do relatório foi liberado e o débito do caixa passou.',
    );
    await pause(3_000);
    await hold();

    await narrate('medium', 'Duas transferências cruzadas', 'Uma vai da Ana para o Bruno e a outra do Bruno para a Ana, ao mesmo tempo.');
    const [ab, ba] = [MOVE(1, 2), MOVE(2, 1)];
    // Cada uma trava a primeira conta; só então as duas pedem a conta da outra: o ciclo é garantido
    for (const [c, sql] of [[caixa, ab[0]], [transferencia, ba[0]]] as const) {
      await c.query('BEGIN');
      await c.query(sql!);
    }
    const results = await Promise.allSettled([caixa.query(ab[1]!), pause(200).then(() => transferencia.query(ba[1]!))]);
    const victim = results.findIndex((r) => r.status === 'rejected');
    const [loser, winner] = victim === 0 ? [caixa, transferencia] : [transferencia, caixa];
    await winner.query('COMMIT');
    await loser.query('ROLLBACK');
    if (victim >= 0) {
      const reason = (results[victim] as PromiseRejectedResult).reason;
      await narrate('high', 'Deadlock: o PostgreSQL escolheu uma vítima', `Erro ${sqlstate(reason)}: uma transferência foi desfeita e será repetida.`);
      await transfer(loser, victim === 0 ? ab : ba);
      await narrate('info', 'A transferência derrubada foi repetida', 'Tentou de novo do zero e confirmou: é assim que a aplicação deve tratar o 40P01.');
      await hold();
    }
    const { rows } = await caixa.query<{ total: string }>('SELECT sum(balance)::text AS total FROM lab.accounts');
    await narrate('info', 'Incidente resolvido', `As duas transferências terminaram e nenhum centavo sumiu: total das contas ${rows[0]!.total}.`);
    await hold();
  } finally {
    running = false;
    await background.catch(() => undefined);
    await Promise.all([relatorio, caixa, carga, transferencia].map((c) => c.end().catch(() => undefined)));
  }
}
