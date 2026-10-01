import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, LogOut, Pencil, Trash2 } from 'lucide-react';
import { useStore } from '../state/store';
import { useAuth } from '../state/auth';
import { useUI } from '../state/ui';
import { validatePassword } from '../lib/authRules';
import { navigate, TERMS } from '../state/hooks';
import { fetchStatus, type ServiceStatus } from '../lib/ai/client';
import { cityLabel, getCity } from '../data/cities';
import { BirthForm } from '../components/BirthForm';
import { Empty, ModeBadge, Section } from '../components/ui';
import type { FriendProfile } from '../lib/types';

export function Profile() {
  const { state, dispatch } = useStore();
  const auth = useAuth();
  const u = state.user!;
  const [editing, setEditing] = useState(false);
  const [editFriend, setEditFriend] = useState<FriendProfile | null>(null);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => { void fetchStatus().then(setStatus); }, []);
  const city = getCity(u.birth.cityId);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <h1 className="text-lg font-semibold lg:col-span-2">我的</h1>

      <Section title="出生资料" id="birth" action={!editing && <button type="button" className="btn-ghost py-1" onClick={() => setEditing(true)}><Pencil size={14} aria-hidden />编辑</button>}>
        {editing ? (
          <BirthForm initial={{ name: u.name, birth: u.birth }} submitLabel="保存" onCancel={() => setEditing(false)}
            onSubmit={(v) => { dispatch({ type: 'setUser', user: { ...u, name: v.name, birth: v.birth } }); setEditing(false); }} />
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm" data-testid="birth-summary">
            <div><dt className="text-xs text-muted">名字</dt><dd>{u.name}</dd></div>
            <div><dt className="text-xs text-muted">性别</dt><dd>{u.birth.gender}</dd></div>
            <div><dt className="text-xs text-muted">出生</dt><dd>{u.birth.date} {u.birth.timeKnown ? u.birth.time : '时间未知'}</dd></div>
            <div><dt className="text-xs text-muted">地点</dt><dd data-testid="profile-place">{cityLabel(city)}</dd></div>
          </dl>
        )}
      </Section>

      <Section title="偏好" id="prefs">
        <div className="grid gap-3 text-sm">
          <p className="flex items-center gap-2">当前模式 <ModeBadge mode={state.mode} /></p>
          <label className="flex items-center gap-2">
            默认模式
            <select className="input w-auto" value={u.defaultMode} onChange={(e) => dispatch({ type: 'setUser', user: { ...u, defaultMode: e.target.value as typeof u.defaultMode } })}>
              <option value="ziwei">{TERMS.ziwei.label}</option>
              <option value="western">{TERMS.western.label}</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={u.dualView} onChange={(e) => dispatch({ type: 'setUser', user: { ...u, dualView: e.target.checked } })} />
            首页同时查看两种解读
          </label>
        </div>
      </Section>

      <Section title="好友" id="friends">
        {editFriend ? (
          <BirthForm withRelation initial={{ name: editFriend.name, relation: editFriend.relation, birth: editFriend.birth }} submitLabel="保存" onCancel={() => setEditFriend(null)}
            onSubmit={(v) => { dispatch({ type: 'upsertFriend', friend: { ...editFriend, name: v.name, relation: v.relation || '好友', birth: v.birth } }); setEditFriend(null); }} />
        ) : state.friends.length ? (
          <ul className="divide-y divide-line" data-testid="friend-list">
            {state.friends.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <button type="button" className="min-w-0 truncate text-left hover:underline" onClick={() => navigate('compat', { friend: f.id })}>{f.name}<span className="ml-1.5 text-xs text-muted">{f.relation} · {f.birth.date}</span></button>
                <span className="flex shrink-0 gap-1">
                  <button type="button" className="rounded-full p-1.5 hover:bg-surface" aria-label={`编辑${f.name}`} onClick={() => setEditFriend(f)}><Pencil size={14} aria-hidden /></button>
                  <button type="button" className="rounded-full p-1.5 hover:bg-surface" aria-label={`删除${f.name}`} onClick={() => dispatch({ type: 'removeFriend', id: f.id })}><Trash2 size={14} aria-hidden /></button>
                </span>
              </li>
            ))}
          </ul>
        ) : <Empty>还没有好友。</Empty>}
      </Section>

      <Section title="解读历史" id="history" action={state.threads.length > 0 && <button type="button" className="btn-ghost py-1" onClick={() => dispatch({ type: 'clearHistory' })}>清空</button>}>
        {state.threads.length ? (
          <ul className="grid gap-2 text-sm">
            {state.threads.slice(0, 8).map((t) => (
              <li key={t.id} className="rounded-[4px] bg-surface p-2.5">
                <p className="flex items-center justify-between gap-2"><span className="truncate font-medium">{t.title}</span><ModeBadge mode={t.mode} /></p>
                <p className="mt-1 truncate text-xs text-muted">{t.entries[t.entries.length - 1]?.question}</p>
              </li>
            ))}
          </ul>
        ) : <Empty>还没有解读记录。</Empty>}
      </Section>

      <Section title="解读状态" id="ai-status">
        <p className="text-sm" data-testid="ai-status">
          {status ? (<><span className={`mr-2 inline-block h-2 w-2 rounded-full ${status.reachable ? 'bg-[#4d6b3c]' : 'bg-accent'}`} aria-hidden />{status.message}</>) : '检查中…'}
        </p>
      </Section>

      <Section title="账号" id="account">
        {auth.user ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium" data-testid="account-email">{auth.user.email}</p>
              <p className="mt-0.5 text-xs text-muted">
                已登录账号 · 资料与偏好已保存
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" data-testid="change-password-toggle" aria-expanded={pwOpen}
                onClick={() => setPwOpen((v) => !v)}><KeyRound size={14} aria-hidden />修改密码</button>
              <button type="button" className="btn-ghost" data-testid="profile-logout"
                onClick={() => { void auth.logout().then(() => navigate('login')); }}><LogOut size={14} aria-hidden />退出登录</button>
            </div>
            {pwOpen && <ChangePassword onDone={() => setPwOpen(false)} />}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">你正在以游客身份使用，注册后可以继续保留当前资料。</p>
            <div className="flex gap-2">
              <a href="#/register" className="btn-primary">注册</a>
              <a href="#/login" className="btn-ghost">登录</a>
            </div>
          </div>
        )}
      </Section>

      <Section title="数据说明" id="privacy">
        <div className="space-y-2 text-sm leading-relaxed text-muted">
          <p>你可以随时编辑出生资料、管理好友，并清除解读历史。</p>
          <p>本作品用于娱乐与自我探索，不构成医疗、法律、投资建议。</p>
        </div>
        <div className="mt-4">
          {confirm ? (
            <div className="flex flex-wrap items-center gap-2" role="alertdialog" aria-label="确认清除数据">
              <span className="text-sm">将删除所有资料、好友和历史，无法恢复。</span>
              <button type="button" className="btn bg-[#8a2f2a] text-white" onClick={() => { dispatch({ type: 'reset' }); navigate('ask'); }} data-testid="confirm-clear">确认清除</button>
              <button type="button" className="btn-ghost" onClick={() => setConfirm(false)}>取消</button>
            </div>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => setConfirm(true)} data-testid="clear-data"><Trash2 size={14} aria-hidden />清除全部数据</button>
          )}
        </div>
      </Section>
    </div>
  );
}

