// 外壳：左侧会话栏（可折叠 / 移动端抽屉）+ 右侧主区；全局快捷键、命令面板、Toast。
import { useEffect, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Menu, PanelLeftOpen, SquarePen } from 'lucide-react';
import { ModeSwitch } from './ModeSwitch';
import { Brand, SidebarBody } from './Sidebar';
import { CommandPalette, Toaster } from './CommandPalette';
import { type Route } from '../state/hooks';
import { useStore } from '../state/store';
import { MOD, SB_MIN, newChat, sbMax, useUI } from '../state/ui';

const TITLE: Record<Route, [string, string]> = {
  onboarding: ['开始', ''],
  home: ['今日运势', '按真太阳时排盘，每天的解读都基于你的命盘。'],
  chart: ['我的命盘', '从两种传统里，看看同一份出生资料呈现出的不同侧面。'],
  compat: ['关系合盘', '两张盘放在一起看相处方式，不打分定输赢。'],
  ask: ['对话', '把命盘放在一起，聊聊你正在经历的事。'],
  profile: ['我的资料', '出生资料、偏好和数据管理。'],
  login: ['登录', ''],
  register: ['注册', ''],
  forgot: ['找回密码', ''],
  reset: ['重置密码', ''],
};

export function Layout({ route, activeThread, children }: { route: Route; activeThread?: string; children: ReactNode }) {
  const { state } = useStore();
  const { collapsed, toggleSidebar, drawer, setDrawer, palette, setPalette } = useUI();
  const [title, sub] = TITLE[route];

  // 全局快捷键：⌘K 命令面板、⌘⇧O 新会话、⌘B 侧栏、/ 聚焦输入框、Esc 关闭抽屉
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
      const k = e.key.toLowerCase();
      if (mod && k === 'k') { e.preventDefault(); setPalette(!palette); }
      else if (mod && e.shiftKey && k === 'o') { e.preventDefault(); if (state.user) newChat(); }
      else if (mod && k === 'b') { e.preventDefault(); toggleSidebar(); }
      else if (e.key === '/' && !typing && !mod && !palette) {
        const box = document.querySelector<HTMLTextAreaElement>('[data-testid="question-input"]:not(:disabled)');
        if (box) { e.preventDefault(); box.focus(); }
      } else if (e.key === 'Escape' && drawer) setDrawer(false);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [palette, setPalette, toggleSidebar, drawer, setDrawer, state.user]);

  // 路由或会话变化时收起抽屉
  useEffect(() => { setDrawer(false); }, [route, activeThread, setDrawer]);

  return (
    <div className="shell min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-ink focus:px-3 focus:py-1 focus:text-paper">跳到主要内容</a>

      {/* 桌面侧栏：折叠时整体滑出（CSS 里在动画结束后设为 visibility:hidden，移出 Tab 顺序） */}
      <aside className={`sidebar sb-desktop fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden md:flex ${collapsed ? 'is-collapsed' : ''}`}
        style={{ width: 'var(--sb-open-w, 248px)' }}
        aria-label="侧栏" data-testid="sidebar" data-collapsed={collapsed}>
        <SidebarBody route={route} activeThread={activeThread} />
        {!collapsed && <SidebarResizer />}
      </aside>

      {/* 移动端抽屉 */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="anim-fade absolute inset-0 bg-[#141413]/45" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="sidebar anim-drawer absolute inset-y-0 left-0 flex w-[82vw] max-w-[300px] flex-col shadow-2xl" aria-label="侧栏（抽屉）" data-testid="drawer">
            <SidebarBody route={route} activeThread={activeThread} inDrawer onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      {/* 移动端顶栏 */}
      <header className="sidebar sticky top-0 z-30 flex items-center gap-1.5 px-2 py-2 md:hidden">
        <button type="button" className="sb-icon" aria-label="打开侧栏" aria-expanded={drawer} onClick={() => setDrawer(true)} data-testid="open-drawer"><Menu size={18} aria-hidden /></button>
        <div className="min-w-0 flex-1"><Brand /></div>
        {state.user && <button type="button" className="sb-icon" aria-label="新会话" onClick={newChat}><SquarePen size={17} aria-hidden /></button>}
      </header>

      <div className="main-col">
        <div className="sticky top-0 z-20 hidden border-b border-line bg-paper/90 backdrop-blur md:block">
          <div className="flex items-center justify-between gap-3 px-6 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {collapsed && (
                <span className="anim-fade flex items-center gap-1">
                  <button type="button" className="icon-btn" aria-label={`展开侧栏（${MOD}+B）`} title={`展开侧栏 ${MOD}B`} onClick={toggleSidebar} data-testid="expand-sidebar"><PanelLeftOpen size={17} aria-hidden /></button>
                  {state.user && <button type="button" className="icon-btn" aria-label="新会话" onClick={newChat}><SquarePen size={16} aria-hidden /></button>}
                </span>
              )}
              <div className="min-w-0">
                <p className="h-display truncate text-[20px]">{title}</p>
                {sub && <p className="mt-0.5 truncate text-[12px] text-muted">{sub}</p>}
              </div>
            </div>
            <div className="shrink-0"><ModeSwitch compact /></div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-b border-line bg-paper px-3 py-2.5 md:hidden">
          <p className="h-display truncate text-[18px]">{title}</p>
          <ModeSwitch compact />
        </div>

        <main id="main" key={route} className="page-enter px-2 py-4 pb-10 sm:px-6 md:pb-8">{children}</main>

        <footer hidden={route === 'ask'} className="px-4 pb-6 text-center text-[11px] text-muted sm:px-6">Dio delle Stelle 可能会犯错；本作品用于娱乐与自我探索，不构成医疗、法律、投资或其他专业建议。</footer>
      </div>

      <CommandPalette />
      <Toaster />
    </div>
  );
}

/** 侧栏右边缘的拖拽手柄：拖动调宽，方向键微调，双击恢复默认宽度 */
function SidebarResizer() {
  const { sbWidth, setSbWidth } = useUI();
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX, startW = sbWidth;
    const root = document.documentElement;
    root.classList.add('sb-resizing');
    const move = (ev: PointerEvent) => setSbWidth(startW + ev.clientX - startX);
    const up = () => {
      root.classList.remove('sb-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setSbWidth(sbWidth - step); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setSbWidth(sbWidth + step); }
    else if (e.key === 'Home') { e.preventDefault(); setSbWidth(SB_MIN); }
    else if (e.key === 'End') { e.preventDefault(); setSbWidth(sbMax()); }
  };
  return (
    <div role="separator" aria-orientation="vertical" aria-label="调整侧栏宽度" tabIndex={0}
      aria-valuemin={SB_MIN} aria-valuemax={sbMax()} aria-valuenow={sbWidth}
      title="拖动调整宽度，双击恢复" onPointerDown={onDown} onKeyDown={onKey} onDoubleClick={() => setSbWidth(SB_MIN)}
      className="sb-resizer" data-testid="sidebar-resizer" />
  );
}
