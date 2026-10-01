// 侧栏：品牌、新建会话、会话列表（“…”菜单：置顶/删除，删除可撤销）、工具导航、当前用户。桌面常驻，移动端作为抽屉复用。
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Home, CircleDot, Users, User, SquarePen, Trash2, Pin, PinOff, MoreHorizontal, PanelLeftClose, Search, X, LogIn, LogOut, ChevronDown } from 'lucide-react';
import { LogoMark } from './Logo';
import { navigate, TERMS, type Route } from '../state/hooks';
import { useStore } from '../state/store';
import { useAuth } from '../state/auth';
import { MOD, newChat, useUI } from '../state/ui';
import type { InterpretationThread } from '../lib/types';

export const TOOLS: { route: Route; label: string; Icon: typeof Home }[] = [
  { route: 'chart', label: '命盘', Icon: CircleDot },
  { route: 'home', label: '今日', Icon: Home },
  { route: 'compat', label: '关系', Icon: Users },
  { route: 'profile', label: '我的', Icon: User },
];

export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <a href="#/ask" onClick={onClick} className="group flex min-w-0 items-center gap-2.5" aria-label="Dio delle Stelle 首页">
      <span className="logo-tile grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-white/15 bg-white/5 text-[#faf9f5]"><LogoMark size={24} /></span>
      <span className="min-w-0">
        <span className="h-display block truncate text-[16px] leading-tight text-[#faf9f5]">Dio delle Stelle</span>
        <span className="block text-[10px] tracking-[0.08em] text-white/45">星神 · 紫微与星盘</span>
      </span>
    </a>
  );
}

const threadTitle = (t: InterpretationThread) => t.title || t.entries[0]?.question || '新会话';

