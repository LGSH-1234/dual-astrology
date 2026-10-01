// 账号服务：邮箱 + 密码。
// - 密码：scrypt + 每用户随机盐，timingSafeEqual 比较；未知邮箱也做一次假计算，避免时间侧信道。
// - 会话：32 字节随机令牌放 httpOnly + SameSite=Lax Cookie；服务端只存 sha256(令牌)。HTTPS 下自动加 Secure。
// - 写请求要求 Content-Type: application/json（配合 SameSite 防 CSRF）。
// - 找回密码：一次性令牌（只存哈希，30 分钟过期），链接放在 URL 片段里，不会出现在服务器日志和 Referer 中。
//   未接入邮件服务时，链接打印到服务端控制台（可选写入 RESET_OUTBOX 文件，便于本地测试）。
import { Hono, type Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomBytes, scrypt, timingSafeEqual, createHash, randomUUID, type ScryptOptions } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { normalizeEmail, validateEmail, validatePassword } from '../src/lib/authRules';
import { openStore, type UserRec } from './store';
import { clientIp, RateLimiter } from './net';

export const SESSION_COOKIE = 'dio_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const MAX_AUTH_BODY = 4 * 1024;
export const MAX_STATE_BYTES = 512 * 1024;

export interface AuthOptions {
  /** 数据文件：.sqlite/.db 用 SQLite，.json 用 JSON；不传则仅内存（测试用）。 */
  dataFile?: string;
  /** 强制 Secure Cookie；不设时按请求是否为 HTTPS 自动判断。 */
  secureCookie?: boolean;
  /** 部署在反向代理后面时为 true，才信任 X-Forwarded-For / X-Forwarded-Proto。 */
  trustProxy?: boolean;
  /** 重置链接的站点地址，例如 https://example.com；不设时本地开发按请求来源推断。 */
  appUrl?: string;
  /** 发送重置链接；不传则打印到控制台。 */
  sendResetLink?: (email: string, link: string) => void | Promise<void>;
  /** 本地测试用：把重置链接追加写入这个文件。 */
  resetOutbox?: string;
}

export interface PublicUser { id: string; email: string; createdAt: number }

const KEYLEN = 64;
const DUMMY_SALT = randomBytes(16).toString('hex');

