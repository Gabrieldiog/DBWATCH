import { expect, type APIRequestContext } from '@playwright/test';

export const origin = { origin: 'http://localhost:3000' };
type Req = { id: string; status: string; resource: { name: string } };

// O banco aceita um pedido pendente por pessoa e recurso: o teste cancela o que sobrou de outra execução
export async function cancelPending(api: APIRequestContext, resource: string): Promise<void> {
  const mine = (await (await api.get('/api/requests/mine')).json()) as Req[];
  for (const r of mine.filter((r) => r.status === 'PENDING' && r.resource.name === resource))
    await api.post(`/api/requests/${r.id}/cancel`, { headers: origin });
}

export async function pendingRequest(api: APIRequestContext, resource: string): Promise<string> {
  await cancelPending(api, resource);
  const resources = (await (await api.get('/api/resources')).json()) as { id: string; name: string }[];
  const res = await api.post('/api/requests', {
    headers: origin,
    data: {
      resourceId: resources.find((r) => r.name === resource)!.id,
      accessLevel: 'READ',
      requestedMinutes: 15,
      justification: 'Conferir os dados antes da vitrine de sexta',
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as Req).id;
}

export async function statusOf(api: APIRequestContext, id: string): Promise<string | undefined> {
  return ((await (await api.get('/api/requests/mine')).json()) as Req[]).find((r) => r.id === id)?.status;
}

// A EXCLUDE recusa duas concessões vivas da mesma pessoa no mesmo recurso: revoga as que sobraram
export async function revokeGrants(approver: APIRequestContext, email: string): Promise<void> {
  const active = (await (await approver.get('/api/grants/active')).json()) as { id: string; user: { email: string } }[];
  for (const g of active.filter((g) => g.user.email === email))
    await approver.post(`/api/grants/${g.id}/revoke`, { headers: origin, data: { reason: 'Limpeza do teste E2E' } });
}

// Pedido aprovado pela API: devolve a concessão criada na mesma transação da aprovação
export async function approvedGrant(requester: APIRequestContext, approver: APIRequestContext, resource: string): Promise<string> {
  const id = await pendingRequest(requester, resource);
  const res = await approver.post(`/api/requests/${id}/approve`, { headers: origin, data: {} });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { grant: { id: string } }).grant.id;
}
