// 对话页：多会话、工具步骤动画、打字机输出、停止 / 重新生成 / 编辑重问 / 复制、/ 命令、回到底部。
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { History, Pencil, Copy, ArrowDown, ArrowUp } from 'lucide-react';
import { SetupCard } from './Onboarding';
import { useStore, uid } from '../state/store';
import { navigate, safeSnapshot, TERMS, useMySnapshot } from '../state/hooks';
import { copyText, newChat, prefersReducedMotion, useUI } from '../state/ui';
import { westernSummary, ziweiSummary } from '../lib/astro/snapshot';
import { transits } from '../lib/astro/western';
import { computeZiweiHoroscope, ZiweiHoroscopeError } from '../lib/astro/ziwei';
import { compatibility } from '../lib/astro/compat';
import { interpret, InterpretError } from '../lib/ai/client';
import { ASPECT_INFO, pname } from '../lib/content';
import { Empty } from '../components/ui';
import { LogoMark } from '../components/Logo';
import { AnswerBody, Avatar, EntryStatus, Steps, ToolChip } from '../components/chat';
import { ComposerBox, ComposerDock, MAX_LEN, type SlashCmd } from '../components/Composer';
import type { AstrologyMode, InterpretationEntry, InterpretationRequest } from '../lib/types';

