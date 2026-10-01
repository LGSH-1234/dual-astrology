import { useState } from 'react';
import { BirthForm } from '../components/BirthForm';
import { useStore } from '../state/store';
import { TERMS } from '../state/hooks';
import type { AstrologyMode } from '../lib/types';

/** 首次进入时嵌在对话里的资料卡：填完资料后直接在同一个对话框提问 */
export function SetupCard() {
  const { dispatch } = useStore();
  const [mode, setMode] = useState<AstrologyMode>('ziwei');

  return (
    <div className="mt-3 rounded-[8px] border border-line bg-paper" data-testid="setup-card">
      <div className="flex items-center justify-between gap-2 border-b border-dashed border-line px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">填写出生资料</h2>
        <button type="button" className="text-[12px] text-accent-ink hover:underline" onClick={() => dispatch({ type: 'loadDemo' })} data-testid="load-demo">
          先用演示资料
        </button>
      </div>
      <div className="p-4">
        <fieldset className="mb-4">
          <legend className="label">解读方式</legend>
          <div className="flex gap-2">
            {(['ziwei', 'western'] as AstrologyMode[]).map((m) => (
              <label key={m} className={`flex-1 cursor-pointer rounded-[4px] border px-3 py-1.5 text-center text-sm ${mode === m ? 'border-ink bg-surface font-medium' : 'border-line text-muted'}`}>
                <input type="radio" name="default-mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
                {TERMS[m].label}
              </label>
            ))}
          </div>
        </fieldset>
        <BirthForm
          submitLabel="保存并开始对话"
          onSubmit={(v) => {
            dispatch({
              type: 'setUser',
              user: { id: 'me', name: v.name, birth: v.birth, defaultMode: mode, dualView: true, createdAt: new Date().toISOString() },
            });
            dispatch({ type: 'setMode', mode });
          }}
        />
        <p className="mt-3 text-xs leading-relaxed text-muted">填写后可随时在「我的」中修改，也可以先用演示资料体验。</p>
      </div>
    </div>
  );
}
