// 账号存储：默认 SQLite（Node 22 内置 node:sqlite，无需原生依赖）；
// DATA_FILE 以 .json 结尾或运行环境不支持 node:sqlite 时，回退为 JSON 文件；不传文件则仅内存（测试）。
import { createRequire } from 'node:module';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface UserRec { id: string; email: string; salt: string; hash: string; createdAt: number }
export interface SessionRec { tokenHash: string; userId: string; exp: number }
export interface ResetRec { tokenHash: string; userId: string; exp: number }

export interface Store {
  kind: 'sqlite' | 'json' | 'memory';
  findUserByEmail(email: string): UserRec | null;
  findUserById(id: string): UserRec | null;
  /** 原子插入用户；邮箱已存在时返回 false。 */
  insertUser(u: UserRec): boolean;
  updatePassword(id: string, salt: string, hash: string): void;
  getState(id: string): { state: unknown; updatedAt: number } | null;
  setState(id: string, state: unknown, at: number): void;
  insertSession(s: SessionRec): void;
  findSession(tokenHash: string): SessionRec | null;
  deleteSession(tokenHash: string): void;
  /** 删除某用户的全部会话，可保留当前这一个 */
  deleteUserSessions(userId: string, keepTokenHash?: string): void;
  insertReset(r: ResetRec): void;
  /** 一次性消费重置令牌：有效则删除并返回 userId */
  consumeReset(tokenHash: string, now: number): string | null;
  deleteUserResets(userId: string): void;
  purgeExpired(now: number): void;
}

/* ---------- 内存 / JSON 文件 ---------- */

interface JsonDB {
  users: UserRec[];
  sessions: SessionRec[];
  resets: ResetRec[];
  states: Record<string, { state: unknown; updatedAt: number }>;
}

function jsonStore(file?: string): Store {
  let db: JsonDB = { users: [], sessions: [], resets: [], states: {} };
  if (file && existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<JsonDB>;
      db = { users: raw.users ?? [], sessions: raw.sessions ?? [], resets: raw.resets ?? [], states: raw.states ?? {} };
    } catch (e) {
      console.warn('[store] 读取数据文件失败，使用空库：', (e as Error).message);
    }
  }
  const save = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
    renameSync(tmp, file);
  };
  return {
    kind: file ? 'json' : 'memory',
    findUserByEmail: (email) => db.users.find((u) => u.email === email) ?? null,
    findUserById: (id) => db.users.find((u) => u.id === id) ?? null,
    insertUser: (u) => {
      if (db.users.some((x) => x.email === u.email)) return false;
      db.users.push(u);
      save();
      return true;
    },
    updatePassword: (id, salt, hash) => {
      const u = db.users.find((x) => x.id === id);
      if (u) { u.salt = salt; u.hash = hash; save(); }
    },
    getState: (id) => db.states[id] ?? null,
    setState: (id, state, at) => { db.states[id] = { state, updatedAt: at }; save(); },
    insertSession: (s) => { db.sessions.push(s); save(); },
    findSession: (h) => db.sessions.find((s) => s.tokenHash === h) ?? null,
    deleteSession: (h) => { db.sessions = db.sessions.filter((s) => s.tokenHash !== h); save(); },
    deleteUserSessions: (userId, keep) => {
      db.sessions = db.sessions.filter((s) => s.userId !== userId || s.tokenHash === keep);
      save();
    },
    insertReset: (r) => { db.resets.push(r); save(); },
    consumeReset: (h, now) => {
      const r = db.resets.find((x) => x.tokenHash === h);
      if (!r) return null;
      db.resets = db.resets.filter((x) => x !== r);
      save();
      return r.exp > now ? r.userId : null;
    },
    deleteUserResets: (userId) => { db.resets = db.resets.filter((r) => r.userId !== userId); save(); },
    purgeExpired: (now) => {
      const before = db.sessions.length + db.resets.length;
      db.sessions = db.sessions.filter((s) => s.exp > now);
      db.resets = db.resets.filter((r) => r.exp > now);
      if (db.sessions.length + db.resets.length !== before) save();
    },
  };
}

/* ---------- SQLite ---------- */

type Stmt = { run: (...a: unknown[]) => unknown; get: (...a: unknown[]) => any; all: (...a: unknown[]) => any[] };
type DatabaseSyncT = new (path: string) => { exec: (sql: string) => void; prepare: (sql: string) => Stmt };

