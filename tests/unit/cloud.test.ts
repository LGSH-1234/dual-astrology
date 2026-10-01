import { describe, it, expect, vi } from 'vitest';
import { cloudHandler, type CloudDependencies } from '../../server/cloud';
import { buildSnapshot, westernSummary } from '../../src/lib/astro/snapshot';

const snapshot = buildSnapshot('me', { date: '1995-06-15', time: '12:30', timeKnown: true, cityId: 'hangzhou', gender: '女' });
const body = { mode: 'western', profileId: 'me', question: '我适合跳槽吗？', context: { chartSummary: westernSummary(snapshot) } };
const create = (overrides: Partial<CloudDependencies> = {}) => cloudHandler({
  allowedOrigins: ['https://lgsh-1234.github.io'], publishableKey: 'public-test',
  authenticate: async (token) => token === 'valid-session' ? 'user-a' : null,
  takeQuota: async () => true, ai: null, ...overrides,
});
const request = (value: unknown = body, headers: Record<string, string> = {}) => new Request('https://example.supabase.co/functions/v1/dual-astrology-api/interpret', {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'public-test', Origin: 'https://lgsh-1234.github.io', ...headers }, body: JSON.stringify(value),
});

describe('线上问答', () => {
  it('游客获得演示回答和正确的跨域响应', async () => {
    const result = await create()(request());
    expect(result.status).toBe(200);
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://lgsh-1234.github.io');
    expect(await result.json()).toMatchObject({ provider: 'mock', sourceMode: 'western' });
  });
  it('阻止其他来源、无效凭据与非法上下文', async () => {
    expect((await create()(request(body, { Origin: 'https://other.example' }))).status).toBe(403);
    expect((await create()(request(body, { apikey: 'wrong' }))).status).toBe(401);
    expect((await create()(request(body, { Authorization: 'Bearer invalid' }))).status).toBe(401);
    expect((await create()(request({ mode: 'western' }))).status).toBe(400);
  });
  it('匿名请求不会调用付费服务；登录请求使用已验证的用户限额', async () => {
    const interpret = vi.fn(async () => ({ answer: '线上解读', themes: [], sourceMode: 'western' as const, provider: 'deepseek' as const }));
    const takeQuota = vi.fn(async () => true);
    const handler = create({ ai: { interpret }, takeQuota });
    await handler(request());
    expect(interpret).not.toHaveBeenCalled();
    const result = await handler(request(body, { Authorization: 'Bearer valid-session' }));
    expect(takeQuota).toHaveBeenLastCalledWith('user-a');
    expect((await result.json()).answer).toBe('线上解读');
  });
  it('限额与故障会返回明确状态', async () => {
    expect((await create({ takeQuota: async () => false })(request())).status).toBe(429);
    const result = await create({ ai: { interpret: async () => { throw new Error('upstream unavailable'); } } })(request(body, { Authorization: 'Bearer valid-session' }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ provider: 'mock', notice: expect.stringContaining('演示') });
    expect((await create({ takeQuota: async () => { throw new Error('database offline'); } })(request())).status).toBe(503);
  });
});