/** 修改密码：校验当前密码；服务端账号成功后其他设备需要重新登录。 */
function ChangePassword({ onDone }: { onDone: () => void }) {
  const auth = useAuth();
  const { toast } = useUI();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const err = !cur ? '请输入当前密码' : validatePassword(next) ?? (next !== next2 ? '两次输入的新密码不一致' : null);
    if (err) return setError(err);
    setBusy(true);
    setError(null);
    try {
      await auth.changePassword(cur, next);
      toast(auth.user?.backend === 'server' ? '密码已修改，其他设备需要重新登录' : '密码已修改');
      onDone();
    } catch (x) {
      setError((x as Error).message || '修改失败，请重试');
      setBusy(false);
    }
  };

  return (
    <form noValidate onSubmit={submit} className="grid w-full gap-3 border-t border-line pt-4 sm:grid-cols-3" data-testid="change-password" aria-label="修改密码">
      {/* 帮助密码管理器识别是哪个账号 */}
      <input type="email" autoComplete="username" value={auth.user?.email ?? ''} readOnly hidden />
      <div>
        <label htmlFor="pw-current" className="label">当前密码</label>
        <input id="pw-current" type="password" autoComplete="current-password" className="input py-2" value={cur}
          onChange={(e) => setCur(e.target.value)} disabled={busy} data-testid="pw-current" />
      </div>
      <div>
        <label htmlFor="pw-next" className="label">新密码</label>
        <input id="pw-next" type="password" autoComplete="new-password" className="input py-2" placeholder="至少 8 位，含字母和数字" value={next}
          onChange={(e) => setNext(e.target.value)} disabled={busy} data-testid="pw-next" />
      </div>
      <div>
        <label htmlFor="pw-next2" className="label">确认新密码</label>
        <input id="pw-next2" type="password" autoComplete="new-password" className="input py-2" value={next2}
          onChange={(e) => setNext2(e.target.value)} disabled={busy} data-testid="pw-next2" />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <button type="submit" className="btn-primary" disabled={busy} data-testid="pw-submit">{busy ? '正在保存…' : '保存新密码'}</button>
        <button type="button" className="btn-ghost" onClick={onDone} disabled={busy}>取消</button>
        <p role="alert" className="text-[12.5px] text-[#8a2f2a]" data-testid="pw-error">{error}</p>
      </div>
    </form>
  );
}
