// 账号状态：loading → anon（去登录页）/ guest（游客）/ authed（已登录）。
// 每个账号一份本地存储；服务端账号额外把状态同步到 /api/state。
// 注册时把游客数据并入新账号；登录时若账号还没有资料，也会并入。
// 会话过期：同步收到 401 时回到登录页，未同步的修改留在本机并打上标记，重新登录后优先上传。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AuthError, backends, detect, getCurrentUser, GUEST_FLAG, pullState, pushState, storageKeyFor, unsynced,
  type AuthUser, type Backend,
} from '../lib/auth';
import { isEmptyState, loadState, STORAGE_KEY, type State } from './store';
import { supabase } from '../lib/supabase';

export type AuthStatus = 'loading' | 'anon' | 'guest' | 'authed';

interface AuthCtx {
  status: AuthStatus;
  backend: Backend;
  user: AuthUser | null;
  /** 当前应使用的本地存储键 */
  storageKey: string;
  /** 一次性提示（例如“已把游客数据并入账号”），由界面读取后清空 */
  notice: string | null;
  clearNotice: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 申请重置链接；离线版抛错说明无法找回。 */
  forgot: (email: string) => Promise<'email' | 'console'>;
  /** 用重置令牌设置新密码，成功后直接登录。 */
  resetPassword: (token: string, password: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  continueAsGuest: () => void;
  /** 状态变化时调用：服务端账号防抖同步 */
  onStateChange: (s: State) => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const SYNC_DELAY = 800;
const CHECK_EVERY = 30_000;
export const EXPIRED_NOTICE = '登录已过期，请重新登录。刚才的修改会在登录后继续保留。';
const is401 = (e: unknown) => e instanceof AuthError && e.status === 401;

const write = (key: string, s: Partial<State>) => {
  try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* 忽略 */ }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [backend, setBackend] = useState<Backend>('local');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef<{ timer: number; state: State } | null>(null);
  const expireRef = useRef<() => void>(() => undefined);

  /** 会话失效：回到登录页，保留本机副本（不删），提示原因。 */
  const expire = useCallback(() => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
    setUser(null);
    setStatus('anon');
    setNotice(EXPIRED_NOTICE);
  }, []);
  expireRef.current = expire;

  /** 上传状态：成功清除未同步标记；失败保留标记；401 说明会话失效。返回是否成功。 */
  const push = useCallback(async (u: AuthUser, s: unknown): Promise<boolean> => {
    try {
      await pushState(s);
      unsynced.clear(u);
      return true;
    } catch (e) {
      unsynced.set(u);
      if (is401(e)) expireRef.current();
      return false;
    }
  }, []);

  /**
   * 服务端账号登录后的同步：
   * 本机有未同步修改 → 以本机为准上传；否则以服务端为准；服务端为空而本机有数据 → 上传本机。
   * 拉取遇到网络错误时保留本机副本。401 向上抛出。
   */
  const syncDown = useCallback(async (u: AuthUser) => {
    if (u.backend !== 'server') return;
    const key = storageKeyFor(STORAGE_KEY, u);
    const localState = loadState(key);
    if (unsynced.get(u) && !isEmptyState(localState)) {
      await pushState(localState).then(() => unsynced.clear(u), (e) => { if (is401(e)) throw e; });
      return;
    }
    const remote = await pullState() as Partial<State> | null | undefined;
    if (remote === undefined) return;
    if (remote && !isEmptyState(remote)) write(key, remote);
    else if (!isEmptyState(localState)) await pushState(localState).catch(() => unsynced.set(u));
  }, []);

