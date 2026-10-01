import { useEffect, useMemo, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { useStore, uid } from '../state/store';
import { navigate, safeSnapshot, TERMS, useMySnapshot } from '../state/hooks';
import { compatibility } from '../lib/astro/compat';
import { BirthForm } from '../components/BirthForm';
import { Empty, ModeBadge, Section } from '../components/ui';
import type { CompatibilityItem } from '../lib/types';

function List({ items, tone }: { items: CompatibilityItem[]; tone: 'good' | 'bad' | 'talk' }) {
  if (!items.length) return <Empty>没有明显的条目。</Empty>;
  const dot = tone === 'good' ? 'bg-accent' : tone === 'bad' ? 'bg-[#8a2f2a]' : 'bg-muted';
  return (
    <ul className="grid gap-2.5">
      {items.map((i) => (
        <li key={i.title} className="flex gap-2.5">
          <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
          <div><p className="text-sm font-medium">{i.title}</p><p className="text-xs leading-relaxed text-muted">{i.detail}</p></div>
        </li>
      ))}
    </ul>
  );
}

export function Compat({ params }: { params: URLSearchParams }) {
  const { state, dispatch } = useStore();
  const me = useMySnapshot();
  const [friendId, setFriendId] = useState(params.get('friend') ?? state.friends[0]?.id ?? '');
  const [adding, setAdding] = useState(state.friends.length === 0);
  const friend = state.friends.find((f) => f.id === friendId);
  const mode = state.mode;

  useEffect(() => { if (friend) dispatch({ type: 'viewFriend', id: friend.id }); }, [friend?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const f = params.get('friend'); if (f) setFriendId(f); }, [params]);

  const report = useMemo(() => {
    if (!me || !friend || !state.user) return null;
    const fs = safeSnapshot(friend.id, friend.birth);
    return fs ? compatibility(mode, me, fs, state.user.name, friend.name) : null;
  }, [me, friend, mode, state.user]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">关系兼容性</h1>
          <p className="text-sm text-muted">当前使用 {TERMS[mode].compat}，顶部切换模式即可换一套分析逻辑。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip text-ink">{state.user?.name}</span>
          <span aria-hidden className="text-muted">×</span>
          <label className="sr-only" htmlFor="friend-select">选择朋友</label>
          <select id="friend-select" className="input w-auto" value={friendId} onChange={(e) => setFriendId(e.target.value)} disabled={!state.friends.length}>
            {state.friends.map((f) => <option key={f.id} value={f.id}>{f.name}（{f.relation}）</option>)}
          </select>
          <button type="button" className="btn-ghost" onClick={() => setAdding((x) => !x)} aria-expanded={adding}><Plus size={15} aria-hidden />添加朋友</button>
        </div>
      </div>

      {adding && (
        <Section title="添加朋友" id="add-friend">
          <BirthForm withRelation submitLabel="保存" onCancel={state.friends.length ? () => setAdding(false) : undefined}
            onSubmit={(v) => {
              const id = uid('f');
              dispatch({ type: 'upsertFriend', friend: { id, name: v.name, relation: v.relation || '好友', birth: v.birth } });
              setFriendId(id);
              setAdding(false);
            }} />
        </Section>
      )}

      {report && friend ? (
        <div className="grid gap-4 lg:grid-cols-3" data-testid="compat-report" data-report-mode={report.mode}>
          <section className="card flex flex-col items-center p-5 text-center lg:row-span-2" aria-labelledby="score-title">
            <ModeBadge mode={mode} />
            <h2 id="score-title" className="sr-only">关系摘要</h2>
            <svg viewBox="0 0 120 120" className="my-4 h-36 w-36" role="img" aria-label={`契合度 ${report.score} 分`}>
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" strokeWidth="8" />
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--mode)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${(report.score / 100) * 314} 314`} transform="rotate(-90 60 60)" />
              <text x="60" y="58" textAnchor="middle" fontSize="28" fontWeight="600" fill="var(--ink)" data-testid="compat-score">{report.score}</text>
              <text x="60" y="78" textAnchor="middle" fontSize="10" fill="var(--muted)">契合度</text>
            </svg>
            <p className="h-serif text-lg">{report.summary}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">{report.themes.map((t) => <span key={t} className="chip">{t}</span>)}</div>
            <button type="button" className="btn-primary mt-5"
              onClick={() => navigate('ask', { friend: friend.id, q: `我和${friend.name}的关系该怎么经营？` })}>
              <Sparkles size={15} aria-hidden />AI 深度解读
            </button>
          </section>
          <Section title="优势" id="strengths"><List items={report.strengths} tone="good" /></Section>
          <Section title="冲突" id="conflicts"><List items={report.conflicts} tone="bad" /></Section>
          <div className="lg:col-span-2"><Section title="沟通主题" id="talk"><List items={report.communication} tone="talk" /></Section></div>
        </div>
      ) : !adding && <Empty>先添加一位朋友，看看你们的关系。</Empty>}
    </div>
  );
}
