import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { useStore } from '../state/store';
import { navigate, TERMS, useMySnapshot } from '../state/hooks';
import { westernDaily, ziweiDaily, type DailyReading } from '../lib/astro/snapshot';
import { soulPalace, ZiweiHoroscopeError } from '../lib/astro/ziwei';
import { SIGNS, ZIWEI_STARS } from '../lib/content';
import { WesternWheel } from '../components/WesternWheel';
import { Empty, ModeBadge, Section } from '../components/ui';
import type { AstrologyMode, ChartSnapshot } from '../lib/types';

function dailyResult(snap: ChartSnapshot | null, mode: AstrologyMode, date: Date): { daily: DailyReading | null; error: string | null } {
  if (!snap) return { daily: null, error: null };
  try {
    return { daily: mode === 'ziwei' ? ziweiDaily(snap, date) : westernDaily(snap, date), error: null };
  } catch (error) {
    return {
      daily: null,
      error: error instanceof ZiweiHoroscopeError ? error.message : '命盘运限暂时无法计算，请到“我的”检查出生资料。',
    };
  }
}

function Insight({ snap, mode }: { snap: ChartSnapshot; mode: AstrologyMode }) {
  if (mode === 'western') {
    const { sun, moon, rising } = snap.western.bigThree;
    return (
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="w-32 shrink-0"><WesternWheel chart={snap.western} compact /></div>
        <dl className="grid flex-1 grid-cols-3 gap-2 text-center">
          {[['太阳', sun], ['月亮', moon], ['上升', snap.western.timeKnown ? rising : -1]].map(([k, v]) => (
            <div key={k as string} className="rounded-[4px] bg-surface p-2">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-0.5 text-[15px] font-semibold">{(v as number) >= 0 ? SIGNS[v as number].name : '未知'}</dd>
            </div>
          ))}
          <p className="col-span-3 text-left text-sm leading-relaxed text-muted">你是{SIGNS[sun].trait}的人，内心需要{SIGNS[moon].trait.split('、').slice(-1)[0]}的安全感。</p>
        </dl>
      </div>
    );
  }
  const soul = soulPalace(snap.ziwei);
  const main = soul.majorStars[0]?.name;
  const t = main ? ZIWEI_STARS[main] : undefined;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xl font-semibold text-mode">{soul.majorStars.map((s) => s.name).join(' · ') || '空宫'}</span>
        <span className="text-sm text-muted">坐命{soul.earthlyBranch}宫{soul.borrowed ? '（借对宫）' : ''} · {snap.ziwei.fiveElements}</span>
      </div>
      {t && <p className="mt-2 text-sm leading-relaxed">{t.gift}<span className="text-muted">{t.shadow}</span></p>}
      <div className="mt-3 flex flex-wrap gap-1.5">{t?.keywords.map((k) => <span key={k} className="chip">{k}</span>)}</div>
    </div>
  );
}

export function Home() {
  const { state } = useStore();
  const snap = useMySnapshot();
  const mode = state.mode;
  const today = useMemo(() => new Date(), []);
  const primary = useMemo(() => dailyResult(snap, mode, today), [snap, mode, today]);
  const daily = primary.daily;
  const other: AstrologyMode = mode === 'ziwei' ? 'western' : 'ziwei';
  const secondary = useMemo(() => (snap && state.user?.dualView ? dailyResult(snap, other, today) : { daily: null, error: null }), [snap, other, today, state.user?.dualView]);
  const otherDaily = secondary.daily;
  if (!snap || !daily) return <Empty>{primary.error ?? '命盘计算失败，请到“我的”检查出生资料。'}</Empty>;
  const T = TERMS[mode];
  const recent = state.recentFriendIds.map((id) => state.friends.find((f) => f.id === id)).filter(Boolean);

  return (
    <div className="grid gap-3" data-testid="home">
      {/* 顶部信息条 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ModeBadge mode={mode} />
          <span className="text-xs text-muted">{today.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })} · {T.today}</span>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate('ask')} className="btn-accent" data-testid="ask-entry">{T.ask}<ArrowRight size={14} aria-hidden /></button>
          <button type="button" onClick={() => navigate('chart')} className="btn-ghost">{T.chart}</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-3">
          <section className="panel" aria-labelledby="today-title">
            <header className="panel-head"><h2 className="text-[13px] font-semibold">{T.today}</h2><span className="text-xs text-muted">{mode === 'ziwei' ? '运限' : '行运'}</span></header>
            <div className="p-3 sm:p-4">
              <h1 id="today-title" className="text-xl font-semibold leading-snug sm:text-2xl" data-testid="daily-headline">{daily.headline}</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">{daily.body}</p>
              <div className="mt-3 flex flex-wrap gap-1">{daily.themes.map((t) => <span key={t} className="chip">{t}</span>)}</div>
            </div>
            <div className="border-t border-dashed border-line">
              {daily.influences.length ? (
                <ul className="grid sm:grid-cols-3 sm:divide-x sm:divide-dashed sm:divide-line" aria-label={T.influences}>
                  {daily.influences.map((i) => (
                    <li key={i.label} className="border-b border-dashed border-line p-3 last:border-b-0 sm:border-b-0">
                      <p className="glyph text-[13px] font-semibold text-mode">{i.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{i.detail}</p>
                    </li>
                  ))}
                </ul>
              ) : <div className="p-3"><Empty>今天没有紧密的行运相位。</Empty></div>}
            </div>
          </section>
          <Section title={mode === 'ziwei' ? '你的命宫' : '你的日月升'} kicker="主要洞察" id="insight" action={<button type="button" className="text-xs text-muted hover:text-ink" onClick={() => navigate('chart')}>{T.chart} ›</button>}>
            <Insight snap={snap} mode={mode} />
          </Section>
        </div>
        <div className="grid content-start gap-3">
          {otherDaily && (
            <section className="panel" data-mode={other} aria-label={`${TERMS[other].label}视角`} data-testid="dual-card">
              <header className="panel-head"><ModeBadge mode={other} /><span className="text-xs text-muted">另一视角</span></header>
              <div className="p-3">
                <p className="text-[15px] font-semibold leading-snug">{otherDaily.headline}</p>
                <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted">{otherDaily.body}</p>
              </div>
            </section>
          )}
          <Section title="最近查看的关系" id="recent" action={<button type="button" className="text-xs text-muted hover:text-ink" onClick={() => navigate('compat')}>全部 ›</button>}>
            {recent.length ? (
              <ul className="grid gap-1">
                {recent.map((f) => (
                  <li key={f!.id}>
                    <button type="button" className="flex w-full items-center gap-2 rounded-[3px] px-1.5 py-1 text-left text-sm hover:bg-surface" onClick={() => navigate('compat', { friend: f!.id })}>
                      <span className="grid h-5 w-5 place-items-center rounded-[3px] bg-mode-soft text-[11px]">{f!.name.slice(0, 1)}</span>
                      {f!.name}<span className="text-xs text-muted">{f!.relation}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <Empty>还没有查看过关系。去“关系”页添加一位朋友吧。</Empty>}
          </Section>
        </div>
      </div>
    </div>
  );
}