const SCRYPT: ScryptOptions = { N: 16384, r: 8, p: 1 };
/** 异步 scrypt（在线程池里算，不阻塞事件循环）。 */
function hashPassword(pw: string, saltHex: string): Promise<Buffer> {
  return new Promise((ok, no) => scrypt(pw, Buffer.from(saltHex, 'hex'), KEYLEN, SCRYPT, (e, k) => (e ? no(e) : ok(k))));
}
async function newHash(pw: string) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: (await hashPassword(pw, salt)).toString('hex') };
}
async function verify(pw: string, u: UserRec | null): Promise<boolean> {
  const actual = await hashPassword(pw.slice(0, 256), u?.salt ?? DUMMY_SALT);
  const expected = u ? Buffer.from(u.hash, 'hex') : Buffer.alloc(KEYLEN);
  return timingSafeEqual(actual, expected) && !!u;
}
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const pub = (u: UserRec): PublicUser => ({ id: u.id, email: u.email, createdAt: u.createdAt });
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function createAuth(opts: AuthOptions = {}) {
  const store = openStore(opts.dataFile);
  const trust = !!opts.trustProxy;
  const ip = (c: Context) => clientIp(c, trust);

  const loginFails = new RateLimiter(15 * 60 * 1000, 5);       // 同 IP + 邮箱
  const loginIp = new RateLimiter(10 * 60 * 1000, 60);         // 同 IP 的登录请求总数（每次都要算 scrypt）
  const emailFails = new RateLimiter(15 * 60 * 1000, 20);      // 同邮箱（防分布式猜密码）
  const registerHits = new RateLimiter(10 * 60 * 1000, 30);    // 同 IP
  const forgotIp = new RateLimiter(15 * 60 * 1000, 10);
  const forgotEmail = new RateLimiter(60 * 60 * 1000, 3);
  const resetHits = new RateLimiter(15 * 60 * 1000, 20);
  const changeFails = new RateLimiter(15 * 60 * 1000, 5);

  const isHttps = (c: Context) =>
    new URL(c.req.url).protocol === 'https:' || (trust && (c.req.header('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https');

  const startSession = (c: Context, user: UserRec) => {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    store.purgeExpired(now);
    const tokenHash = sha256(token);
    store.insertSession({ tokenHash, userId: user.id, exp: now + SESSION_TTL_MS });
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: opts.secureCookie ?? isHttps(c),
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    return tokenHash;
  };

  /** 当前会话；无会话或已过期返回 null。 */
  const session = (c: Context): { user: UserRec; tokenHash: string } | null => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token || token.length > 128) return null;
    const tokenHash = sha256(token);
    const s = store.findSession(tokenHash);
    if (!s || s.exp <= Date.now()) return null;
    const user = store.findUserById(s.userId);
    return user ? { user, tokenHash } : null;
  };
  const currentUser = (c: Context) => session(c)?.user ?? null;

  /** 读取并解析小体积 JSON；要求 application/json，防止跨站表单提交。 */
  const readJson = async (c: Context, max: number): Promise<{ ok: true; body: any } | { ok: false; res: Response }> => {
    if (!(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return { ok: false, res: c.json({ error: '需要 JSON 请求' }, 415) };
    }
    const len = Number(c.req.header('content-length') ?? 0);
    if (len > max) return { ok: false, res: c.json({ error: '请求过大' }, 413) };
    const text = await c.req.text();
    if (text.length > max) return { ok: false, res: c.json({ error: '请求过大' }, 413) };
    try {
      return { ok: true, body: JSON.parse(text) };
    } catch {
      return { ok: false, res: c.json({ error: '请求体不是合法 JSON' }, 400) };
    }
  };

  /**
   * 重置链接的站点地址。优先用 APP_URL；没配置时只接受本机地址（localhost / 127.0.0.1），
   * 不信任任意 Host / Origin 头，防止攻击者让链接指向自己的域名。返回 null 表示不生成链接。
   */
  const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
  const baseUrl = (c: Context): string | null => {
    if (opts.appUrl) return opts.appUrl.replace(/\/+$/, '');
    const origin = c.req.header('origin') ?? '';
    if (LOOPBACK.test(origin)) return origin;
    const self = new URL(c.req.url).origin;
    return LOOPBACK.test(self) ? self : null;
  };

  const deliver = async (email: string, link: string) => {
    if (opts.resetOutbox) {
      try { appendFileSync(opts.resetOutbox, `${JSON.stringify({ email, link, at: Date.now() })}\n`, { mode: 0o600 }); } catch { /* 忽略 */ }
    }
    if (opts.sendResetLink) return opts.sendResetLink(email, link);
    console.log(`[auth] 未配置邮件服务，重置密码链接（30 分钟内有效）：${email} → ${link}`);
  };

  const routes = new Hono();

  routes.post('/api/auth/register', async (c) => {
    if (!registerHits.check(ip(c))) return c.json({ error: '注册太频繁了，请稍后再试。' }, 429);
    const r = await readJson(c, MAX_AUTH_BODY);
    if (!r.ok) return r.res;
    const emailRaw = str(r.body?.email);
    const password = str(r.body?.password);
    const err = validateEmail(emailRaw) ?? validatePassword(password);
    if (err) return c.json({ error: err }, 400);
    registerHits.hit(ip(c));
    const email = normalizeEmail(emailRaw);
    if (store.findUserByEmail(email)) return c.json({ error: '该邮箱已注册，请直接登录。' }, 409);
    const user: UserRec = { id: randomUUID(), email, ...(await newHash(password)), createdAt: Date.now() };
    if (!store.insertUser(user)) return c.json({ error: '该邮箱已注册，请直接登录。' }, 409);
    startSession(c, user);
    return c.json({ user: pub(user) }, 201);
  });

  routes.post('/api/auth/login', async (c) => {
    const r = await readJson(c, MAX_AUTH_BODY);
    if (!r.ok) return r.res;
    const email = normalizeEmail(str(r.body?.email));
    const password = str(r.body?.password);
    if (!email || !password) return c.json({ error: '请输入邮箱和密码' }, 400);
    const key = `${ip(c)}|${email}`;
    if (!loginIp.take(ip(c)) || !loginFails.check(key) || !emailFails.check(email)) {
      return c.json({ error: '尝试次数过多，请 15 分钟后再试。' }, 429);
    }

    const user = store.findUserByEmail(email);
    if (!(await verify(password, user))) {
      loginFails.hit(key);
      emailFails.hit(email);
      return c.json({ error: '邮箱或密码不正确' }, 401);
    }
    loginFails.clear(key);
    startSession(c, user!);
    return c.json({ user: pub(user!) });
  });

  routes.post('/api/auth/logout', (c) => {
    const s = session(c);
    if (s) store.deleteSession(s.tokenHash);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  routes.get('/api/auth/me', (c) => {
    const u = currentUser(c);
    return c.json({ user: u ? pub(u) : null });
  });

  /** 登录状态下修改密码：校验旧密码，成功后让其他设备上的会话全部失效。 */
  routes.post('/api/auth/password', async (c) => {
    const s = session(c);
    if (!s) return c.json({ error: '登录已过期，请重新登录' }, 401);
    const r = await readJson(c, MAX_AUTH_BODY);
    if (!r.ok) return r.res;
    if (!changeFails.check(s.user.id)) return c.json({ error: '尝试次数过多，请 15 分钟后再试。' }, 429);
    const current = str(r.body?.currentPassword);
    const next = str(r.body?.newPassword);
    if (!(await verify(current, s.user))) {
      changeFails.hit(s.user.id);
      return c.json({ error: '当前密码不正确' }, 400);
    }
    const err = validatePassword(next);
    if (err) return c.json({ error: err }, 400);
    if (current === next) return c.json({ error: '新密码不能与当前密码相同' }, 400);
    const h = await newHash(next);
    store.updatePassword(s.user.id, h.salt, h.hash);
    store.deleteUserSessions(s.user.id, s.tokenHash);
    store.deleteUserResets(s.user.id);
    changeFails.clear(s.user.id);
    return c.json({ ok: true });
  });

  /** 申请重置：无论邮箱是否存在都返回同样的结果，避免探测账号。 */
  routes.post('/api/auth/forgot', async (c) => {
    const r = await readJson(c, MAX_AUTH_BODY);
    if (!r.ok) return r.res;
    const emailRaw = str(r.body?.email);
    const err = validateEmail(emailRaw);
    if (err) return c.json({ error: err }, 400);
    const email = normalizeEmail(emailRaw);
    if (!forgotIp.check(ip(c))) return c.json({ error: '请求太频繁了，请稍后再试。' }, 429);
    forgotIp.hit(ip(c));
    const delivery = opts.sendResetLink ? 'email' : 'console';
    const user = store.findUserByEmail(email);
    if (user && forgotEmail.check(email)) {
      forgotEmail.hit(email);
      const base = baseUrl(c);
      if (!base) {
        console.warn('[auth] 未配置 APP_URL，且请求不是来自本机，已拒绝生成重置链接。部署时请在 .env 设置 APP_URL。');
      } else {
        const token = randomBytes(32).toString('base64url');
        store.insertReset({ tokenHash: sha256(token), userId: user.id, exp: Date.now() + RESET_TTL_MS });
        // 不等待投递完成：账号存在与否的响应时间保持一致，避免通过耗时探测邮箱
        Promise.resolve()
          .then(() => deliver(email, `${base}/#/reset?token=${token}`))
          .catch((e) => console.warn('[auth] 发送重置链接失败：', (e as Error).message));
      }
    }
    return c.json({ ok: true, delivery });
  });

  /** 用重置令牌设置新密码：令牌一次性；成功后清掉该账号所有旧会话并直接登录。 */
  routes.post('/api/auth/reset', async (c) => {
    if (!resetHits.check(ip(c))) return c.json({ error: '请求太频繁了，请稍后再试。' }, 429);
    resetHits.hit(ip(c));
    const r = await readJson(c, MAX_AUTH_BODY);
    if (!r.ok) return r.res;
    const token = str(r.body?.token);
    const password = str(r.body?.password);
    const err = validatePassword(password);
    if (err) return c.json({ error: err }, 400);
    const userId = token && token.length <= 128 ? store.consumeReset(sha256(token), Date.now()) : null;
    const user = userId ? store.findUserById(userId) : null;
    if (!user) return c.json({ error: '重置链接无效或已过期，请重新申请。' }, 400);
    const h = await newHash(password);
    store.updatePassword(user.id, h.salt, h.hash);
    store.deleteUserSessions(user.id);
    store.deleteUserResets(user.id);
    startSession(c, { ...user, ...h });
    return c.json({ user: pub(user) });
  });

  routes.get('/api/state', (c) => {
    const u = currentUser(c);
    if (!u) return c.json({ error: '未登录' }, 401);
    const s = store.getState(u.id);
    return c.json({ state: s?.state ?? null, updatedAt: s?.updatedAt ?? null });
  });

  routes.put('/api/state', async (c) => {
    const u = currentUser(c);
    if (!u) return c.json({ error: '未登录' }, 401);
    const r = await readJson(c, MAX_STATE_BYTES);
    if (!r.ok) return r.res;
    const state = r.body?.state;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return c.json({ error: 'state 必须是对象' }, 400);
    const at = Date.now();
    store.setState(u.id, state, at);
    return c.json({ ok: true, updatedAt: at });
  });

  return { routes, currentUser, storeKind: store.kind };
}
