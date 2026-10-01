import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/app';
import { passwordStrength, validateEmail, validatePassword } from '../../src/lib/authRules';

type App = ReturnType<typeof createApp>;
const json = (app: App, path: string, body: unknown, cookie?: string, method = 'POST') =>
  app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0];
const tick = () => new Promise((r) => setTimeout(r, 20));
const me = async (app: App, cookie?: string) =>
  (await (await app.request('/api/auth/me', { headers: cookie ? { Cookie: cookie } : {} })).json()).user;

describe('账号规则', () => {
  it('邮箱与密码校验', () => {
    expect(validateEmail('')).toBeTruthy();
    expect(validateEmail('a@b')).toBeTruthy();
    expect(validateEmail(' A@Example.com ')).toBeNull();
    expect(validatePassword('short1')).toContain('8');
    expect(validatePassword('abcdefgh')).toContain('字母和数字');
    expect(validatePassword('abcd1234')).toBeNull();
    expect(passwordStrength('abcd1234')).toBeLessThan(passwordStrength('Abcd1234!xyzQ'));
  });
});

describe('账号服务', () => {
  it('注册 → 会话 Cookie → me → 登出', async () => {
    const app = createApp({});
    const r = await json(app, '/api/auth/register', { email: 'User@Example.com', password: 'abcd1234' });
    expect(r.status).toBe(201);
    const setCookie = r.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const body = await r.json();
    expect(body.user.email).toBe('user@example.com');
    expect(JSON.stringify(body)).not.toMatch(/hash|salt/);
    const c = cookieOf(r);
    expect((await me(app, c)).email).toBe('user@example.com');
    expect(await me(app)).toBeNull();
    await app.request('/api/auth/logout', { method: 'POST', headers: { Cookie: c } });
    expect(await me(app, c)).toBeNull();
  });

  it('重复注册 409，弱密码 400，非 JSON 415', async () => {
    const app = createApp({});
    await json(app, '/api/auth/register', { email: 'a@example.com', password: 'abcd1234' });
    expect((await json(app, '/api/auth/register', { email: 'A@example.com', password: 'abcd1234' })).status).toBe(409);
    expect((await json(app, '/api/auth/register', { email: 'b@example.com', password: 'abcdefgh' })).status).toBe(400);
    const form = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'email=a@example.com&password=abcd1234',
    });
    expect(form.status).toBe(415);
  });

  it('同邮箱并发注册只允许一个请求成功', async () => {
    const app = createApp({});
    const results = await Promise.all(Array.from({ length: 3 }, () => json(app, '/api/auth/register', { email: 'race@example.com', password: 'abcd1234' })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
  });

  it('登录：错误密码 401，连续失败 429', async () => {
    const app = createApp({});
    await json(app, '/api/auth/register', { email: 'a@example.com', password: 'abcd1234' });
    const ok = await json(app, '/api/auth/login', { email: 'a@example.com', password: 'abcd1234' });
    expect(ok.status).toBe(200);
    expect(cookieOf(ok)).toMatch(/^dio_session=/);
    // 未知邮箱与错误密码返回同一提示
    const unknown = await (await json(app, '/api/auth/login', { email: 'x@example.com', password: 'abcd1234' })).json();
    const wrong = await json(app, '/api/auth/login', { email: 'a@example.com', password: 'wrong999' });
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error).toBe(unknown.error);
    let last = 0;
    for (let i = 0; i < 5; i++) last = (await json(app, '/api/auth/login', { email: 'a@example.com', password: 'wrong999' })).status;
    expect(last).toBe(429);
    // 被锁定期间正确密码也不放行
    expect((await json(app, '/api/auth/login', { email: 'a@example.com', password: 'abcd1234' })).status).toBe(429);
  });

  it('/api/state 需登录，按账号隔离', async () => {
    const app = createApp({});
    expect((await app.request('/api/state')).status).toBe(401);
    const a = cookieOf(await json(app, '/api/auth/register', { email: 'a@example.com', password: 'abcd1234' }));
    const b = cookieOf(await json(app, '/api/auth/register', { email: 'b@example.com', password: 'abcd1234' }));
    expect((await json(app, '/api/state', { state: [] }, a, 'PUT')).status).toBe(400);
    expect((await json(app, '/api/state', { state: { mode: 'ziwei' } }, a, 'PUT')).status).toBe(200);
    const get = async (c: string) => (await (await app.request('/api/state', { headers: { Cookie: c } })).json()).state;
    expect(await get(a)).toEqual({ mode: 'ziwei' });
    expect(await get(b)).toBeNull();
  });

  it('数据文件持久化：重启后仍可登录，文件里不含明文密码', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dio-auth-'));
    const file = join(dir, 'users.json');
    try {
      const app1 = createApp({ DATA_FILE: file });
      await json(app1, '/api/auth/register', { email: 'p@example.com', password: 'secret123' });
      expect(readFileSync(file, 'utf8')).not.toContain('secret123');
      const app2 = createApp({ DATA_FILE: file });
      expect((await json(app2, '/api/auth/login', { email: 'p@example.com', password: 'secret123' })).status).toBe(200);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('SQLite 持久化：重启后仍可登录，库里不含明文密码', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dio-sqlite-'));
    const file = join(dir, 'dio.sqlite');
    try {
      const app1 = createApp({ DATA_FILE: file });
      const c = cookieOf(await json(app1, '/api/auth/register', { email: 'q@example.com', password: 'secret123' }));
      await json(app1, '/api/state', { state: { mode: 'western' } }, c, 'PUT');
      expect(readFileSync(file).toString('latin1')).not.toContain('secret123');
      const app2 = createApp({ DATA_FILE: file });
      expect((await me(app2, c)).email).toBe('q@example.com');
      const st = await (await app2.request('/api/state', { headers: { Cookie: c } })).json();
      expect(st.state).toEqual({ mode: 'western' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('找回 / 修改密码', () => {
  const setup = () => {
    const links: string[] = [];
    const app = createApp({ APP_URL: 'https://dio.example.com/', sendResetLink: (_e, l) => { links.push(l); } });
    return { app, links };
  };
  const tokenOf = (link: string) => new URL(link.replace('#/', '')).searchParams.get('token')!;

  it('忘记密码 → 重置 → 旧会话失效、旧密码失效、令牌一次性', async () => {
    const { app, links } = setup();
    const old = cookieOf(await json(app, '/api/auth/register', { email: 'r@example.com', password: 'abcd1234' }));
    // 未注册邮箱返回同样的结果，但不发链接
    const unknown = await json(app, '/api/auth/forgot', { email: 'nobody@example.com' });
    expect(unknown.status).toBe(200);
    await tick();
    expect(links).toHaveLength(0);
    const r = await json(app, '/api/auth/forgot', { email: 'R@example.com' });
    expect(await r.json()).toEqual(await (await json(app, '/api/auth/forgot', { email: 'nobody2@example.com' })).json());
    await tick();
    expect(links).toHaveLength(1);
    expect(links[0]).toMatch(/^https:\/\/dio\.example\.com\/#\/reset\?token=[\w-]{40,}$/);
    const token = tokenOf(links[0]);
    expect((await json(app, '/api/auth/reset', { token, password: 'short' })).status).toBe(400);
    const ok = await json(app, '/api/auth/reset', { token, password: 'newpass99' });
    expect(ok.status).toBe(200);
    const fresh = cookieOf(ok);
    expect((await me(app, fresh)).email).toBe('r@example.com');
    expect(await me(app, old)).toBeNull();
    expect((await json(app, '/api/auth/reset', { token, password: 'again999' })).status).toBe(400);
    expect((await json(app, '/api/auth/login', { email: 'r@example.com', password: 'abcd1234' })).status).toBe(401);
    expect((await json(app, '/api/auth/login', { email: 'r@example.com', password: 'newpass99' })).status).toBe(200);
    expect((await json(app, '/api/auth/reset', { token: 'bogus', password: 'newpass99' })).status).toBe(400);
  });

  it('同一邮箱每小时最多发 3 封', async () => {
    const { app, links } = setup();
    await json(app, '/api/auth/register', { email: 's@example.com', password: 'abcd1234' });
    for (let i = 0; i < 5; i++) expect((await json(app, '/api/auth/forgot', { email: 's@example.com' })).status).toBe(200);
    await tick();
    expect(links).toHaveLength(3);
  });

  it('未配置 APP_URL 时不信任外部 Host / Origin 生成链接', async () => {
    const links: string[] = [];
    const app = createApp({ sendResetLink: (_e, l) => { links.push(l); } });
    await json(app, '/api/auth/register', { email: 'h@example.com', password: 'abcd1234' });
    const send = (url: string, origin?: string) => app.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify({ email: 'h@example.com' }),
    });
    expect((await send('http://evil.example/api/auth/forgot')).status).toBe(200);
    expect((await send('http://evil.example/api/auth/forgot', 'http://evil.example')).status).toBe(200);
    await tick();
    expect(links).toHaveLength(0);
    await send('http://evil.example/api/auth/forgot', 'http://localhost:5173');
    await tick();
    expect(links[0]).toMatch(/^http:\/\/localhost:5173\/#\/reset\?token=/);
  });

  it('修改密码：需登录、校验旧密码、踢掉其他会话', async () => {
    const { app } = setup();
    const a = cookieOf(await json(app, '/api/auth/register', { email: 't@example.com', password: 'abcd1234' }));
    const b = cookieOf(await json(app, '/api/auth/login', { email: 't@example.com', password: 'abcd1234' }));
    expect((await json(app, '/api/auth/password', { currentPassword: 'abcd1234', newPassword: 'zzzz9999' })).status).toBe(401);
    expect((await json(app, '/api/auth/password', { currentPassword: 'wrong999', newPassword: 'zzzz9999' }, a)).status).toBe(400);
    expect((await json(app, '/api/auth/password', { currentPassword: 'abcd1234', newPassword: 'weak' }, a)).status).toBe(400);
    expect((await json(app, '/api/auth/password', { currentPassword: 'abcd1234', newPassword: 'zzzz9999' }, a)).status).toBe(200);
    expect((await me(app, a)).email).toBe('t@example.com');
    expect(await me(app, b)).toBeNull();
    expect((await json(app, '/api/auth/login', { email: 't@example.com', password: 'zzzz9999' })).status).toBe(200);
  });
});

describe('部署安全', () => {
  it('安全响应头与 API 不缓存', async () => {
    const r = await createApp({}).request('/api/auth/me');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('strict-transport-security')).toBeNull();
  });

  it('HTTPS 请求自动 Secure Cookie + HSTS；代理头仅在 TRUST_PROXY 时生效', async () => {
    const body = JSON.stringify({ email: 'h@example.com', password: 'abcd1234' });
    const headers = { 'Content-Type': 'application/json' };
    const https = await createApp({}).request('https://dio.example.com/api/auth/register', { method: 'POST', headers, body });
    expect(https.headers.get('set-cookie')).toMatch(/Secure/);
    expect(https.headers.get('strict-transport-security')).toMatch(/max-age/);
    const fwd = { ...headers, 'X-Forwarded-Proto': 'https' };
    const untrusted = await createApp({}).request('/api/auth/register', { method: 'POST', headers: fwd, body });
    expect(untrusted.headers.get('set-cookie')).not.toMatch(/Secure/);
    const trusted = await createApp({ TRUST_PROXY: true }).request('/api/auth/register', { method: 'POST', headers: fwd, body });
    expect(trusted.headers.get('set-cookie')).toMatch(/Secure/);
  });

  it('伪造 X-Forwarded-For 绕不过登录限流', async () => {
    const app = createApp({});
    await json(app, '/api/auth/register', { email: 'x@example.com', password: 'abcd1234' });
    let last = 0;
    for (let i = 0; i < 7; i++) {
      const r = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.0.0.${i}` },
        body: JSON.stringify({ email: 'x@example.com', password: 'wrong999' }),
      });
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it('TRUST_PROXY 时取 X-Forwarded-For 最右一项（左边可被客户端伪造）', async () => {
    const app = createApp({ TRUST_PROXY: true });
    await json(app, '/api/auth/register', { email: 'y@example.com', password: 'abcd1234' });
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `6.6.6.${i}, 203.0.113.9` },
        body: JSON.stringify({ email: 'y@example.com', password: 'wrong999' }),
      })).status;
    }
    expect(last).toBe(429);
  });

  it('未知接口 404 JSON', async () => {
    const r = await createApp({}).request('/api/nope');
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBeTruthy();
  });
});
