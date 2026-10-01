import { describe, expect, it, vi } from 'vitest';
import { buildSnapshot, westernSummary, ziweiSummary } from '../../src/lib/astro/snapshot';
import { compatibility } from '../../src/lib/astro/compat';
import { detectTopic, mockInterpret } from '../../src/lib/ai/mock';
import { validateRequest } from '../../src/lib/ai/validate';
import { createApp } from '../../server/app';
import type { InterpretationRequest } from '../../src/lib/types';

const a = buildSnapshot('a', { date: '1995-06-15', time: '12:30', timeKnown: true, cityId: 'hangzhou', gender: '女' });
const b = buildSnapshot('b', { date: '1993-11-02', time: '08:10', timeKnown: true, cityId: 'beijing', gender: '男' });

const req = (mode: 'ziwei' | 'western', question = '我适合跳槽吗？'): InterpretationRequest => ({
  mode, question, profileId: 'a',
  context: { chartSummary: mode === 'ziwei' ? ziweiSummary(a) : westernSummary(a) },
});

describe('兼容性', () => {
  for (const mode of ['western', 'ziwei'] as const) {
    it(`${mode}：分数有界且有条目`, () => {
      const r = compatibility(mode, a, b, '我', '他');
      expect(r.mode).toBe(mode);
      expect(r.score).toBeGreaterThanOrEqual(5);
      expect(r.score).toBeLessThanOrEqual(98);
      expect(r.strengths.length + r.conflicts.length).toBeGreaterThan(0);
      expect(r.communication.length).toBeGreaterThan(0);
    });
  }
  it('两种模式结果不同', () => {
    expect(compatibility('western', a, b, '我', '他').strengths[0]?.title)
      .not.toBe(compatibility('ziwei', a, b, '我', '他').strengths[0]?.title);
  });
});

describe('Mock 解读', () => {
  it('主题识别', () => {
    expect(detectTopic('我什么时候能遇到桃花')).toBe('love');
    expect(detectTopic('要不要跳槽')).toBe('career');
    expect(detectTopic('今天运势如何')).toBe('timing');
    expect(detectTopic('随便聊聊')).toBe('general');
  });
  it('两种模式使用各自术语', () => {
    const w = mockInterpret(req('western'));
    const z = mockInterpret(req('ziwei'));
    expect(w.sourceMode).toBe('western');
    expect(w.answer).toMatch(/太阳|月亮|土星/);
    expect(z.answer).toMatch(/命宫|官禄宫/);
    expect(z.answer).not.toMatch(/上升/);
  });
  it('结果确定', () => {
    expect(mockInterpret(req('ziwei')).answer).toBe(mockInterpret(req('ziwei')).answer);
  });
});

describe('入参校验', () => {
  it('拒绝缺字段或模式不一致', () => {
    expect(validateRequest(null).ok).toBe(false);
    expect(validateRequest({ ...req('ziwei'), question: '' }).ok).toBe(false);
    expect(validateRequest({ ...req('ziwei'), mode: 'western' }).ok).toBe(false);
    expect(validateRequest({ ...req('ziwei'), question: 'x'.repeat(501) }).ok).toBe(false);
    expect(validateRequest(req('western')).ok).toBe(true);
    expect(validateRequest({ ...req('ziwei'), context: { chartSummary: { kind: 'ziwei' } } }).ok).toBe(false);
    expect(validateRequest({ ...req('western'), context: { chartSummary: { kind: 'western', sun: '白羊座', moon: '金牛座', rising: null, placements: [], aspects: [] } } }).ok).toBe(false);
    expect(validateRequest({ ...req('ziwei'), context: { ...req('ziwei').context, currentTransits: [1] } }).ok).toBe(false);
  });
});

describe('服务端', () => {
  const post = (app: ReturnType<typeof createApp>, body: unknown, cookie?: string) =>
    app.request('/api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
  // DeepSeek 只对登录用户开放：注册一个账号拿到会话 Cookie。
  const signIn = async (app: ReturnType<typeof createApp>) => {
    const r = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ai@example.com', password: 'abcd1234' }),
    });
    return (r.headers.get('set-cookie') ?? '').split(';')[0];
  };

  it('默认 mock，不需要密钥', async () => {
    const app = createApp({});
    const s = await (await app.request('/api/status')).json();
    expect(s.provider).toBe('mock');
    const r = await post(app, req('western'));
    expect(r.status).toBe(200);
    expect((await r.json()).provider).toBe('mock');
  });

  it('请求 deepseek 但没有密钥时回落 mock', async () => {
    const app = createApp({ INTERPRETATION_PROVIDER: 'deepseek' });
    const s = await (await app.request('/api/status')).json();
    expect(s.provider).toBe('mock');
    expect(s.deepseekConfigured).toBe(false);
    expect((await post(app, req('ziwei'))).status).toBe(200);
  });

  it('DeepSeek 正常返回', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ answer: '测试回答', themes: ['事业'], confidence: 'high' }) } }],
    }))) as unknown as typeof fetch;
    const app = createApp({ INTERPRETATION_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'k', fetchImpl });
    // 未登录：不调用 DeepSeek，返回演示解读并提示登录
    const anon = await (await post(app, req('ziwei'))).json();
    expect(anon.provider).toBe('mock');
    expect(anon.notice).toContain('登录');
    expect(fetchImpl).not.toHaveBeenCalled();
    const j = await (await post(app, req('ziwei'), await signIn(app))).json();
    expect(j).toMatchObject({ answer: '测试回答', provider: 'deepseek', sourceMode: 'ziwei' });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
  });

  it('DeepSeek 失败时降级并带提示', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad', { status: 500 })) as unknown as typeof fetch;
    const app = createApp({ INTERPRETATION_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'k', fetchImpl });
    const j = await (await post(app, req('western'), await signIn(app))).json();
    expect(fetchImpl).toHaveBeenCalled();
    expect(j.provider).toBe('mock');
    expect(j.notice).toContain('演示解读');
  });

  it('DeepSeek 返回非 JSON 时降级', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] }))) as unknown as typeof fetch;
    const app = createApp({ INTERPRETATION_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'k', fetchImpl });
    expect((await (await post(app, req('western'), await signIn(app))).json()).provider).toBe('mock');
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('非法请求返回 400，频率超限返回 429', async () => {
    const app = createApp({});
    expect((await post(app, { mode: 'x' })).status).toBe(400);
    const bad = await app.request('/api/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
    expect(bad.status).toBe(400);
    expect((await app.request('/api/interpret', { method: 'POST', body: '{}' })).status).toBe(415);
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await post(app, req('western'))).status;
    expect(last).toBe(429);
  });

  it('完整性不足的命盘上下文返回 400 而不是 500', async () => {
    const app = createApp({});
    const r = await post(app, { ...req('ziwei'), context: { chartSummary: { kind: 'ziwei' } } });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain('soulPalace');
    expect(mockInterpret({ ...req('western'), context: { chartSummary: { kind: 'western' } } } as unknown as InterpretationRequest).provider).toBe('mock');
  });
});
