import { useId, useState, type FormEvent } from 'react';
import { normalizeCityId, regionChain } from '../data/cities';
import { LocationPicker } from './LocationPicker';
import { isValidCalendarDate, localDateString, resolveBirth } from '../lib/astro/time';
import { validateZiweiHoroscope } from '../lib/astro/ziwei';
import type { BirthProfile, Gender } from '../lib/types';

export interface BirthFormValue { name: string; relation?: string; birth: BirthProfile }

/** 出生资料表单，Onboarding、编辑资料和添加好友共用 */
export function BirthForm({
  initial, submitLabel, onSubmit, withRelation = false, onCancel,
}: {
  initial?: BirthFormValue;
  submitLabel: string;
  onSubmit: (v: BirthFormValue) => void;
  withRelation?: boolean;
  onCancel?: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [relation, setRelation] = useState(initial?.relation ?? '好友');
  const [date, setDate] = useState(initial?.birth.date ?? '');
  const [time, setTime] = useState(initial?.birth.time ?? '12:00');
  const [timeKnown, setTimeKnown] = useState(initial?.birth.timeKnown ?? true);
  const [cityId, setCityId] = useState(normalizeCityId(initial?.birth.cityId));
  const [gender, setGender] = useState<Gender>(initial?.birth.gender ?? '女');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('请填写名字');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('请填写出生日期');
    const y = Number(date.slice(0, 4));
    if (y < 1900 || y > 2100) return setError('出生年份需在 1900–2100 之间');
    if (!isValidCalendarDate(date)) return setError('出生日期无效');
    if (date > localDateString()) return setError('出生日期不能晚于今天');
    if (timeKnown && !/^\d{2}:\d{2}$/.test(time)) return setError('请填写出生时间');
    if (timeKnown) {
      const [hour, minute] = time.split(':').map(Number);
      if (hour > 23 || minute > 59) return setError('出生时间无效');
    }
    const chain = regionChain(cityId);
    if (!chain.length) return setError('请选择出生地点');
    if (chain.length === 1 && chain[0].d?.length) return setError('请继续选择城市或区县');
    const birth: BirthProfile = { date, time: timeKnown ? time : '12:00', timeKnown, cityId, gender };
    try {
      const resolved = resolveBirth(birth);
      const horoscopeError = validateZiweiHoroscope(resolved.solarDate, resolved.timeIndex, gender);
      if (horoscopeError) return setError(horoscopeError);
    } catch {
      return setError('出生资料无法计算，请检查日期、时间和地点。');
    }
    setError('');
    onSubmit({ name: name.trim().slice(0, 20), relation: withRelation ? relation.trim().slice(0, 10) : undefined, birth });
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate aria-describedby={error ? `${id}-err` : undefined}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${id}-name`}>名字</label>
          <input id={`${id}-name`} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="怎么称呼" autoComplete="nickname" />
        </div>
        {withRelation ? (
          <div>
            <label className="label" htmlFor={`${id}-rel`}>关系</label>
            <input id={`${id}-rel`} className="input" value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="好友 / 同事 / 伴侣" />
          </div>
        ) : (
          <fieldset>
            <legend className="label">性别（紫微排大限需要）</legend>
            <div className="flex gap-2">
              {(['女', '男'] as Gender[]).map((g) => (
                <label key={g} className={`flex-1 cursor-pointer rounded-[4px] border px-3 py-2 text-center text-sm ${gender === g ? 'border-ink bg-surface font-medium' : 'border-line text-muted'}`}>
                  <input type="radio" name={`${id}-g`} value={g} checked={gender === g} onChange={() => setGender(g)} className="sr-only" />
                  {g}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </div>
      {withRelation && (
        <fieldset>
          <legend className="label">性别（紫微排大限需要）</legend>
          <div className="flex gap-2">
            {(['女', '男'] as Gender[]).map((g) => (
              <label key={g} className={`flex-1 cursor-pointer rounded-[4px] border px-3 py-2 text-center text-sm ${gender === g ? 'border-ink bg-surface font-medium' : 'border-line text-muted'}`}>
                <input type="radio" name={`${id}-g`} value={g} checked={gender === g} onChange={() => setGender(g)} className="sr-only" />
                {g}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${id}-date`}>出生日期（公历）</label>
          <input id={`${id}-date`} type="date" className="input" value={date} min="1900-01-01" max={localDateString()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-time`}>出生时间（当地钟表时间）</label>
          <input id={`${id}-time`} type="time" className="input" value={time} disabled={!timeKnown} onChange={(e) => setTime(e.target.value)} />
          <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={!timeKnown} onChange={(e) => setTimeKnown(!e.target.checked)} />
            不清楚出生时间
          </label>
        </div>
      </div>
      <LocationPicker id={id} value={cityId} onChange={setCityId} />
      {error && <p id={`${id}-err`} role="alert" className="text-sm text-[#8a2f2a]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary">{submitLabel}</button>
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>取消</button>}
      </div>
    </form>
  );
}
