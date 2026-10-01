import { cityLabel } from '../data/cities';
import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { TERMS, useMySnapshot } from '../state/hooks';
import { WesternWheel } from '../components/WesternWheel';
import { Iztrolabe } from '../vendor/react-iztro/Iztrolabe';
import { Empty, MUTAGEN_STYLE, Section } from '../components/ui';
import { ASPECT_INFO, HOUSES, MUTAGEN_TEXT, PALACES, PLANET_INFO, SIGNS, ZIWEI_STARS, fmtDeg, pname, signName } from '../lib/content';
import { buildAstrolabe, soulPalace } from '../lib/astro/ziwei';
import { fmtOffset } from '../lib/astro/time';
import type { ChartSnapshot, Mutagen } from '../lib/types';

function BirthNotes({ snap }: { snap: ChartSnapshot }) {
  const r = snap.resolved;
  return (
    <div className="text-xs leading-relaxed text-muted">
      <p>{cityLabel(r.city)} · UTC{fmtOffset(r.offsetMinutes)} · 真太阳时 {r.solarDate} {r.solarTime}</p>
      {r.notes.map((n) => <p key={n}>{n}</p>)}
    </div>
  );
}

function WesternView({ snap }: { snap: ChartSnapshot }) {
  const w = snap.western;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" data-testid="western-chart">
      <Section title="本命星盘" kicker={`${w.houseSystem} 宫位制`} id="wheel">
        <div className="mx-auto max-w-[420px]"><WesternWheel chart={w} /></div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {([['太阳', w.bigThree.sun], ['月亮', w.bigThree.moon], ['上升', w.timeKnown ? w.bigThree.rising : -1]] as const).map(([k, v]) => (
            <div key={k} className="rounded-[4px] bg-surface p-2">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="h-serif">{v >= 0 ? signName(v) : '未知'}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3"><BirthNotes snap={snap} /></div>
      </Section>
      <div className="grid content-start gap-4">
        <Section title="行星位置" id="planets">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">行星所在星座、度数和宫位</caption>
              <thead><tr className="text-left text-xs text-muted"><th className="py-1 font-medium">行星</th><th className="font-medium">星座</th><th className="font-medium">度数</th><th className="font-medium">宫位</th></tr></thead>
              <tbody className="divide-y divide-line">
                {w.planets.map((p) => (
                  <tr key={p.key}>
                    <td className="py-1.5"><span className="glyph mr-1.5 text-mode">{PLANET_INFO[p.key].glyph}{'︎'}</span>{pname(p.key)}{p.retrograde && <span className="ml-1 text-xs text-accent-ink" title="逆行">℞</span>}</td>
                    <td>{SIGNS[p.sign].name}</td>
                    <td className="tabular-nums text-muted">{fmtDeg(p.degree)}</td>
                    <td>{w.timeKnown ? `${p.house} 宫` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="主要相位" id="aspects">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {w.aspects.slice(0, 12).map((a, i) => (
              <li key={i} className="flex items-center justify-between rounded-[4px] bg-surface px-2.5 py-1.5 text-sm">
                <span>{pname(a.a)} <span className={ASPECT_INFO[a.type].tone === 'hard' ? 'text-[#8a2f2a]' : 'text-accent-ink'}>{ASPECT_INFO[a.type].name}</span> {pname(a.b)}</span>
                <span className="text-xs tabular-nums text-muted">{a.orb.toFixed(1)}°</span>
              </li>
            ))}
          </ul>
        </Section>
        {w.timeKnown && (
          <Section title="十二宫" id="houses">
            <ol className="grid gap-1 text-sm sm:grid-cols-2">
              {w.cusps.map((c, i) => (
                <li key={i} className="flex justify-between gap-2 border-b border-line py-1">
                  <span><span className="mr-1 text-xs text-muted">{i + 1}</span>{HOUSES[i]}</span>
                  <span className="shrink-0 text-xs text-muted">{signName(Math.floor(c / 30))} {fmtDeg(c % 30)}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}
      </div>
    </div>
  );
}

function ZiweiView({ snap }: { snap: ChartSnapshot }) {
  const z = snap.ziwei;
  const [sel, setSel] = useState(soulPalace(z).index);
  const r = snap.resolved;
  const astrolabe = useMemo(() => buildAstrolabe(r.solarDate, r.timeIndex, z.gender), [r.solarDate, r.timeIndex, z.gender]);
  const p = z.palaces[sel];
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]" data-testid="ziwei-chart">
      <div className="min-w-0">
        <div className="overflow-x-auto" data-testid="ziwei-scroll">
          <div className="min-w-[720px]">
            <Iztrolabe astrolabe={astrolabe} selected={sel} onSelect={setSel} />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted">点宫位看详情；点宫名设太极点，点宫干看飞化，点大限/流年等标签切换运限。窄屏可左右滑动。</p>
        <div className="mt-2"><BirthNotes snap={snap} /></div>
      </div>
      <div className="grid content-start gap-4">
        <Section title={p.name} kicker={`${p.heavenlyStem}${p.earthlyBranch} · 大限 ${p.decadal[0]}–${p.decadal[1]} 岁`} id="palace-detail">
          <p className="text-sm text-muted">{PALACES[p.name]}{p.isSoul && ' 这是你的命宫。'}{p.isBody && ' 身宫在此，后天努力的重心。'}</p>
          {p.borrowed && <p className="mt-2 text-xs text-muted">本宫无主星，借对宫{z.palaces[(p.index + 6) % 12].name}的主星来看。</p>}
          <ul className="mt-3 grid gap-3" data-testid="palace-stars">
            {p.majorStars.map((s) => {
              const t = ZIWEI_STARS[s.name];
              return (
                <li key={s.name}>
                  <p className="font-medium text-mode">{s.name}{s.brightness && <span className="ml-1 text-xs font-normal text-muted">{s.brightness}</span>}{s.mutagen && <span className={`ml-1 rounded px-1 text-xs ${MUTAGEN_STYLE[s.mutagen]}`}>化{s.mutagen}</span>}</p>
                  {t && <p className="mt-0.5 text-sm leading-relaxed">{t.gift} <span className="text-muted">{t.advice}</span></p>}
                </li>
              );
            })}
            {p.majorStars.length === 0 && <li className="text-sm text-muted">空宫，且对宫也无主星。</li>}
          </ul>
          {(p.minorStars.length > 0 || p.adjectiveStars.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.minorStars.map((s) => <span key={s.name} className="chip text-ink">{s.name}{s.mutagen ? `·${s.mutagen}` : ''}</span>)}
              {p.adjectiveStars.slice(0, 6).map((s) => <span key={s.name} className="chip">{s.name}</span>)}
            </div>
          )}
        </Section>
        <Section title="本命四化" id="mutagens">
          <ul className="grid grid-cols-2 gap-2">
            {(['禄', '权', '科', '忌'] as Mutagen[]).map((m) => (
              <li key={m} className="rounded-[4px] bg-surface p-2.5">
                <p className="text-sm"><span className={`mr-1.5 rounded px-1 text-xs ${MUTAGEN_STYLE[m]}`}>{MUTAGEN_TEXT[m].name}</span>{z.natalMutagens[m]}</p>
                <p className="mt-1 text-xs text-muted">{MUTAGEN_TEXT[m].meaning}</p>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

export function Chart() {
  const { state } = useStore();
  const snap = useMySnapshot();
  if (!snap) return <Empty>命盘计算失败，请检查出生资料。</Empty>;
  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">{TERMS[state.mode].chart}<span className="ml-2 text-base font-normal text-muted">{state.user?.name}</span></h1>
      {state.mode === 'western' ? <WesternView snap={snap} /> : <ZiweiView snap={snap} />}
    </div>
  );
}
