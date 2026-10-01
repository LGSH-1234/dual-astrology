// 登录 / 注册 / 找回密码 / 重置密码：桌面左侧深色品牌区 + 右侧表单；移动端只显示表单。
// 几页共用一个组件，切换时保留已输入的邮箱。
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { navigate } from '../state/hooks';
import { EXPIRED_NOTICE, useAuth } from '../state/auth';
import { passwordStrength, validateEmail, validatePassword } from '../lib/authRules';
import { EmailConfirmationRequired } from '../lib/auth';

const STRENGTH = ['', '弱', '一般', '较强', '强'];

export type AuthKind = 'login' | 'register' | 'forgot' | 'reset';
const HEAD: Record<AuthKind, string> = { login: '欢迎回来', register: '创建账号', forgot: '找回密码', reset: '设置新密码' };
const DOC: Record<AuthKind, string> = { login: '登录', register: '注册', forgot: '找回密码', reset: '重置密码' };
const SUBMIT: Record<AuthKind, string> = { login: '登录', register: '注册并开始', forgot: '生成重置链接', reset: '保存新密码并登录' };
const BUSY: Record<AuthKind, string> = { login: '正在登录…', register: '正在创建…', forgot: '正在生成…', reset: '正在保存…' };

export function AuthPage({ kind, token = '' }: { kind: AuthKind; token?: string }) {
  const auth = useAuth();
  const isReg = kind === 'register';
  const isForgot = kind === 'forgot';
  const isReset = kind === 'reset';
  /** 需要设置新密码（带强度条和确认框）的页面 */
  const newPw = isReg || isReset;
  const [sent, setSent] = useState<null | 'email' | 'console'>(null);
  const [expired, setExpired] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [field, setField] = useState<'email' | 'pw' | 'pw2' | null>(null);
  const [shake, setShake] = useState(false);
  const [caps, setCaps] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const pw2Ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setError(null); setField(null); setPw(''); setPw2(''); setSent(null); setConfirmation(null);
    (isReset ? pwRef : emailRef).current?.focus();
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = `${DOC[kind]} · Dio delle Stelle`; return () => { document.title = 'Dio delle Stelle · 星神'; }; }, [kind]);
  // 会话过期的提示显示在登录页上方
  useEffect(() => {
    if (auth.notice === EXPIRED_NOTICE) { setExpired(true); auth.clearNotice(); }
  }, [auth.notice]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (msg: string, f: typeof field) => {
    setError(msg);
    setField(f);
    // 先移除再加回 class，重复出错也能重新抖动
    setShake(false);
    requestAnimationFrame(() => setShake(true));
    const ref = f === 'email' ? emailRef : f === 'pw' ? pwRef : f === 'pw2' ? pw2Ref : null;
    window.setTimeout(() => ref?.current?.focus(), 0);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!isReset) {
      const ve = validateEmail(email);
      if (ve) return fail(ve, 'email');
    }
    if (newPw) {
      const vp = validatePassword(pw);
      if (vp) return fail(vp, 'pw');
      if (pw !== pw2) return fail('两次输入的密码不一致', 'pw2');
    } else if (!isForgot && !pw) return fail('请输入密码', 'pw');
    setBusy(true);
    setError(null);
    try {
      if (isForgot) {
        setSent(await auth.forgot(email));
        setBusy(false);
        return;
      }
      if (isReset) await auth.resetPassword(token, pw);
      else await (isReg ? auth.register(email, pw) : auth.login(email, pw));
      navigate('ask');
    } catch (err) {
      if (err instanceof EmailConfirmationRequired) {
        setConfirmation(err.message);
        setBusy(false);
        return;
      }
      const m = (err as Error).message || '出错了，请重试';
      fail(m, /邮箱已注册/.test(m) || isForgot ? 'email' : 'pw');
      setBusy(false);
    }
  };

  const guest = () => { auth.continueAsGuest(); navigate('ask'); };
  const strength = passwordStrength(pw);
  const onKey = (e: KeyboardEvent) => setCaps(e.getModifierState?.('CapsLock') ?? false);
  const err = (f: typeof field) => (field === f ? { 'aria-invalid': true as const, 'aria-describedby': 'auth-error' } : {});

  return (
    <div className="grid min-h-screen md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" data-testid="auth-page" data-kind={kind}>
      {/* 品牌区（桌面） */}
      <aside className="sidebar relative hidden flex-col justify-between overflow-hidden p-10 md:flex" aria-hidden>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[8px] border border-white/15 bg-white/5"><LogoMark size={24} /></span>
          <span className="h-display text-[17px]">Dio delle Stelle</span>
        </div>
        <div className="auth-hero">
          <LogoMark size={88} className="auth-mark mb-8 text-[#faf9f5]" />
          <p className="h-display text-[34px] leading-[1.25]">问一颗星，<br />也问一张命盘。</p>
          <p className="mt-4 max-w-sm text-[14px] leading-6 text-white/55">紫微斗数与西方占星放在同一个对话里。填一次出生资料，随时提问。</p>
        </div>
        <ul className="grid gap-2 text-[12.5px] text-white/45">
          <li>· 紫微斗数与西方占星一键切换</li>
          <li>· 保存你的命盘、关系和对话</li>
          <li>· 仅供娱乐与自我探索，不构成任何专业建议</li>
        </ul>
      </aside>

      {/* 表单区 */}
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[380px] anim-fade" key={kind}>
          <div className="mb-8 flex items-center gap-2.5 md:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-[8px] bg-[#1f1e1b] text-[#faf9f5]"><LogoMark size={24} /></span>
            <span className="h-display text-[17px]">Dio delle Stelle</span>
          </div>

          <h1 className="h-display text-[28px] leading-tight">{HEAD[kind]}</h1>
          {confirmation && <p role="status" className="mt-3 rounded-[6px] bg-surface px-3 py-2 text-[13px] leading-6">{confirmation}</p>}
          <p className="mt-2 text-[13.5px] text-muted">
            {isForgot ? '输入注册时的邮箱，我们会生成一个重置链接。' : isReset ? '链接 30 分钟内有效，只能使用一次。' : isReg ? '已有账号？' : '还没有账号？'}
            {(kind === 'login' || isReg) && (
              <a href={isReg ? '#/login' : '#/register'} className="ml-1 font-medium text-accent-ink underline-offset-4 hover:underline" data-testid="auth-switch">
                {isReg ? '去登录' : '注册一个'}
              </a>
            )}
          </p>
          {expired && kind === 'login' && (
            <p role="status" className="mt-3 rounded-[6px] border border-line bg-surface px-3 py-2 text-[12px] leading-5 text-ink" data-testid="auth-notice">
              {EXPIRED_NOTICE}
            </p>
          )}
          {auth.backend === 'local' && (
            <p className="mt-3 rounded-[6px] bg-surface px-3 py-2 text-[12px] leading-5 text-muted" data-testid="local-note">
              {isForgot || isReset
                ? '当前无法发送重置邮件，请重新注册或继续体验。'
                : '可以先直接体验，之后再创建账号。'}
            </p>
          )}

          {isReset && !token && (
            <p role="alert" className="mt-4 text-[12.5px] text-[#8a2f2a]" data-testid="auth-error">重置链接不完整，请重新申请。</p>
          )}

          {isForgot && sent ? (
            <div className="mt-6 grid gap-3 rounded-[8px] border border-line bg-surface p-4 text-[13px] leading-6" role="status" data-testid="forgot-sent">
              <p>如果 <span className="font-medium">{email.trim()}</span> 已注册，重置链接已经生成，30 分钟内有效。</p>
              <p className="text-muted">请使用重置链接完成设置；如果没有收到，请稍后重新申请。</p>
              <a href="#/login" className="font-medium text-accent-ink underline-offset-4 hover:underline" data-testid="back-login">返回登录</a>
            </div>
          ) : (isReset && !token) ? null : (

          <form noValidate onSubmit={submit} className={`mt-6 grid gap-4 ${shake ? 'auth-shake' : ''}`} onAnimationEnd={() => setShake(false)} aria-label={DOC[kind]}>
            {!isReset && (
              <div>
                <label htmlFor="auth-email" className="label">邮箱</label>
                <input id="auth-email" ref={emailRef} data-testid="auth-email" type="email" inputMode="email" autoComplete="email"
                  className="input py-2" placeholder="you@example.com" value={email} disabled={busy}
                  onChange={(e) => { setEmail(e.target.value); if (field === 'email') setError(null); }} {...err('email')} />
              </div>
            )}

            {!isForgot && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="auth-password" className="label mb-0">{isReset ? '新密码' : '密码'}</label>
                  {newPw && pw && (
                    <span className="text-[11px] text-muted" data-testid="pw-strength" aria-live="polite">强度：{STRENGTH[strength] || '弱'}</span>
                  )}
                  {kind === 'login' && (
                    <a href="#/forgot" className="text-[11.5px] text-muted underline-offset-4 hover:text-ink hover:underline" data-testid="forgot-link">忘记密码？</a>
                  )}
                </div>
                <div className="relative">
                  <input id="auth-password" ref={pwRef} data-testid="auth-password" type={show ? 'text' : 'password'}
                    autoComplete={newPw ? 'new-password' : 'current-password'} className="input py-2 pr-10"
                    placeholder={newPw ? '至少 8 位，包含字母和数字' : '输入密码'} value={pw} disabled={busy}
                    onKeyUp={onKey} onKeyDown={onKey}
                    onChange={(e) => { setPw(e.target.value); if (field === 'pw') setError(null); }} {...err('pw')} />
                  <button type="button" className="icon-btn absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2" data-testid="toggle-password"
                    onClick={() => setShow((v) => !v)} aria-label={show ? '隐藏密码' : '显示密码'} aria-pressed={show}>
                    {show ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                  </button>
                </div>
                {newPw && (
                  <div className="mt-2 grid grid-cols-4 gap-1" aria-hidden>
                    {[1, 2, 3, 4].map((i) => (
                      <span key={i} className={`h-1 rounded-full transition-colors duration-300 ${strength >= i ? (strength <= 1 ? 'bg-[#c2410c]' : strength === 2 ? 'bg-accent' : 'bg-[#4d6b3c]') : 'bg-line'}`} />
                    ))}
                  </div>
                )}
                {caps && <p className="mt-1.5 text-[11.5px] text-accent-ink">大写锁定已开启</p>}
              </div>
            )}

            {newPw && (
              <div>
                <label htmlFor="auth-password2" className="label">确认密码</label>
                <input id="auth-password2" ref={pw2Ref} data-testid="auth-password2" type={show ? 'text' : 'password'} autoComplete="new-password"
                  className="input py-2" placeholder="再输入一次" value={pw2} disabled={busy}
                  onChange={(e) => { setPw2(e.target.value); if (field === 'pw2') setError(null); }} {...err('pw2')} />
              </div>
            )}

            <p id="auth-error" role="alert" data-testid="auth-error" className={`min-h-[18px] text-[12.5px] text-[#8a2f2a] ${error ? '' : 'invisible'}`}>{error ?? ' '}</p>

            <button type="submit" className="btn-primary press -mt-2 h-10 w-full text-[14px]" disabled={busy || ((isForgot || isReset) && auth.backend === 'local')} data-testid="auth-submit">
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
              {busy ? BUSY[kind] : SUBMIT[kind]}
              {!busy && <ArrowRight size={15} aria-hidden />}
            </button>
          </form>
          )}

          {(isReset || (isForgot && !sent)) && (
            <p className="mt-4 text-center text-[12.5px] text-muted">
              想起来了？<a href="#/login" className="ml-1 font-medium text-accent-ink underline-offset-4 hover:underline" data-testid="to-login">返回登录</a>
            </p>
          )}

          {(kind === 'login' || isReg) && (
            <>
              <div className="my-6 flex items-center gap-3 text-[11.5px] text-muted" aria-hidden>
                <span className="h-px flex-1 bg-line" />或<span className="h-px flex-1 bg-line" />
              </div>
              <button type="button" className="btn-ghost h-10 w-full" onClick={guest} data-testid="continue-guest" disabled={busy}>
                {auth.status === 'guest' ? '继续以游客身份使用' : '先以游客身份体验'}
              </button>
              <p className="mt-2 text-center text-[11.5px] leading-5 text-muted">可以先体验，之后注册账号即可继续使用。</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