const SUGGEST: Record<AstrologyMode, string[]> = {
  ziwei: ['我的命宫说明我是什么样的人？', '今年的事业运怎么看？', '我的夫妻宫适合什么样的伴侣？', '财帛宫说明我怎样赚钱更顺？'],
  western: ['我的日月升说明了什么？', '最近的行运对我有什么影响？', '金星位置说明我怎样谈恋爱？', '我适合什么样的工作节奏？'],
};

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/** 首次进入：对话框照常显示，资料卡作为第一条 Agent 消息出现在输入框上方 */
function FirstRun() {
  return (
    <div className="-mx-2 -mt-4 pb-40 sm:-mx-6">
      <div className="subbar"><span className="flex items-center gap-1.5"><History size={13} aria-hidden />新会话</span><span>填完资料后即可提问</span></div>
      <div className="mx-auto max-w-[760px] px-3 pt-6 sm:px-6">
        <section className="fade-up flex gap-3">
          <Avatar dark><LogoMark size={18} /></Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">Dio delle Stelle</p>
            <h1 className="h-display mt-2 text-[18px]" data-testid="ask-title">你好，先告诉我你的出生资料</h1>
            <p className="mt-1 text-[14px] leading-7 text-ink/85">我会按出生地换算真太阳时，排出紫微命盘和西方星盘。保存后，你在下面的对话框里问什么，我都基于这份资料回答。</p>
            <SetupCard />
          </div>
        </section>
      </div>
      <ComposerDock note="填写并保存出生资料后，对话框会自动启用。">
        <div className="mx-auto flex max-w-[760px] items-end gap-2 rounded-[14px] border border-line bg-surface/60 p-2">
          <label htmlFor="question" className="sr-only">输入问题</label>
          <textarea id="question" rows={2} disabled placeholder="请先在上方填写出生资料" className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-muted focus:outline-none" data-testid="question-input" />
          <button type="button" disabled className="grid h-8 w-8 place-items-center rounded-full bg-[#c9c6ba] text-paper" aria-label="发送"><ArrowUp size={16} aria-hidden /></button>
        </div>
      </ComposerDock>
    </div>
  );
}
export function Ask({ params }: { params: URLSearchParams }) {
  const { state, dispatch } = useStore();
  const { toast } = useUI();
  const me = useMySnapshot();
  const tParam = params.get('t') ?? undefined;
  const thread = state.threads.find((t) => t.id === tParam);
  const mode: AstrologyMode = thread?.mode ?? state.mode;
  const T = TERMS[mode];
  const [draftFriend, setDraftFriend] = useState<string | undefined>(params.get('friend') ?? undefined);
  const friendId = thread ? thread.friendId : draftFriend;
  const friend = state.friends.find((f) => f.id === friendId);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [phase, setPhase] = useState<{ threadId: string; entryId: string; step: number } | null>(null);
  const [stream, setStream] = useState<{ threadId: string; entryId: string; shown: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [showDown, setShowDown] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const runToken = useRef<Record<string, number>>({});
  const atBottom = useRef(true);
  const lastT = useRef<string | undefined | null>(null);
  // 当前会话 id（新会话在 navigate 生效前先由 ask() 写入），busy 只看当前会话
  const [cur, setCur] = useState<string | undefined>(tParam);
  const curRef = useRef(cur); curRef.current = cur;
  useEffect(() => { setCur(tParam); }, [tParam]);
  const busy = (!!phase && phase.threadId === cur) || (!!stream && stream.threadId === cur);

  // 打开某个会话时，全局模式跟随会话；在会话里切换模式则开新会话
  useEffect(() => {
    if (!thread) { lastT.current = tParam; return; }
    if (lastT.current !== tParam) { lastT.current = tParam; if (thread.mode !== state.mode) dispatch({ type: 'setMode', mode: thread.mode }); return; }
    if (thread.mode !== state.mode) newChat();
  }, [tParam, thread, state.mode, dispatch]);

  // 从关系页带过来的 friend / q 参数
  useEffect(() => {
    const f = params.get('friend'); const qq = params.get('q');
    if (f) setDraftFriend(f);
    if (qq) setQ(qq);
  }, [params]);

  // “新会话”：清空本地输入状态
  useEffect(() => {
    const on = () => { setDraftFriend(undefined); setQ(''); setEditing(null); window.scrollTo({ top: 0 }); window.setTimeout(() => inputRef.current?.focus(), 0); };
    window.addEventListener('dio:new-chat', on);
    return () => window.removeEventListener('dio:new-chat', on);
  }, []);

  const steps = useMemo(() => {
    const year = new Date().getFullYear();
    const base = mode === 'ziwei' ? ['读取紫微本命盘', `推算大限与流年 ${year}`] : ['读取本命星盘', '计算今日行运'];
    if (friend) base.push(`对照 ${friend.name} 的命盘`);
    return [...base, '生成解读'];
  }, [mode, friend]);
  const tools = useMemo(() => {
    const base = mode === 'ziwei' ? ['本命盘', '大限', `流年 ${new Date().getFullYear()}`] : ['本命盘', '今日行运'];
    return friend ? [...base, `合盘 · ${friend.name}`] : base;
  }, [mode, friend]);

  const rows = useMemo<[string, string][]>(() => {
    if (!me) return [];
    if (mode === 'western') {
      const s = westernSummary(me);
      return [['太阳', s.sun], ['月亮', s.moon], ['上升', s.rising ?? '出生时间未知'], ['主要相位', s.aspects.slice(0, 3).join('、') || '—']];
    }
    const s = ziweiSummary(me);
    const m = s.natalMutagens;
    return [
      ['命宫', `${s.soulPalace.branch}（${s.soulPalace.stars.join('+') || '空宫'}${s.soulPalace.borrowed ? '，借对宫' : ''}）`],
      ['身宫', s.bodyPalace], ['五行局', s.fiveElements],
      ['生年四化', `${m.禄}禄、${m.权}权、${m.科}科、${m.忌}忌`],
    ];
  }, [me, mode]);
  const entries = thread?.entries ?? [];

  // 打字机：回答整段到达后按帧逐步显示，约 1 秒内放完
  useEffect(() => {
    if (!stream) return;
    const e = state.threads.find((x) => x.id === stream.threadId)?.entries.find((x) => x.id === stream.entryId);
    const total = e?.response?.answer.length ?? 0;
    if (!e?.response || stream.shown >= total) { setStream(null); return; }
    const step = Math.max(2, Math.ceil(total / 60));
    const id = window.setTimeout(() => setStream((s) => (s && s.entryId === stream.entryId ? { ...s, shown: Math.min(total, s.shown + step) } : s)), 16);
    return () => window.clearTimeout(id);
  }, [stream, state.threads]);

  // 切换 / 新建会话时，别的会话的打字机直接放完（全文已在 store 里），不阻塞新会话发送
  useEffect(() => { setStream((s) => (s && s.threadId !== tParam ? null : s)); }, [tParam]);

  // 是否在底部：决定自动滚动与“回到底部”按钮
  useEffect(() => {
    const on = () => {
      const gap = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      atBottom.current = gap < 120;
      setShowDown(gap > 240);
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [entries.length]);
  useEffect(() => {
    if (!entries.length || !atBottom.current) return;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: stream || prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [entries.length, phase?.step, stream?.shown]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc 停止生成
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!busy) return;
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) stopRef.current(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [busy]);

  if (!state.user) return <FirstRun />;
  if (!me) return <Empty>命盘计算失败，请检查出生资料。</Empty>;
  const user = state.user;
  const buildRequest = (question: string): InterpretationRequest => {
    const now = new Date();
    let currentTransits: string[];
    if (mode === 'western') {
      currentTransits = transits(me.western, now).slice(0, 5).map((t) => `行运${pname(t.transiting)}${ASPECT_INFO[t.type].name}本命${pname(t.natal)}`);
    } else {
      const h = computeZiweiHoroscope(me.resolved.solarDate, me.resolved.timeIndex, me.ziwei.gender, now);
      currentTransits = [`大限${h.decadalPalace}`, `流年${h.yearlyPalace}，${h.yearlyMutagens.禄}化禄、${h.yearlyMutagens.忌}化忌`, `流日${h.dailyPalace}`];
    }
    let relationship: InterpretationRequest['context']['relationship'];
    if (friend) {
      const fs = safeSnapshot(friend.id, friend.birth);
      if (fs) {
        const r = compatibility(mode, me, fs, user.name, friend.name);
        relationship = { friendName: friend.name, score: r.score, summary: r.summary, themes: r.themes };
      }
    }
    return { mode, question, profileId: user.id, context: { name: user.name, chartSummary: mode === 'western' ? westernSummary(me) : ziweiSummary(me), relationship, currentTransits } };
  };
  const requestOrNull = (question: string): InterpretationRequest | null => {
    try {
      return buildRequest(question);
    } catch (error) {
      toast(error instanceof ZiweiHoroscopeError ? error.message : '命盘暂时无法计算，请到“我的”检查出生资料。');
      return null;
    }
  };

  /** 执行一次解读：步骤动画与请求并行；runToken 保证“停止”或“重新生成”后旧结果不会写回 */
  const run = async (threadId: string, entry: InterpretationEntry, req: InterpretationRequest) => {
    const token = (runToken.current[entry.id] ?? 0) + 1;
    runToken.current[entry.id] = token;
    const live = () => runToken.current[entry.id] === token;
    const reduce = prefersReducedMotion();
    setPhase({ threadId, entryId: entry.id, step: 0 });
    const job = interpret(req).then((r) => ({ ok: true as const, r }), (e: unknown) => ({ ok: false as const, e }));
    for (let i = 1; i < steps.length; i++) {
      await sleep(reduce ? 0 : 380);
      if (!live()) return;
      setPhase((p) => (p?.entryId === entry.id ? { threadId, entryId: entry.id, step: i } : p));
    }
    const res = await job;
    if (!live()) return;
    setPhase((p) => (p?.entryId === entry.id ? null : p));
    if (res.ok) {
      dispatch({ type: 'updateEntry', threadId, entry: { ...entry, response: res.r } });
      if (!reduce && curRef.current === threadId) setStream({ threadId, entryId: entry.id, shown: 0 });
    } else {
      const msg = res.e instanceof InterpretError ? res.e.message : '解读失败了，请稍后再试。';
      dispatch({ type: 'updateEntry', threadId, entry: { ...entry, error: msg } });
    }
    inputRef.current?.focus();
  };

  const stop = () => {
    const target = phase?.threadId === cur ? phase : stream?.threadId === cur ? stream : null;
    if (!target) return;
    const id = target.entryId; const tid = target.threadId;
    runToken.current[id] = (runToken.current[id] ?? 0) + 1;
    const e = state.threads.find((t) => t.id === tid)?.entries.find((x) => x.id === id);
    if (e) {
      const entry = stream?.entryId === id && e.response
        ? { ...e, stopped: true, response: { ...e.response, answer: e.response.answer.slice(0, stream.shown) } }
        : { ...e, stopped: true };
      dispatch({ type: 'updateEntry', threadId: tid, entry });
    }
    setPhase((p) => (p?.entryId === id ? null : p)); setStream((x) => (x?.entryId === id ? null : x));
    toast('已停止生成');
  };
  stopRef.current = stop;

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    if (text.length > MAX_LEN) { toast(`问题请控制在 ${MAX_LEN} 字以内`); return; }
    const req = requestOrNull(text);
    if (!req) return;
    const entry: InterpretationEntry = { id: uid('e'), question: text, createdAt: new Date().toISOString() };
    const threadId = thread?.id ?? uid('t');
    setCur(threadId); curRef.current = threadId;
    dispatch({ type: 'addEntry', threadId, mode, friendId: friend?.id, title: thread ? thread.title : text.slice(0, 40), entry });
    if (!thread) navigate('ask', { t: threadId });
    setQ('');
    atBottom.current = true;
    void run(threadId, entry, req);
  };

  const regenerate = (e: InterpretationEntry) => {
    if (!thread || busy) return;
    const req = requestOrNull(e.question);
    if (!req) return;
    const fresh: InterpretationEntry = { id: e.id, question: e.question, createdAt: new Date().toISOString() };
    dispatch({ type: 'updateEntry', threadId: thread.id, entry: fresh });
    void run(thread.id, fresh, req);
  };

  const submitEdit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!thread || !editing || busy) return;
    const text = editing.text.trim();
    if (!text) return;
    const req = requestOrNull(text);
    if (!req) return;
    dispatch({ type: 'editEntry', threadId: thread.id, entryId: editing.id, question: text });
    setEditing(null);
    void run(thread.id, { id: editing.id, question: text, createdAt: new Date().toISOString() }, req);
  };

  const copy = async (text: string) => { toast((await copyText(text)) ? '已复制到剪贴板' : '复制失败，请手动选择文本'); };

  const switchMode = (m: AstrologyMode) => {
    if (m === mode) return;
    if (thread?.entries.length) toast(`已切到${TERMS[m].label}，开始新会话`);
    dispatch({ type: 'setMode', mode: m });
  };
  const withFriend = (id: string) => {
    if (thread?.entries.length) { newChat(); window.setTimeout(() => setDraftFriend(id), 0); } else setDraftFriend(id);
  };
  const slash: SlashCmd[] = [
    { cmd: '/new', label: '新会话', run: newChat },
    { cmd: '/ziwei', label: '切到中华玄学（紫微）', run: () => switchMode('ziwei') },
    { cmd: '/western', label: '切到西方占星', run: () => switchMode('western') },
    ...state.friends.map((f) => ({ cmd: `/with-${f.name}`, label: `加入与${f.name}的关系上下文`, run: () => withFriend(f.id) })),
    { cmd: '/chart', label: '打开命盘', run: () => navigate('chart') },
  ];
  const recall = () => { const last = entries[entries.length - 1]; if (last && !busy) setEditing({ id: last.id, text: last.question }); };

  const agentName = `Dio delle Stelle · ${T.short}`;
  return (
    <div className="-mx-2 -mt-4 pb-48 sm:-mx-6">
      <div className="subbar" data-testid="ask-context">
        <span className="flex items-center gap-1.5"><History size={13} aria-hidden />{thread ? `${entries.length} 个历史项` : '新会话'}</span>
        <span className="flex flex-wrap items-center gap-1.5"><span>本会话调用</span>{tools.map((t) => <ToolChip key={t}>{t}</ToolChip>)}</span>
      </div>

      <div className="mx-auto max-w-[760px] px-3 pt-6 sm:px-6">
        <section className="fade-up flex gap-3 border-b border-line pb-6">
          <Avatar dark><LogoMark size={18} /></Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold">{agentName}</p>
            <h1 className="h-display mt-2 text-[18px]" data-testid="ask-title">{T.ask}</h1>
            <p className="mt-1 text-[14px] leading-7 text-ink/85">{T.askHint}{friend ? `，并参考你和${friend.name}的合盘` : ''}。</p>
            <h2 className="h-display mt-4 text-[16px]">命盘核心特征速览</h2>
            <table className="md-table mt-2 max-w-[420px]">
              <thead><tr><th scope="col">项目</th><th scope="col">内容</th></tr></thead>
              <tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
            </table>
            {entries.length === 0 && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="推荐问题">
                {SUGGEST[mode].map((s, i) => (
                  <li key={s} className="fade-up" style={{ animationDelay: `${80 + i * 50}ms` }}>
                    <button type="button" className="press w-full rounded-[8px] border border-line bg-paper px-3 py-2 text-left text-[13px] hover:-translate-y-px hover:border-[#d9b98f] hover:bg-[#fbf3e8]" onClick={() => ask(s)} data-testid="suggestion">{s}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <ol className="grid" aria-live="polite" aria-busy={busy || undefined} data-testid="answers">
          {entries.map((e, idx) => {
            const isLast = idx === entries.length - 1;
            const inPhase = phase?.entryId === e.id ? phase.step : null;
            const shown = stream?.entryId === e.id ? stream.shown : undefined;
            const pending = !e.response && !e.error && inPhase === null;
            const shownEntry = pending && !e.stopped ? { ...e, stopped: true } : e;
            return (
              <li key={e.id} className="fade-up border-b border-line py-6">
                <div className="group flex gap-3">
                  <Avatar>{user.name.slice(0, 1)}</Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold">{user.name}</p>
                    {editing?.id === e.id ? (
                      <form onSubmit={submitEdit} className="anim-fade mt-1.5 rounded-[10px] border border-[#c9b89c] bg-paper p-2" data-testid="edit-form">
                        <label htmlFor={`edit-${e.id}`} className="sr-only">编辑问题</label>
                        <textarea id={`edit-${e.id}`} autoFocus rows={2} maxLength={MAX_LEN} value={editing.text} onChange={(ev) => setEditing({ id: e.id, text: ev.target.value })}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Escape') { ev.preventDefault(); setEditing(null); }
                            if (ev.key === 'Enter' && !ev.shiftKey && !ev.nativeEvent.isComposing) { ev.preventDefault(); submitEdit(ev); }
                          }}
                          className="block w-full resize-none bg-transparent px-1.5 py-1 text-[14px] leading-6 focus:outline-none" />
                        <div className="mt-1 flex justify-end gap-1.5">
                          <button type="button" className="btn-ghost press py-1 text-xs" onClick={() => setEditing(null)}>取消</button>
                          <button type="submit" className="btn-primary press py-1 text-xs" disabled={!editing.text.trim() || busy}>重新提问</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="mt-1 whitespace-pre-wrap text-[14px] leading-7">{e.question}</p>
                        <span className="msg-actions mt-0.5 flex gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                          <button type="button" className="icon-btn press h-7 w-7" aria-label="编辑并重新提问" title="编辑并重新提问" disabled={busy} onClick={() => setEditing({ id: e.id, text: e.question })} data-testid="edit-question"><Pencil size={13} aria-hidden /></button>
                          <button type="button" className="icon-btn press h-7 w-7" aria-label="复制问题" title="复制问题" onClick={() => void copy(e.question)}><Copy size={13} aria-hidden /></button>
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <Avatar dark><LogoMark size={18} /></Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold">{agentName}</p>
                    {(inPhase !== null || e.response) && <Steps steps={steps} active={inPhase} />}
                    {e.response
                      ? <AnswerBody entry={e} shown={shown} onCopy={() => void copy(e.response!.answer)} onRegenerate={isLast && !busy ? () => regenerate(e) : undefined} />
                      : <EntryStatus entry={shownEntry} onRetry={isLast && !busy ? () => regenerate(e) : undefined} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <ComposerDock note={`${agentName} 可能会犯错；重要决定请结合现实信息判断。`}
        above={showDown && entries.length > 0 && (
          <button type="button" aria-label="回到底部" onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })}
            className="anim-fade press grid h-8 w-8 place-items-center rounded-full border border-line bg-paper text-ink shadow-md hover:bg-surface" data-testid="scroll-down"><ArrowDown size={15} aria-hidden /></button>
        )}>
        <ComposerBox value={q} setValue={setQ} onSend={() => ask(q)} onStop={stop} busy={busy}
          mode={mode} onMode={switchMode} friends={state.friends} friendId={friend?.id} onFriend={setDraftFriend} friendLocked={!!thread?.entries.length}
          slash={slash} onRecall={recall} inputRef={inputRef} />
      </ComposerDock>
    </div>
  );
}
