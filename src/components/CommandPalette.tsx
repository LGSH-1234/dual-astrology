// ⌘K 命令面板：搜索会话 + 常用命令，方向键选择、Enter 执行、Esc 关闭。
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, SquarePen, CircleDot, Home, Users, User, PanelLeft, MessageCircle, Sparkles } from 'lucide-react';
import { navigate, TERMS } from '../state/hooks';
import { useStore } from '../state/store';
import { MOD, newChat, useUI } from '../state/ui';

interface Cmd { id: string; label: string; hint?: string; group: string; Icon: typeof Search; run: () => void }

export function CommandPalette() {
  const { state, dispatch } = useStore();
  const { palette, setPalette, toggleSidebar } = useUI();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { if (palette) { setQ(''); setSel(0); window.setTimeout(() => inputRef.current?.focus(), 0); } }, [palette]);

  const cmds = useMemo<Cmd[]>(() => {
    const has = !!state.user;
    const base: Cmd[] = [
      { id: 'new', label: '新会话', hint: `${MOD}⇧O`, group: '命令', Icon: SquarePen, run: newChat },
      { id: 'ziwei', label: '切换到 中华玄学（紫微）', group: '命令', Icon: Sparkles, run: () => dispatch({ type: 'setMode', mode: 'ziwei' }) },
      { id: 'western', label: '切换到 西方占星', group: '命令', Icon: Sparkles, run: () => dispatch({ type: 'setMode', mode: 'western' }) },
      { id: 'sidebar', label: '展开 / 收起侧栏', hint: `${MOD}B`, group: '命令', Icon: PanelLeft, run: toggleSidebar },
    ];
    const pages: Cmd[] = has ? [
      { id: 'p-chart', label: '打开 命盘', group: '页面', Icon: CircleDot, run: () => navigate('chart') },
      { id: 'p-home', label: '打开 今日', group: '页面', Icon: Home, run: () => navigate('home') },
      { id: 'p-compat', label: '打开 关系合盘', group: '页面', Icon: Users, run: () => navigate('compat') },
      { id: 'p-profile', label: '打开 我的资料', group: '页面', Icon: User, run: () => navigate('profile') },
    ] : [];
    const threads: Cmd[] = [...state.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((t) => ({
      id: `t-${t.id}`, label: t.title || t.entries[0]?.question || '新会话', hint: TERMS[t.mode].short, group: '会话', Icon: MessageCircle,
      run: () => navigate('ask', { t: t.id }),
    }));
    return [...(has ? base : base.slice(1)), ...pages, ...threads];
  }, [state.user, state.threads, dispatch, toggleSidebar]);

  const shown = cmds.filter((c) => !q.trim() || c.label.toLowerCase().includes(q.trim().toLowerCase()));
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  if (!palette) return null;
  const exec = (c?: Cmd) => { if (!c) return; setPalette(false); c.run(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); exec(shown[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); setPalette(false); }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-[#141413]/30 px-3 pt-[12vh] backdrop-blur-[2px] anim-fade" onMouseDown={() => setPalette(false)}>
      <div role="dialog" aria-modal="true" aria-label="命令面板" data-testid="palette" onMouseDown={(e) => e.stopPropagation()}
        className="anim-pop w-full max-w-[560px] overflow-hidden rounded-[12px] border border-line bg-paper shadow-[0_24px_60px_-12px_rgba(20,20,19,0.35)]">
        <div className="flex items-center gap-2 border-b border-line px-3.5">
          <Search size={16} className="text-muted" aria-hidden />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="搜索会话或输入命令…"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={shown[sel] ? `pc-${shown[sel].id}` : undefined}
            aria-label="搜索会话或命令" className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted" data-testid="palette-input" />
          <kbd className="kbd-light">Esc</kbd>
        </div>
        <ul id="palette-list" ref={listRef} role="listbox" aria-label="结果" className="max-h-[50vh] overflow-y-auto p-1.5">
          {shown.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">没有匹配的结果</li>}
          {shown.map((c, i) => {
            const header = c.group !== lastGroup ? (lastGroup = c.group) : '';
            return (
              <li key={c.id} role="presentation">
                {header && <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-muted" aria-hidden>{header}</p>}
                <div id={`pc-${c.id}`} role="option" aria-selected={i === sel} onMouseMove={() => setSel(i)} onClick={() => exec(c)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-2 text-[13.5px] ${i === sel ? 'bg-surface text-ink' : 'text-ink/80'}`}>
                  <c.Icon size={15} className="shrink-0 text-muted" aria-hidden />
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="text-[11px] text-muted">{c.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="flex gap-3 border-t border-line bg-surface/50 px-3.5 py-2 text-[11px] text-muted"><span>↑↓ 选择</span><span>Enter 执行</span><span>{MOD}K 随时打开</span></p>
      </div>
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useUI();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="anim-toast pointer-events-auto flex items-center gap-3 rounded-[8px] bg-[#1f1e1b] px-3.5 py-2 text-[13px] text-[#faf9f5] shadow-lg" data-testid="toast">
          <span>{t.text}</span>
          {t.action && (
            <button type="button" className="font-medium text-[#f0a48a] hover:underline" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  );
}
