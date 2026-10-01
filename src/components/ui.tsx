import type { ReactNode } from 'react';
import type { AstrologyMode, InterpretationResponse } from '../lib/types';
import { TERMS } from '../state/hooks';

export function Section({ title, kicker, action, children, id }: { title: string; kicker?: string; action?: ReactNode; children: ReactNode; id?: string }) {
  // 面板：细边框 + 虚线分隔的标题栏（参考 react-iztro 盘心样式）
  return (
    <section className="panel min-w-0" aria-labelledby={id}>
      <header className="panel-head">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 id={id} className="truncate text-[13px] font-semibold">{title}</h2>
          {kicker && <span className="truncate text-xs text-muted">{kicker}</span>}
        </div>
        {action}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function ModeBadge({ mode }: { mode: AstrologyMode }) {
  return (
    <span className="chip border-transparent bg-mode-soft text-ink" data-mode={mode}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-mode" />
      {TERMS[mode].label}
    </span>
  );
}

const CONF: Record<NonNullable<InterpretationResponse['confidence']>, string> = { low: '参考度低', medium: '参考度中', high: '参考度高' };
export function ConfidenceBadge({ c }: { c?: InterpretationResponse['confidence'] }) {
  if (!c) return null;
  return <span className="chip">{CONF[c]}</span>;
}

const PROVIDER: Record<string, string> = { mock: '演示解读', deepseek: 'AI 解读', 'local-mock': '演示解读' };
export function ProviderBadge({ p }: { p?: string }) {
  if (!p) return null;
  return <span className="chip">{PROVIDER[p] ?? p}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[4px] border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

export const MUTAGEN_STYLE: Record<string, string> = {
  禄: 'bg-[#4d6b3c] text-white',
  权: 'bg-[#9c4223] text-white',
  科: 'bg-[#3d5a73] text-white',
  忌: 'bg-[#1f1e1b] text-white',
};
