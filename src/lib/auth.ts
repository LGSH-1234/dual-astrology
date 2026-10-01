// 账号客户端：两种后端，同一套接口。
// - server：Hono 服务端账号（httpOnly 会话 Cookie，前端拿不到令牌）。
// - local：离线单文件版（file://）或服务端不可达时使用；账号存在本机浏览器，
//   密码用 WebCrypto PBKDF2-SHA256 + 随机盐哈希，不存明文。仅保护本机演示数据，不是真正的安全边界。
import { normalizeEmail, validateEmail, validatePassword } from './authRules';
import { consumeAuthRedirect, authRedirectUrl, supabase } from './supabase';
import type { User } from '@supabase/supabase-js';

export type Backend = 'server' | 'local';
export interface AuthUser { id: string; email: string; createdAt: number; backend: Backend }

export class AuthError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

export class EmailConfirmationRequired extends AuthError {}

function cloudError(error: { message: string; status?: number; code?: string }): AuthError {
  const messages: Record<string, string> = {
    invalid_credentials: '邮箱或密码不正确',
    email_not_confirmed: '请先通过邮件确认账号，再登录。',
    user_already_exists: '该邮箱已注册，请直接登录。',
    email_exists: '该邮箱已注册，请直接登录。',
    over_email_send_rate_limit: '邮件发送较频繁，请稍后再试。',
    over_request_rate_limit: '操作较频繁，请稍后再试。',
    email_address_not_authorized: '当前暂时无法向此邮箱发送邮件，请稍后再试。',
    same_password: '新密码不能与当前密码相同',
    weak_password: '密码强度不足，请使用至少 8 位字母和数字。',
  };
  return new AuthError(messages[error.code ?? ''] ?? '操作暂时未完成，请稍后重试。', error.status);
}

const cloudUser = (user: User): AuthUser => ({ id: user.id, email: user.email ?? '', createdAt: Date.parse(user.created_at), backend: 'server' });

const LOCAL_ACCOUNTS = 'dio:accounts';
const LOCAL_SESSION = 'dio:local-session';
export const GUEST_FLAG = 'dio:guest';
const PBKDF2_ITER = 120_000;

interface LocalAccount { id: string; email: string; salt: string; hash: string; createdAt: number }

/* ---------- 后端探测 ---------- */

export async function detect(): Promise<{ backend: Backend; user: AuthUser | null }> {
  if (location.protocol === 'file:') return { backend: 'local', user: localMe() };
  if (supabase) {
    try {
      await consumeAuthRedirect();
      return { backend: 'server', user: await getCurrentUser() };
    } catch {
      return { backend: 'server', user: null };
    }
  }
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('no api');
    const j = await r.json() as { user: Omit<AuthUser, 'backend'> | null };
    return { backend: 'server', user: j.user ? { ...j.user, backend: 'server' } : null };
  } catch {
    return { backend: 'local', user: localMe() };
  }
}

/* ---------- server ---------- */

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new AuthError('连接服务器失败，请检查网络后重试。');
  }
  const j = await r.json().catch(() => ({})) as { error?: string };
  if (!r.ok) throw new AuthError(j.error ?? `请求失败（${r.status}）`, r.status);
  return j as T;
}

const honoServer = {
  async register(email: string, password: string): Promise<AuthUser> {
    const j = await api<{ user: Omit<AuthUser, 'backend'> }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
    return { ...j.user, backend: 'server' };
  },
  async login(email: string, password: string): Promise<AuthUser> {
    const j = await api<{ user: Omit<AuthUser, 'backend'> }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    return { ...j.user, backend: 'server' };
  },
  async logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
  },
  /** 申请重置链接；返回投递方式（console = 未接入邮件服务，链接打印在服务端控制台）。 */
  async forgot(email: string): Promise<'email' | 'console'> {
    const j = await api<{ delivery: 'email' | 'console' }>('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
    return j.delivery;
  },
  async reset(token: string, password: string): Promise<AuthUser> {
    const j = await api<{ user: Omit<AuthUser, 'backend'> }>('/api/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) });
    return { ...j.user, backend: 'server' };
  },
  async changePassword(_u: AuthUser, currentPassword: string, newPassword: string) {
    await api('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
  },
};

const server: typeof honoServer = supabase ? {
  async register(email, password) {
    const { data, error } = await supabase!.auth.signUp({
      email: normalizeEmail(email), password, options: { emailRedirectTo: authRedirectUrl() },
    });
    if (error) throw cloudError(error);
    if (!data.session || !data.user) throw new EmailConfirmationRequired('账号已创建，请查收确认邮件，验证后即可登录。');
    return cloudUser(data.user);
  },
  async login(email, password) {
    const { data, error } = await supabase!.auth.signInWithPassword({ email: normalizeEmail(email), password });
    if (error) throw cloudError(error);
    return cloudUser(data.user);
  },
  async logout() {
    const { error } = await supabase!.auth.signOut({ scope: 'local' });
    if (error) throw cloudError(error);
  },
  async forgot(email) {
    const { error } = await supabase!.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo: authRedirectUrl() });
    if (error) throw cloudError(error);
    return 'email';
  },
  async reset(token, password) {
    if (token !== 'recovery') throw new AuthError('重置链接无效或已过期，请重新申请。');
    const { data, error } = await supabase!.auth.updateUser({ password });
    if (error) throw cloudError(error);
    if (!data.user) throw new AuthError('重置链接无效或已过期，请重新申请。');
    return cloudUser(data.user);
  },
  async changePassword(_u, currentPassword, newPassword) {
    const { error } = await supabase!.auth.updateUser({ password: newPassword, current_password: currentPassword });
    if (error) throw cloudError(error);
    const { error: signOutError } = await supabase!.auth.signOut({ scope: 'others' });
    if (signOutError) throw cloudError(signOutError);
  },
} : honoServer;

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (supabase) {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      if (error.status === 401 || error.status === 403) return null;
      throw cloudError(error);
    }
    return data.user ? cloudUser(data.user) : null;
  }
  const j = await api<{ user: Omit<AuthUser, 'backend'> | null }>('/api/auth/me');
  return j.user ? { ...j.user, backend: 'server' } : null;
}

