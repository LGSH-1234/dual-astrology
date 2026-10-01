// 全局状态：用户、好友、问答历史、当前模式。只存本机 localStorage，不上传。
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type {
  AstrologyMode, FriendProfile, InterpretationEntry, InterpretationThread, UserProfile,
} from '../lib/types';

export interface State {
  user: UserProfile | null;
  friends: FriendProfile[];
  threads: InterpretationThread[];
  mode: AstrologyMode;
  recentFriendIds: string[];
}

export type Action =
  | { type: 'setUser'; user: UserProfile }
  | { type: 'setMode'; mode: AstrologyMode }
  | { type: 'upsertFriend'; friend: FriendProfile }
  | { type: 'removeFriend'; id: string }
  | { type: 'viewFriend'; id: string }
  | { type: 'addEntry'; threadId: string; mode: AstrologyMode; friendId?: string; title: string; entry: InterpretationEntry }
  | { type: 'updateEntry'; threadId: string; entry: InterpretationEntry }
  | { type: 'renameThread'; threadId: string; title: string }
  | { type: 'deleteThread'; threadId: string }
  | { type: 'pinThread'; threadId: string; pinned: boolean }
  | { type: 'restoreThread'; thread: InterpretationThread }
  /** 编辑某条提问：替换问题、清掉回答，并丢弃它之后的消息（与 Claude/Codex 的“编辑后重新提问”一致） */
  | { type: 'editEntry'; threadId: string; entryId: string; question: string }
  | { type: 'clearHistory' }
  | { type: 'loadDemo' }
  | { type: 'reset' };

export const STORAGE_KEY = 'dual-astrology:v1';

const empty: State = { user: null, friends: [], threads: [], mode: 'ziwei', recentFriendIds: [] };

export const DEMO_USER: UserProfile = {
  id: 'me',
  name: '星野',
  birth: { date: '1995-06-15', time: '12:30', timeKnown: true, cityId: '330102', gender: '女' },
  defaultMode: 'ziwei',
  dualView: true,
  createdAt: '2026-10-01T00:00:00.000Z',
};

export const DEMO_FRIENDS: FriendProfile[] = [
  { id: 'f-aqing', name: '阿青', relation: '同事', birth: { date: '1993-11-02', time: '08:10', timeKnown: true, cityId: '110105', gender: '男' } },
  { id: 'f-xiaoman', name: '小满', relation: '好友', birth: { date: '1997-05-21', time: '21:40', timeKnown: true, cityId: '510104', gender: '女' } },
];

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'setUser':
      return { ...s, user: a.user, mode: s.user ? s.mode : a.user.defaultMode };
    case 'setMode':
      return { ...s, mode: a.mode };
    case 'upsertFriend': {
      const exists = s.friends.some((f) => f.id === a.friend.id);
      return { ...s, friends: exists ? s.friends.map((f) => (f.id === a.friend.id ? a.friend : f)) : [...s.friends, a.friend] };
    }
    case 'removeFriend':
      return {
        ...s,
        friends: s.friends.filter((f) => f.id !== a.id),
        recentFriendIds: s.recentFriendIds.filter((x) => x !== a.id),
      };
    case 'viewFriend':
      return { ...s, recentFriendIds: [a.id, ...s.recentFriendIds.filter((x) => x !== a.id)].slice(0, 4) };
    case 'addEntry': {
      const now = a.entry.createdAt;
      const t = s.threads.find((x) => x.id === a.threadId);
      const thread: InterpretationThread = t
        ? { ...t, entries: [...t.entries, a.entry], updatedAt: now }
        : { id: a.threadId, mode: a.mode, profileId: s.user?.id ?? 'me', friendId: a.friendId, title: a.title, entries: [a.entry], updatedAt: now };
      // 最多保留 50 个未置顶会话；置顶的不会被挤掉
      const rest = s.threads.filter((x) => x.id !== a.threadId);
      const all = [thread, ...rest];
      const unpinnedKeep = new Set(all.filter((x) => !x.pinnedAt).slice(0, 50).map((x) => x.id));
      return { ...s, threads: all.filter((x) => x.pinnedAt || unpinnedKeep.has(x.id)) };
    }
    case 'pinThread':
      return {
        ...s,
        threads: s.threads.map((t) => {
          if (t.id !== a.threadId) return t;
          if (a.pinned) return { ...t, pinnedAt: new Date().toISOString() };
          const { pinnedAt: _drop, ...rest } = t;
          return rest;
        }),
      };
    case 'updateEntry':
      return {
        ...s,
        threads: s.threads.map((t) => (t.id === a.threadId
          ? { ...t, entries: t.entries.map((e) => (e.id === a.entry.id ? a.entry : e)) }
          : t)),
      };
    case 'renameThread': {
      const title = a.title.trim().slice(0, 60);
      if (!title) return s;
      return { ...s, threads: s.threads.map((t) => (t.id === a.threadId ? { ...t, title } : t)) };
    }
    case 'deleteThread':
      return { ...s, threads: s.threads.filter((t) => t.id !== a.threadId) };
    case 'restoreThread':
      return s.threads.some((t) => t.id === a.thread.id) ? s : { ...s, threads: [a.thread, ...s.threads] };
    case 'editEntry':
      return {
        ...s,
        threads: s.threads.map((t) => {
          if (t.id !== a.threadId) return t;
          const i = t.entries.findIndex((e) => e.id === a.entryId);
          if (i < 0) return t;
          const edited: InterpretationEntry = { id: t.entries[i].id, question: a.question.trim(), createdAt: new Date().toISOString() };
          return { ...t, entries: [...t.entries.slice(0, i), edited], updatedAt: edited.createdAt };
        }),
      };
    case 'clearHistory':
      return { ...s, threads: [] };
    case 'loadDemo':
      return { ...empty, user: DEMO_USER, friends: DEMO_FRIENDS, mode: DEMO_USER.defaultMode, recentFriendIds: [DEMO_FRIENDS[0].id] };
    case 'reset':
      return empty;
  }
}

/** 读取某个存储键里的状态；游客用 STORAGE_KEY，账号用 `${STORAGE_KEY}:<账号>`。 */
export function loadState(key = STORAGE_KEY): State {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<State>;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

export const isEmptyState = (s: Partial<State> | null | undefined) =>
  !s || (!s.user && !(s.friends?.length) && !(s.threads?.length));

const Ctx = createContext<{ state: State; dispatch: (a: Action) => void } | null>(null);

export function StoreProvider({ children, storageKey = STORAGE_KEY, onChange }: {
  children: ReactNode;
  storageKey?: string;
  /** 状态变化回调（登录账号用它同步到服务端）。首次挂载不触发。 */
  onChange?: (s: State) => void;
}) {
  const [state, dispatch] = useReducer(reducer, storageKey, loadState);
  const first = useRef(true);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    try {
      if (isEmptyState(state)) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(state));
    } catch { /* 隐私模式下忽略 */ }
    if (first.current) { first.current = false; return; }
    onChangeRef.current?.(state);
  }, [state, storageKey]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore 必须在 StoreProvider 内使用');
  return v;
}
