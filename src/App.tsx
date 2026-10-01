import { useEffect, useRef } from 'react';
import { StoreProvider, useStore } from './state/store';
import { navigate, useHashRoute } from './state/hooks';
import { Layout } from './components/Layout';
import { UIProvider, useUI } from './state/ui';
import { AuthProvider, useAuth } from './state/auth';
import { LogoMark } from './components/Logo';
import { Home } from './pages/Home';
import { Chart } from './pages/Chart';
import { Compat } from './pages/Compat';
import { Ask } from './pages/Ask';
import { Profile } from './pages/Profile';
import { AuthPage, type AuthKind } from './pages/AuthPage';
import type { Route } from './state/hooks';
import { AppErrorBoundary } from './components/ErrorBoundary';

const AUTH_ROUTES: Route[] = ['login', 'register', 'forgot', 'reset'];

function Router() {
  const { state } = useStore();
  const { route, params } = useHashRoute();
  const auth = useAuth();
  const { toast } = useUI();

  // 模式写到根节点，CSS 变量随之切换强调色
  useEffect(() => { document.documentElement.dataset.mode = state.mode; }, [state.mode]);
  // 和 Agent 产品一样，一进来就是对话框；没填资料时其他页面都回到对话
  useEffect(() => {
    if (route === 'onboarding' || AUTH_ROUTES.includes(route) || (!state.user && route !== 'ask')) navigate('ask');
  }, [state.user, route]);
  useEffect(() => { window.scrollTo(0, 0); }, [route]);
  // 登录 / 注册后的一次性提示（例如游客数据已并入）
  // StrictMode 下 effect 会跑两次，用 ref 防止同一条提示弹两次
  const shown = useRef<string | null>(null);
  useEffect(() => {
    const n = auth.notice;
    if (!n || shown.current === n) return;
    shown.current = n;
    toast(n);
    auth.clearNotice();
  }, [auth.notice]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = !state.user || route === 'onboarding' || AUTH_ROUTES.includes(route) ? 'ask' : route;
  const page = {
    home: <Home />,
    chart: <Chart />,
    compat: <Compat params={params} />,
    ask: <Ask params={params} />,
    profile: <Profile />,
  }[current as 'home'];
  return <Layout route={current} activeThread={params.get('t') ?? undefined}>{page}</Layout>;
}

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center" data-testid="splash" aria-busy="true">
      <LogoMark size={40} className="auth-mark text-ink" />
    </div>
  );
}

/**
 * 未登录（且不是游客）一律进登录页；已登录访问登录 / 注册 / 找回页时回到对话。
 * 游客可以主动打开这些页面。重置密码链接任何状态下都能打开（可能是给另一个账号重置）。
 */
function Shell() {
  const auth = useAuth();
  const { route, params } = useHashRoute();
  const onAuthRoute = AUTH_ROUTES.includes(route);
  const isReset = route === 'reset';

  useEffect(() => {
    if (auth.status === 'anon' && !onAuthRoute) navigate('login');
    if (auth.status === 'authed' && onAuthRoute && !isReset) navigate('ask');
  }, [auth.status, onAuthRoute, isReset]);

  if (auth.status === 'loading') return <Splash />;
  if (isReset) return <AuthPage kind="reset" token={params.get('token') ?? ''} />;
  if (auth.status === 'anon' || (auth.status === 'guest' && onAuthRoute)) {
    return <AuthPage kind={(onAuthRoute ? route : 'login') as AuthKind} />;
  }
  if (onAuthRoute) return <Splash />;
  // key：换账号时整棵状态树按新的存储键重新加载
  return (
    <StoreProvider key={auth.storageKey} storageKey={auth.storageKey} onChange={auth.onStateChange}>
      <UIProvider>
        <Router />
      </UIProvider>
    </StoreProvider>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