function loadSqlite(): DatabaseSyncT | null {
  // node:sqlite 在 Node 22 仍标记为实验特性，加载时会打印一条警告；这里只屏蔽这一条。
  const orig = process.emitWarning;
  process.emitWarning = function (w: unknown, ...rest: unknown[]) {
    if (String((w as Error)?.message ?? w).includes('SQLite')) return;
    return (orig as (...a: unknown[]) => void).call(process, w, ...rest);
  } as typeof process.emitWarning;
  try {
    return (createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: DatabaseSyncT }).DatabaseSync;
  } catch {
    return null;
  } finally {
    process.emitWarning = orig;
  }
}

function sqliteStore(file: string, DatabaseSync: DatabaseSyncT): Store {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  try { chmodSync(file, 0o600); } catch { /* 忽略 */ }
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, exp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS resets (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, exp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS states (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, state TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  const q = {
    byEmail: db.prepare('SELECT id, email, salt, hash, created_at AS createdAt FROM users WHERE email = ?'),
    byId: db.prepare('SELECT id, email, salt, hash, created_at AS createdAt FROM users WHERE id = ?'),
    insUser: db.prepare('INSERT INTO users (id, email, salt, hash, created_at) VALUES (?, ?, ?, ?, ?)'),
    updPw: db.prepare('UPDATE users SET salt = ?, hash = ? WHERE id = ?'),
    getState: db.prepare('SELECT state, updated_at AS updatedAt FROM states WHERE user_id = ?'),
    setState: db.prepare('INSERT INTO states (user_id, state, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at'),
    insSess: db.prepare('INSERT INTO sessions (token_hash, user_id, exp) VALUES (?, ?, ?)'),
    getSess: db.prepare('SELECT token_hash AS tokenHash, user_id AS userId, exp FROM sessions WHERE token_hash = ?'),
    delSess: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    delUserSess: db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?'),
    insReset: db.prepare('INSERT INTO resets (token_hash, user_id, exp) VALUES (?, ?, ?)'),
    // 原子地取出并删除，多进程共用同一个库时令牌也只能用一次
    takeReset: db.prepare('DELETE FROM resets WHERE token_hash = ? RETURNING user_id AS userId, exp'),
    delUserResets: db.prepare('DELETE FROM resets WHERE user_id = ?'),
    purgeSess: db.prepare('DELETE FROM sessions WHERE exp <= ?'),
    purgeResets: db.prepare('DELETE FROM resets WHERE exp <= ?'),
  };
  const row = (r: any): UserRec | null => (r ? { id: r.id, email: r.email, salt: r.salt, hash: r.hash, createdAt: Number(r.createdAt) } : null);
  return {
    kind: 'sqlite',
    findUserByEmail: (email) => row(q.byEmail.get(email)),
    findUserById: (id) => row(q.byId.get(id)),
    insertUser: (u) => {
      try {
        q.insUser.run(u.id, u.email, u.salt, u.hash, u.createdAt);
        return true;
      } catch (error) {
        const message = String(error);
        if (/unique|constraint/i.test(message) && /email|users/i.test(message)) return false;
        throw error;
      }
    },
    updatePassword: (id, salt, hash) => { q.updPw.run(salt, hash, id); },
    getState: (id) => {
      const r = q.getState.get(id);
      if (!r) return null;
      try { return { state: JSON.parse(r.state), updatedAt: Number(r.updatedAt) }; } catch { return null; }
    },
    setState: (id, state, at) => { q.setState.run(id, JSON.stringify(state), at); },
    insertSession: (s) => { q.insSess.run(s.tokenHash, s.userId, s.exp); },
    findSession: (h) => {
      const r = q.getSess.get(h);
      return r ? { tokenHash: r.tokenHash, userId: r.userId, exp: Number(r.exp) } : null;
    },
    deleteSession: (h) => { q.delSess.run(h); },
    deleteUserSessions: (userId, keep) => { q.delUserSess.run(userId, keep ?? ''); },
    insertReset: (r) => { q.insReset.run(r.tokenHash, r.userId, r.exp); },
    consumeReset: (h, now) => {
      const r = q.takeReset.get(h);
      if (!r) return null;
      return Number(r.exp) > now ? String(r.userId) : null;
    },
    deleteUserResets: (userId) => { q.delUserResets.run(userId); },
    purgeExpired: (now) => { q.purgeSess.run(now); q.purgeResets.run(now); },
  };
}

export function openStore(file?: string): Store {
  if (!file) return jsonStore();
  if (file.endsWith('.json')) return jsonStore(file);
  const DatabaseSync = loadSqlite();
  if (DatabaseSync) return sqliteStore(file, DatabaseSync);
  const fallback = file.replace(/\.[^./]+$/, '') + '.json';
  console.warn(`[store] 当前 Node 不支持 node:sqlite（需要 22.5+），改用 JSON 文件：${fallback}`);
  return jsonStore(fallback);
}
