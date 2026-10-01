// 底部输入框：自动增高、/ 命令菜单、模式与关系上下文选择、字数、发送/停止。
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { ArrowUp, Square, Users, X, ChevronDown, Check } from 'lucide-react';
import { TERMS } from '../state/hooks';
import type { AstrologyMode, FriendProfile } from '../lib/types';

export interface SlashCmd { cmd: string; label: string; run: () => void }

export const MAX_LEN = 500;

/** 固定在底部，跟随侧栏宽度 */
export function ComposerDock({ children, note, above }: { children: ReactNode; note: string; above?: ReactNode }) {
  return (
    <div className="composer-pos fixed bottom-0 right-0 z-20 bg-gradient-to-t from-paper via-paper to-transparent px-3 pb-2 pt-6 md:pb-3">
      {above && <div className="absolute -top-6 left-1/2 -translate-x-1/2">{above}</div>}
      {children}
      <p className="mx-auto mt-1.5 max-w-[760px] text-center text-[10.5px] text-muted">{note}</p>
    </div>
  );
}

function Popover({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.parentElement?.contains(e.target as Node)) onClose(); };
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} role="menu" aria-label={label} className="anim-menu absolute bottom-full left-0 z-30 mb-2 min-w-[200px] overflow-hidden rounded-[10px] border border-line bg-paper p-1 shadow-[0_12px_32px_-8px_rgba(20,20,19,0.25)]">
      {children}
    </div>
  );
}

function MenuItem({ on, onClick, children }: { on?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={!!on} onClick={onClick} className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[13px] hover:bg-surface">
      <span className="flex-1 truncate">{children}</span>{on && <Check size={13} className="text-accent-ink" aria-hidden />}
    </button>
  );
}

interface Props {
  value: string; setValue: (v: string) => void; onSend: () => void; onStop: () => void; busy: boolean;
  mode: AstrologyMode; onMode: (m: AstrologyMode) => void;
  friends: FriendProfile[]; friendId?: string; onFriend: (id?: string) => void; friendLocked: boolean;
  slash: SlashCmd[]; onRecall: () => void; inputRef: RefObject<HTMLTextAreaElement>;
}

