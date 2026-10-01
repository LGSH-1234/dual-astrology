// 对话 UI 片段：头像、工具调用步骤、回答正文（打字机）、消息操作。
import { useState, type ReactNode } from 'react';
import { AlertCircle, Check, ChevronRight, Copy, Loader2, RotateCcw, Sparkles } from 'lucide-react';
import { ConfidenceBadge, ProviderBadge } from './ui';
import type { InterpretationEntry } from '../lib/types';

export function Avatar({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${dark ? 'bg-[#1f1e1b] text-[#faf9f5]' : 'border border-line bg-paper text-ink'}`}>{children}</span>
  );
}

export function ToolChip({ children }: { children: string }) {
  return <span className="tool-chip"><Sparkles size={11} aria-hidden />{children}</span>;
}

/** 工具调用步骤：进行中逐条打勾；完成后折叠成一行，可展开查看（参考 Claude Code / Codex 的 tool call 展示） */
export function Steps({ steps, active }: { steps: string[]; active: number | null }) {
  const [open, setOpen] = useState(false);
  if (active === null) {
    return (
      <div className="mt-1">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="press flex items-center gap-1 rounded-[4px] text-[12px] text-muted hover:text-ink" data-testid="steps-toggle">
          <ChevronRight size={13} className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`} aria-hidden />已完成 {steps.length} 个步骤
        </button>
        {open && (
          <ul className="anim-menu mt-1.5 grid gap-1 border-l border-line pl-3" data-testid="steps-detail">
            {steps.map((s) => <li key={s} className="flex items-center gap-1.5 text-[12px] text-muted"><Check size={12} className="text-[#4d6b3c]" aria-hidden />{s}</li>)}
          </ul>
        )}
      </div>
    );
  }
  return (
    <ul className="mt-2 grid gap-1.5" aria-label="解读进度" data-testid="steps">
      {steps.map((s, i) => (
        <li key={s} className={`flex items-center gap-2 text-[13px] transition-opacity ${i > active ? 'opacity-40' : ''} ${i === active ? 'text-ink' : 'text-muted'}`}>
          <span className="grid h-4 w-4 place-items-center">
            {i < active ? <Check size={13} className="check-pop text-[#4d6b3c]" aria-hidden />
              : i === active ? <Loader2 size={13} className="animate-spin text-accent-ink" aria-hidden />
                : <span className="h-1.5 w-1.5 rounded-full bg-[#c9c6ba]" aria-hidden />}
          </span>
          <span className={i === active ? 'shimmer-text' : ''}>{s}{i === active ? '…' : ''}</span>
        </li>
      ))}
    </ul>
  );
}

function ActionBtn({ label, onClick, children, testid }: { label: string; onClick: () => void; children: ReactNode; testid?: string }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="icon-btn press h-7 w-7" data-testid={testid}>{children}</button>;
}

/** 回答正文：shown 有值时只显示前 shown 个字（打字机），结束后再出现徽章与操作 */
export function AnswerBody({ entry, shown, onCopy, onRegenerate }: { entry: InterpretationEntry; shown?: number; onCopy: () => void; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false);
  const r = entry.response!;
  const streaming = shown !== undefined && shown < r.answer.length;
  const paras = (streaming ? r.answer.slice(0, shown) : r.answer).split(/\n+/);
  const copy = () => { onCopy(); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  return (
    <div data-testid="answer" data-source-mode={r.sourceMode} aria-busy={streaming || undefined}>
      {r.notice && (
        <p className="anim-fade mt-3 flex items-center gap-1.5 rounded-[6px] bg-accent-soft px-2.5 py-1.5 text-xs" role="status" data-testid="notice"><AlertCircle size={14} aria-hidden />{r.notice}</p>
      )}
      <div className="mt-3 space-y-3 text-[14px] leading-7">
        {paras.map((p, i) => <p key={i}>{p}{streaming && i === paras.length - 1 && <span className="stream-caret" aria-hidden />}</p>)}
      </div>
      {entry.stopped && <p className="mt-2 text-[12px] text-muted" data-testid="stopped">已停止生成</p>}
      {!streaming && (
        <div className="anim-fade mt-3 flex flex-wrap items-center gap-1.5">
          <ProviderBadge p={r.provider} />
          <ConfidenceBadge c={r.confidence} />
          {r.themes.map((t) => <span key={t} className="chip">{t}</span>)}
          <span className="msg-actions ml-auto flex items-center gap-0.5">
            <ActionBtn label={copied ? '已复制' : '复制回答'} onClick={copy} testid="copy-answer">{copied ? <Check size={14} className="check-pop text-[#4d6b3c]" aria-hidden /> : <Copy size={14} aria-hidden />}</ActionBtn>
            {onRegenerate && <ActionBtn label="重新生成" onClick={onRegenerate} testid="regenerate"><RotateCcw size={14} aria-hidden /></ActionBtn>}
          </span>
        </div>
      )}
    </div>
  );
}

/** 等待 / 出错 / 已停止 三种非回答状态 */
export function EntryStatus({ entry, onRetry }: { entry: InterpretationEntry; onRetry?: () => void }) {
  if (entry.error) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#8a2f2a]" role="alert">
        <AlertCircle size={15} aria-hidden />{entry.error}
        {onRetry && <button type="button" className="btn-ghost press py-0.5 text-xs" onClick={onRetry}><RotateCcw size={12} aria-hidden />重试</button>}
      </div>
    );
  }
  if (entry.stopped) {
    return (
      <div className="mt-2 flex items-center gap-2 text-sm text-muted" data-testid="stopped">
        已停止生成
        {onRetry && <button type="button" className="btn-ghost press py-0.5 text-xs" onClick={onRetry}><RotateCcw size={12} aria-hidden />重新生成</button>}
      </div>
    );
  }
  return null;
}