  /** 把游客数据并入账号（仅当账号还没有资料时，避免覆盖）。返回是否并入。 */
  const adoptGuest = useCallback(async (u: AuthUser, always: boolean) => {
    const guest = loadState(STORAGE_KEY);
    if (isEmptyState(guest)) return false;
    const key = storageKeyFor(STORAGE_KEY, u);
    const mine = loadState(key);
    if (!always && mine.user) return false;
    if (!isEmptyState(mine) && !always) return false;
    write(key, guest);
    localStorage.removeItem(STORAGE_KEY);
    if (u.backend === 'server') await pushState(guest).catch(() => undefined);
    return true;
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await detect();
      if (!alive) return;
      setBackend(r.backend);
      if (r.user) {
        try {
          await syncDown(r.user);
        } catch {
          if (alive) setStatus('anon'); // 会话刚好在这期间过期
          return;
        }
        if (!alive) return;
        setUser(r.user);
        setStatus('authed');
      } else {
        setStatus(localStorage.getItem(GUEST_FLAG) ? 'guest' : 'anon');
      }
    })();
    return () => { alive = false; };
  }, [syncDown]);

  const flush = useCallback(async () => {
    const p = pending.current;
    if (!p || !user) return;
    window.clearTimeout(p.timer);
    pending.current = null;
    await push(user, p.state);
  }, [push, user]);

  // 回到页面时（以及每 30 秒内最多一次）检查会话是否还有效，过期就及时回登录页
  useEffect(() => {
    if (status !== 'authed' || user?.backend !== 'server') return;
    let last = Date.now();
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < CHECK_EVERY) return;
      last = Date.now();
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser || currentUser.id !== user.id) {
          if (pending.current) unsynced.set(user);
          expire();
        }
      } catch { /* 断网：不处理，下次再查 */ }
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [status, user, expire]);

  // 关页面前尽量把未同步的改动发出去
  useEffect(() => {
    const on = () => {
      const p = pending.current;
      if (!p) return;
      if (supabase) { void pushState(p.state).catch(() => undefined); return; }
      try {
        fetch('/api/state', {
          method: 'PUT', keepalive: true, credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: p.state }),
        });
      } catch { /* 忽略 */ }
    };
    window.addEventListener('pagehide', on);
    return () => window.removeEventListener('pagehide', on);
  }, []);

  const signedIn = useCallback(async (u: AuthUser, isNew: boolean) => {
    await syncDown(u);
    const merged = await adoptGuest(u, isNew);
    localStorage.removeItem(GUEST_FLAG);
    if (merged) setNotice('已把游客模式下的资料和对话并入账号');
    setUser(u);
    setStatus('authed');
  }, [adoptGuest, syncDown]);

  const login = useCallback(async (email: string, password: string) => {
    const u = await backends[backend].login(email, password);
    await signedIn(u, false);
  }, [backend, signedIn]);

  const register = useCallback(async (email: string, password: string) => {
    const u = await backends[backend].register(email, password);
    await signedIn(u, true);
  }, [backend, signedIn]);

  const logout = useCallback(async () => {
    const u = user;
    await flush();
    await backends[u?.backend ?? backend].logout();
    // 服务端账号的数据以服务端为准，退出时清掉本机副本，避免共用电脑时泄露；
    // 还有没传上去的修改（例如断网）时保留，下次登录自动上传。
    if (u?.backend === 'server' && !unsynced.get(u)) localStorage.removeItem(storageKeyFor(STORAGE_KEY, u));
    localStorage.removeItem(GUEST_FLAG);
    setUser(null);
    setStatus('anon');
  }, [backend, flush, user]);

  const forgot = useCallback(async (email: string) => {
    if (backend !== 'server') {
      throw new AuthError('当前无法发送重置邮件，请重新注册或继续体验。');
    }
    return backends.server.forgot(email);
  }, [backend]);

  const resetPassword = useCallback(async (token: string, password: string) => {
    if (backend !== 'server') throw new AuthError('当前无法完成密码重置，请重新注册或继续体验。');
    const u = await backends.server.reset(token, password);
    await signedIn(u, false);
  }, [backend, signedIn]);

  const changePassword = useCallback(async (current: string, next: string) => {
    if (!user) throw new AuthError('请先登录', 401);
    try {
      await backends[user.backend].changePassword(user, current, next);
    } catch (e) {
      if (is401(e)) expire();
      throw e;
    }
  }, [user, expire]);

  const continueAsGuest = useCallback(() => {
    localStorage.setItem(GUEST_FLAG, '1');
    setStatus('guest');
  }, []);

  const onStateChange = useCallback((s: State) => {
    const u = user;
    if (u?.backend !== 'server') return;
    // 先打标记：页面在同步前被关掉或会话过期，下次登录也知道本机更新
    unsynced.set(u);
    if (pending.current) window.clearTimeout(pending.current.timer);
    const timer = window.setTimeout(() => {
      pending.current = null;
      void push(u, s);
    }, SYNC_DELAY);
    pending.current = { timer, state: s };
  }, [user, push]);

  const value = useMemo<AuthCtx>(() => ({
    status, backend, user, notice,
    storageKey: storageKeyFor(STORAGE_KEY, status === 'authed' ? user : null),
    clearNotice: () => setNotice(null),
    login, register, logout, forgot, resetPassword, changePassword, continueAsGuest, onStateChange,
  }), [status, backend, user, notice, login, register, logout, forgot, resetPassword, changePassword, continueAsGuest, onStateChange]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return v;
}

export { AuthError };