export function ComposerBox(p: Props) {
  const [menu, setMenu] = useState<'mode' | 'friend' | null>(null);
  const [sel, setSel] = useState(0);
  const friend = p.friends.find((f) => f.id === p.friendId);
  const slashOpen = p.value.startsWith('/') && !p.value.includes('\n');
  const shown = slashOpen ? p.slash.filter((c) => c.cmd.startsWith(p.value.trim().split(/\s/)[0] || '/')) : [];
  useEffect(() => { setSel(0); }, [p.value]);

  // 自动增高：最多 8 行左右，超出滚动
  useLayoutEffect(() => {
    const el = p.inputRef.current; if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 200)}px`;
  }, [p.value, p.inputRef]);

  const runSlash = (c?: SlashCmd) => { if (!c) return; p.setValue(''); c.run(); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (shown.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % shown.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + shown.length) % shown.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); runSlash(shown[sel]); return; }
      if (e.key === 'Escape') { e.preventDefault(); p.setValue(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!p.busy) p.onSend(); return; }
    if (e.key === 'ArrowUp' && !p.value) { e.preventDefault(); p.onRecall(); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); if (p.busy) p.onStop(); else p.onSend(); };
  const len = p.value.length;

  return (
    <form onSubmit={submit} className="composer relative mx-auto max-w-[760px] rounded-[14px] border border-line bg-paper shadow-[0_2px_14px_rgba(20,20,19,0.07)] transition-[border-color,box-shadow] focus-within:border-[#c9b89c] focus-within:shadow-[0_4px_22px_rgba(20,20,19,0.10)]">
      {shown.length > 0 && (
        <ul role="listbox" aria-label="命令" className="anim-menu absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-[10px] border border-line bg-paper p-1 shadow-[0_12px_32px_-8px_rgba(20,20,19,0.25)]" data-testid="slash-menu">
          {shown.map((c, i) => (
            <li key={c.cmd} role="option" aria-selected={i === sel} onMouseDown={(e) => { e.preventDefault(); runSlash(c); }} onMouseMove={() => setSel(i)}
              className={`flex cursor-pointer items-center gap-3 rounded-[7px] px-2.5 py-1.5 text-[13px] ${i === sel ? 'bg-surface' : ''}`}>
              <code className="min-w-[96px] font-mono text-[12px] text-accent-ink">{c.cmd}</code><span className="text-muted">{c.label}</span>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor="question" className="sr-only">输入问题</label>
      <textarea id="question" ref={p.inputRef} rows={1} value={p.value} maxLength={MAX_LEN} onChange={(e) => p.setValue(e.target.value)} onKeyDown={onKey}
        placeholder="问点什么…  输入 / 查看命令，Shift + Enter 换行" className="block w-full resize-none bg-transparent px-3.5 pt-3 text-[14px] leading-6 placeholder:text-muted focus:outline-none" data-testid="question-input" />
      <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
        <div className="relative">
          <button type="button" className="press flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[12px] hover:bg-surface" aria-haspopup="menu" aria-expanded={menu === 'mode'} onClick={() => setMenu(menu === 'mode' ? null : 'mode')} data-testid="mode-pill">
            <span className={`h-1.5 w-1.5 rounded-full ${p.mode === 'ziwei' ? 'bg-[#d97757]' : 'bg-[#5e5d59]'}`} aria-hidden />{TERMS[p.mode].label}<ChevronDown size={12} aria-hidden />
          </button>
          <Popover open={menu === 'mode'} onClose={() => setMenu(null)} label="解读体系">
            {(['ziwei', 'western'] as const).map((m) => <MenuItem key={m} on={p.mode === m} onClick={() => { setMenu(null); p.onMode(m); }}>{TERMS[m].label}</MenuItem>)}
          </Popover>
        </div>
        <div className="relative min-w-0">
          {friend ? (
            <span className="tool-chip h-7 max-w-[160px]" data-testid="friend-chip">
              <Users size={12} aria-hidden /><span className="truncate">与{friend.name}</span>
              {!p.friendLocked && <button type="button" aria-label={`移除与${friend.name}的关系上下文`} onClick={() => p.onFriend(undefined)} className="-mr-1 rounded-full p-0.5 hover:bg-[#f0dfc6]"><X size={11} aria-hidden /></button>}
            </span>
          ) : !p.friendLocked && p.friends.length > 0 && (
            <button type="button" className="press flex h-7 items-center gap-1 rounded-full px-2 text-[12px] text-muted hover:bg-surface hover:text-ink" aria-haspopup="menu" aria-expanded={menu === 'friend'} onClick={() => setMenu(menu === 'friend' ? null : 'friend')} data-testid="friend-pill">
              <Users size={13} aria-hidden /><span className="hidden sm:inline">加入关系</span>
            </button>
          )}
          <Popover open={menu === 'friend'} onClose={() => setMenu(null)} label="关系上下文">
            {p.friends.map((f) => <MenuItem key={f.id} onClick={() => { setMenu(null); p.onFriend(f.id); p.inputRef.current?.focus(); }}>{f.name}<span className="ml-1 text-muted">· {f.relation}</span></MenuItem>)}
          </Popover>
        </div>
        <span className={`ml-auto text-[11px] tabular-nums transition-opacity ${len > MAX_LEN * 0.8 ? 'text-accent-ink opacity-100' : 'text-muted opacity-0'}`} aria-live="polite">{len}/{MAX_LEN}</span>
        <button type="submit" disabled={!p.busy && !p.value.trim()} aria-label={p.busy ? '停止生成' : '发送'} title={p.busy ? '停止生成 (Esc)' : '发送 (Enter)'} data-testid={p.busy ? 'stop' : 'send'}
          className={`press grid h-8 w-8 place-items-center rounded-full text-paper disabled:cursor-not-allowed disabled:bg-[#c9c6ba] ${p.busy ? 'bg-ink' : 'bg-accent-ink hover:bg-[#8f3a20]'}`}>
          {p.busy ? <Square size={12} fill="currentColor" aria-hidden /> : <ArrowUp size={16} aria-hidden />}
        </button>
      </div>
    </form>
  );
}
