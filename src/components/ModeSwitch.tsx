import { useRef, type KeyboardEvent } from 'react';
import { useStore } from '../state/store';
import { TERMS } from '../state/hooks';
import type { AstrologyMode } from '../lib/types';

const MODES: AstrologyMode[] = ['ziwei', 'western'];

/** 模式切换：radiogroup + 方向键，切换不刷新页面 */
export function ModeSwitch({ compact = false }: { compact?: boolean }) {
  const { state, dispatch } = useStore();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent, i: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? MODES.length - 1 : (i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + MODES.length) % MODES.length;
    dispatch({ type: 'setMode', mode: MODES[next] });
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="解读模式" className="inline-flex rounded-[4px] border border-line bg-surface p-0.5" data-testid="mode-switch">
      {MODES.map((m, i) => {
        const on = state.mode === m;
        return (
          <button
            key={m}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => dispatch({ type: 'setMode', mode: m })}
            onKeyDown={(e) => onKey(e, i)}
            className={`rounded-[3px] ${compact ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm'} font-medium transition-colors ${on ? 'bg-paper text-ink shadow-[0_0_0_1px_var(--line)]' : 'text-muted hover:text-ink'}`}
          >
            {TERMS[m].label}
          </button>
        );
      })}
    </div>
  );
}
