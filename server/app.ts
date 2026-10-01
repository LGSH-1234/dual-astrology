// 解读服务：POST /api/interpret，GET /api/status。
// 默认 mock；INTERPRETATION_PROVIDER=deepseek 且配置了 DEEPSEEK_API_KEY 时调用 DeepSeek，失败自动降级为 mock。
import { Hono } from 'hono';
import { MockInterpretationProvider } from '../src/lib/ai/mock';
import { validateRequest } from '../src/lib/ai/validate';
import { DeepSeekInterpretationProvider } from './deepseek';
import type { InterpretationProvider } from '../src/lib/types';
import { createAuth, type AuthOptions } from './auth';
import { clientIp, RateLimiter, securityHeaders } from './net';
import { existsSync } from 'node:fs';
import { serveStatic } from '@hono/node-server/serve-static';

export interface AppEnv {
  INTERPRETATION_PROVIDER?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL?: string;
  /** 账号数据文件；不传则仅内存（测试）。 */
  DATA_FILE?: string;
  /** 强制 Secure Cookie；不设时按请求是否为 HTTPS 自动判断。 */
  SECURE_COOKIE?: boolean;
  /** 部署在反向代理（Nginx/Caddy 等）后面时为 true，才信任 X-Forwarded-*。 */
  TRUST_PROXY?: boolean;
  /** 站点地址，用于生成重置密码链接。 */
  APP_URL?: string;
  /** 前端构建产物目录（相对当前工作目录），存在 index.html 时由本服务一并提供页面。 */
  STATIC_DIR?: string;
  /** 本地测试用：重置链接写入的文件。 */
  RESET_OUTBOX?: string;
  sendResetLink?: AuthOptions['sendResetLink'];
  fetchImpl?: typeof fetch;
}

const WINDOW_MS = 5 * 60 * 1000;
const LIMIT = 30;
const MAX_BODY = 16 * 1024;

export function createApp(env: AppEnv) {
  const app = new Hono();
  const mock = new MockInterpretationProvider();
  const wantDeepSeek = env.INTERPRETATION_PROVIDER === 'deepseek';
  const configured = wantDeepSeek && !!env.DEEPSEEK_API_KEY;
  const deepseek: InterpretationProvider | null = configured
    ? new DeepSeekInterpretationProvider({ apiKey: env.DEEPSEEK_API_KEY!, model: env.DEEPSEEK_MODEL, fetchImpl: env.fetchImpl })
    : null;
  const trust = !!env.TRUST_PROXY;
  const hits = new RateLimiter(WINDOW_MS, LIMIT);
  const auth = createAuth({
    dataFile: env.DATA_FILE,
    secureCookie: env.SECURE_COOKIE || undefined,
    trustProxy: trust,
    appUrl: env.APP_URL,
    sendResetLink: env.sendResetLink,
    resetOutbox: env.RESET_OUTBOX,
  });
  const isHttps = (c: { req: { url: string; header: (k: string) => string | undefined } }) =>
    new URL(c.req.url).protocol === 'https:' || (trust && c.req.header('x-forwarded-proto')?.split(',')[0].trim() === 'https');
  app.use('*', securityHeaders({ https: isHttps }));
  app.route('/', auth.routes);

  app.get('/api/status', (c) =>
    c.json({
      provider: deepseek ? 'deepseek' : 'mock',
      requested: wantDeepSeek ? 'deepseek' : 'mock',
      deepseekConfigured: configured,
      message: deepseek ? '解读功能已就绪。' : '当前使用演示解读。',
    }));

  app.post('/api/interpret', async (c) => {
    if (!hits.take(clientIp(c, trust))) return c.json({ error: '提问太频繁了，请稍后再试。' }, 429);

    if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return c.json({ error: '需要 JSON 请求' }, 415);
    }
    const len = Number(c.req.header('content-length') ?? 0);
    if (len > MAX_BODY) return c.json({ error: '请求过大' }, 413);
    const text = await c.req.text();
    if (text.length > MAX_BODY) return c.json({ error: '请求过大' }, 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return c.json({ error: '请求体不是合法 JSON' }, 400); }
    const v = validateRequest(body);
    if (!v.ok) return c.json({ error: v.error }, 400);

    // 真实 AI 只对登录用户开放，避免密钥被匿名刷用量；游客与未登录请求走演示解读。
    if (deepseek && !auth.currentUser(c)) {
      const r = await mock.interpret(v.value);
      return c.json({ ...r, notice: '登录后可使用 AI 解读，当前为演示解读。' });
    }
    if (deepseek) {
      try {
        return c.json(await deepseek.interpret(v.value));
      } catch (e) {
        console.warn('[interpret] DeepSeek 失败，降级为 mock：', (e as Error).message);
        const r = await mock.interpret(v.value);
        return c.json({ ...r, notice: 'AI 服务暂时不可用，已切换为演示解读。' });
      }
    }
    return c.json(await mock.interpret(v.value));
  });

  app.all('/api/*', (c) => c.json({ error: '接口不存在' }, 404));

  // 一键启动：同一个端口同时提供页面和接口（同源，Cookie 无需跨域）。
  const dir = env.STATIC_DIR?.replace(/\/+$/, '');
  if (dir && existsSync(`${dir}/index.html`)) {
    app.use('/*', serveStatic({ root: dir }));
    app.get('*', serveStatic({ path: `${dir}/index.html` }));
  }

  return app;
}