function ThreadItem({ t, active, onNavigate }: { t: InterpretationThread; active: boolean; onNavigate?: () => void }) {
  const { dispatch } = useStore();
  const { toast } = useUI();
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const title = threadTitle(t);
  const pinned = !!t.pinnedAt;

  const togglePin = () => {
    dispatch({ type: 'pinThread', threadId: t.id, pinned: !pinned });
    toast(pinned ? '已取消置顶' : '已置顶');
  };
  const remove = () => {
    dispatch({ type: 'deleteThread', threadId: t.id });
    if (active) newChat();
    toast(`已删除「${title.slice(0, 12)}」`, { label: '撤销', run: () => dispatch({ type: 'restoreThread', thread: t }) });
  };

  // 标题占满整行；悬停/聚焦/菜单打开时，右侧渐变淡入“…”和图钉（盖住标题末尾，不用拉宽侧栏）
  return (
    <li className="thread-row relative min-w-0" data-testid="thread-item" data-pinned={pinned || undefined}
      data-active={active || undefined} data-menu={menuOpen || undefined}>
      <a href={`#/ask?t=${encodeURIComponent(t.id)}`} onClick={onNavigate} aria-current={active ? 'page' : undefined}
        className={`thread-link flex min-w-0 items-center gap-2 rounded-[6px] py-1.5 pl-2.5 pr-2.5 text-[13px] ${active || menuOpen ? 'text-[#faf9f5]' : 'text-white/70 hover:text-white'}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.mode === 'ziwei' ? 'bg-[#d97757]' : 'bg-[#b8b5a8]'}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate" data-testid="thread-title">{title}</span>
        <span className="sr-only">（{TERMS[t.mode].short}，{t.entries.length} 问{pinned ? '，已置顶' : ''}）</span>
      </a>
      <span className="thread-actions absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-r-[6px] pl-7 pr-1" data-testid="thread-actions">
        <button ref={moreRef} type="button" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`更多：${title}`} title="更多"
          onClick={() => setMenuOpen((v) => !v)} data-testid="thread-more" className="sb-row-btn">
          <MoreHorizontal size={15} aria-hidden />
        </button>
        <button type="button" aria-label={pinned ? `取消置顶：${title}` : `置顶：${title}`} title={pinned ? '取消置顶' : '置顶'}
          aria-pressed={pinned} onClick={togglePin} data-testid="thread-pin" className={`sb-row-btn ${pinned ? '!text-[#e8a487]' : ''}`}>
          <Pin size={13} aria-hidden fill={pinned ? 'currentColor' : 'none'} />
        </button>
      </span>
      {menuOpen && (
        <ThreadMenu anchor={moreRef} pinned={pinned} onClose={() => setMenuOpen(false)}
          onPin={() => { setMenuOpen(false); togglePin(); }}
          onDelete={() => { setMenuOpen(false); remove(); }} />
      )}
    </li>
  );
}

/** 会话的“…”菜单：只有置顶 / 删除两项。挂到 body 上，避免被侧栏的 overflow 裁掉。 */
function ThreadMenu({ anchor, pinned, onClose, onPin, onDelete }: {
  anchor: RefObject<HTMLButtonElement>; pinned: boolean; onClose: () => void; onPin: () => void; onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const m = ref.current;
    if (!a || !m) return;
    const w = m.offsetWidth, h = m.offsetHeight;
    let left = a.left;
    let top = a.bottom + 4;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - 4);
    setPos({ left, top });
    m.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [anchor]);

  useEffect(() => {
    const close = (focusBack: boolean) => { onClose(); if (focusBack) anchor.current?.focus(); };
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!ref.current?.contains(n) && !anchor.current?.contains(n)) close(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(true); } };
    const onScroll = (e: Event) => { if (!ref.current?.contains(e.target as Node)) close(false); };
    const onResize = () => close(false);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [anchor, onClose]);

  const onMenuKey = (e: KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    if (e.key === 'Home') { e.preventDefault(); items[0]?.focus(); }
    if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus(); }
    if (e.key === 'Tab') { e.preventDefault(); onClose(); anchor.current?.focus(); }
  };

  return createPortal(
    <div ref={ref} role="menu" aria-label="会话操作" onKeyDown={onMenuKey} data-testid="thread-menu"
      className="thread-menu fixed z-[80] min-w-[188px] rounded-[12px] border border-white/10 bg-[#2a2926] p-1.5 text-[13px] text-[#faf9f5] shadow-[0_12px_32px_rgba(0,0,0,.45)]"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}>
      <button type="button" role="menuitem" onClick={onPin} className="thread-menu-item" data-testid="menu-pin">
        {pinned ? <PinOff size={15} aria-hidden /> : <Pin size={15} aria-hidden />}
        <span className="flex-1 text-left">{pinned ? '取消置顶' : '置顶'}</span>
      </button>
      <div className="mx-2 my-1 h-px bg-white/10" role="separator" />
      <button type="button" role="menuitem" onClick={onDelete} className="thread-menu-item text-[#f0a48a]" data-testid="menu-delete">
        <Trash2 size={15} aria-hidden />
        <span className="flex-1 text-left">删除</span>
      </button>
    </div>,
    document.body,
  );
}

const VISIBLE_LIMIT = 8;

export function SidebarBody({ route, activeThread, onNavigate, inDrawer }: { route: Route; activeThread?: string; onNavigate?: () => void; inDrawer?: boolean }) {
  const { state } = useStore();
  const auth = useAuth();
  const { toggleSidebar, setPalette, setDrawer } = useUI();
  const [expanded, setExpanded] = useState(false);
  const sorted = [...state.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pinnedList = sorted.filter((t) => t.pinnedAt).sort((a, b) => b.pinnedAt!.localeCompare(a.pinnedAt!));
  const unpinned = sorted.filter((t) => !t.pinnedAt);
  // 默认只显示最近 8 个未置顶会话；当前打开的会话即使更早也保留
  let shown = expanded ? unpinned : unpinned.slice(0, VISIBLE_LIMIT);
  if (!expanded && activeThread && !shown.some((t) => t.id === activeThread)) {
    const cur = unpinned.find((t) => t.id === activeThread);
    if (cur) shown = [...shown, cur];
  }
  const hiddenCount = unpinned.length - shown.length;
  const today = new Date().toDateString();
  const groups: [string, InterpretationThread[]][] = [
    ['置顶', pinnedList],
    ['今天', shown.filter((t) => new Date(t.updatedAt).toDateString() === today)],
    ['更早', shown.filter((t) => new Date(t.updatedAt).toDateString() !== today)],
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3.5 pb-3 pt-4">
        <Brand onClick={onNavigate} />
        {inDrawer
          ? <button type="button" className="sb-icon" aria-label="关闭侧栏" onClick={() => setDrawer(false)}><X size={16} aria-hidden /></button>
          : <button type="button" className="sb-icon" aria-label={`收起侧栏（${MOD}+B）`} title={`收起侧栏 ${MOD}B`} onClick={toggleSidebar} data-testid="collapse-sidebar"><PanelLeftClose size={16} aria-hidden /></button>}
      </div>
      <div className="grid gap-1 px-2.5">
        <button type="button" onClick={() => { newChat(); onNavigate?.(); }} disabled={!state.user}
          className="sb-item flex h-9 items-center gap-2 rounded-[6px] px-2.5 text-[13.5px] font-medium text-[#faf9f5] hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40" data-testid="new-chat">
          <SquarePen size={15} aria-hidden /><span className="flex-1 text-left">新会话</span><kbd className="kbd">{MOD}⇧O</kbd>
        </button>
        <button type="button" onClick={() => { setPalette(true); onNavigate?.(); }}
          className="sb-item flex h-9 items-center gap-2 rounded-[6px] px-2.5 text-[13.5px] text-white/70 hover:bg-white/[0.07] hover:text-white" data-testid="open-palette">
          <Search size={15} aria-hidden /><span className="flex-1 text-left">搜索与命令</span><kbd className="kbd">{MOD}K</kbd>
        </button>
      </div>

      <nav aria-label={inDrawer ? '工具（抽屉）' : '工具'} className="mt-3 px-2.5">
        <ul className="grid gap-0.5">
          {TOOLS.map(({ route: r, label, Icon }) => (
            <li key={r}>
              <a href={`#/${r}`} aria-current={route === r ? 'page' : undefined} aria-disabled={!state.user || undefined}
                onClick={(e) => { if (!state.user) e.preventDefault(); else onNavigate?.(); }}
                className={`sb-item flex items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[13px] ${!state.user ? 'cursor-not-allowed text-white/25' : route === r ? 'bg-white/10 text-[#faf9f5]' : 'text-white/60 hover:bg-white/[0.06] hover:text-white'}`}>
                <Icon size={15} aria-hidden />{label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-3" data-testid="thread-list">
        {sorted.length === 0 && <p className="px-2.5 text-[12px] leading-5 text-white/40">会话会出现在这里。<br />每次“新会话”都会单独保存。</p>}
        {groups.map(([label, list]) => list.length > 0 && (
          <section key={label} className="mb-3 min-w-0" aria-label={label}>
            <h2 className="px-2.5 pb-1 text-[11px] font-medium text-white/40">{label}</h2>
            <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-px">{list.map((t) => <ThreadItem key={t.id} t={t} active={route === 'ask' && t.id === activeThread} onNavigate={onNavigate} />)}</ul>
          </section>
        ))}
        {(hiddenCount > 0 || expanded) && unpinned.length > VISIBLE_LIMIT && (
          <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} data-testid="thread-expand"
            className="sb-item flex w-full items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12px] text-white/45 hover:bg-white/[0.06] hover:text-white/80">
            <ChevronDown size={13} aria-hidden className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            {expanded ? '收起' : `展开显示（还有 ${hiddenCount} 个）`}
          </button>
        )}
      </div>

      <div className="border-t border-white/10 px-2.5 py-2.5">
        <a href="#/profile" onClick={(e) => { if (!state.user) e.preventDefault(); else onNavigate?.(); }} className="sb-item flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 hover:bg-white/[0.06]">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#d97757] text-[12px] font-semibold text-[#1f1e1b]" aria-hidden>{state.user?.name.slice(0, 1) ?? '?'}</span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] text-[#faf9f5]">{state.user?.name ?? '尚未填写资料'}</span>
            <span className="block truncate text-[10.5px] text-white/45" data-testid="account-label">
              {auth.user ? auth.user.email : state.user ? `游客 · ${TERMS[state.mode].label}` : '先在对话里填写出生资料'}
            </span>
          </span>
        </a>
        {auth.status === 'authed' ? (
          <button type="button" data-testid="logout" onClick={() => { void auth.logout().then(() => navigate('login')); }}
            className="sb-item mt-1 flex w-full items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-[12.5px] text-white/55 hover:bg-white/[0.06] hover:text-white">
            <LogOut size={15} aria-hidden />退出登录
          </button>
        ) : (
          <a href="#/register" data-testid="guest-register" onClick={() => onNavigate?.()}
            className="sb-item mt-1 flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-[12.5px] text-[#e8a487] hover:bg-white/[0.06]">
            <LogIn size={15} aria-hidden />注册 / 登录，保存你的资料
          </a>
        )}
      </div>
    </>
  );
}