/** 拉取服务端状态。401 时抛出 AuthError（会话已失效）；网络等其他错误返回 undefined（保持本地副本）。 */
export async function pullState(): Promise<unknown | null | undefined> {
  try {
    if (supabase) {
      const user = await getCurrentUser();
      if (!user) throw new AuthError('登录已过期，请重新登录。', 401);
      const { data, error } = await supabase.from('dual_astrology_states').select('state').eq('user_id', user.id).maybeSingle();
      if (error) throw cloudError(error);
      return data?.state ?? null;
    }
    const j = await api<{ state: unknown | null }>('/api/state');
    return j.state;
  } catch (e) {
    if (e instanceof AuthError && e.status === 401) throw e;
    return undefined;
  }
}

export async function pushState(state: unknown): Promise<void> {
  if (supabase) {
    const user = await getCurrentUser();
    if (!user) throw new AuthError('登录已过期，请重新登录。', 401);
    const { error } = await supabase.from('dual_astrology_states').upsert({ user_id: user.id, state, updated_at: new Date().toISOString() });
    if (error) throw cloudError(error);
    return;
  }
  await api('/api/state', { method: 'PUT', body: JSON.stringify({ state }) });
}

/* ---------- local ---------- */

const hex = (b: ArrayBuffer | Uint8Array) =>
  Array.from(b instanceof Uint8Array ? b : new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));

async function pbkdf2(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return hex(bits);
}

/** 常量时间比较十六进制串 */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function accounts(): LocalAccount[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS) ?? '[]') as LocalAccount[]; } catch { return []; }
}
const toUser = (a: LocalAccount): AuthUser => ({ id: a.id, email: a.email, createdAt: a.createdAt, backend: 'local' });

function localMe(): AuthUser | null {
  const id = localStorage.getItem(LOCAL_SESSION);
  const a = id ? accounts().find((x) => x.id === id) : undefined;
  return a ? toUser(a) : null;
}

const local = {
  async register(emailRaw: string, password: string): Promise<AuthUser> {
    const email = normalizeEmail(emailRaw);
    const list = accounts();
    if (list.some((a) => a.email === email)) throw new AuthError('该邮箱已注册，请直接登录。', 409);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const acc: LocalAccount = { id: `l-${hex(crypto.getRandomValues(new Uint8Array(8)))}`, email, salt: hex(salt), hash: await pbkdf2(password, salt), createdAt: Date.now() };
    localStorage.setItem(LOCAL_ACCOUNTS, JSON.stringify([...list, acc]));
    localStorage.setItem(LOCAL_SESSION, acc.id);
    return toUser(acc);
  },
  async login(emailRaw: string, password: string): Promise<AuthUser> {
    const email = normalizeEmail(emailRaw);
    const acc = accounts().find((a) => a.email === email);
    const h = await pbkdf2(password, acc ? unhex(acc.salt) : new Uint8Array(16));
    if (!acc || !same(h, acc.hash)) throw new AuthError('邮箱或密码不正确', 401);
    localStorage.setItem(LOCAL_SESSION, acc.id);
    return toUser(acc);
  },
  async logout() {
    localStorage.removeItem(LOCAL_SESSION);
  },
  async changePassword(u: AuthUser, currentPassword: string, newPassword: string) {
    const list = accounts();
    const acc = list.find((a) => a.id === u.id);
    if (!acc || !same(await pbkdf2(currentPassword, unhex(acc.salt)), acc.hash)) throw new AuthError('当前密码不正确', 400);
    const err = validatePassword(newPassword);
    if (err) throw new AuthError(err, 400);
    if (currentPassword === newPassword) throw new AuthError('新密码不能与当前密码相同', 400);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    acc.salt = hex(salt);
    acc.hash = await pbkdf2(newPassword, salt);
    localStorage.setItem(LOCAL_ACCOUNTS, JSON.stringify(list));
  },
};

/* ---------- 对外 ---------- */

export function checkCredentials(email: string, password: string): string | null {
  return validateEmail(email) ?? validatePassword(password);
}

export const backends = { server, local };

/** 服务端账号“有未同步修改”的标记：会话过期或断网时保留本机副本，重新登录后优先上传。 */
const unsyncedKey = (u: AuthUser) => `dio:unsynced:${u.id}`;
export const unsynced = {
  get: (u: AuthUser) => localStorage.getItem(unsyncedKey(u)) === '1',
  set: (u: AuthUser) => { try { localStorage.setItem(unsyncedKey(u), '1'); } catch { /* 忽略 */ } },
  clear: (u: AuthUser) => localStorage.removeItem(unsyncedKey(u)),
};

/** 每个账号一份本地存储（账号间、与游客数据互不串）。 */
export const storageKeyFor = (base: string, u: AuthUser | null) =>
  u ? `${base}:${u.backend === 'server' ? 's' : 'l'}:${u.id}` : base;
