// 界面级状态：侧栏折叠、移动端抽屉、命令面板、Toast。与业务数据分开，不进 dual-astrology:v1。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface Toast { id: number; text: string; action?: { label: string; run: () => void } }

interface UI {
  collapsed: boolean;
  /** 桌面侧栏宽度（px），最小 SB_MIN，最大约为视口的 1/3 */
  sbWidth: number;
  setSbWidth: (w: number) => void;
  toggleSidebar: () => void;
  drawer: boolean;
  setDrawer: (v: boolean) => void;
  palette: boolean;
  setPalette: (v: boolean) => void;
  toasts: Toast[];
  toast: (text: string, action?: Toast['action']) => void;
  dismiss: (id: number) => void;
}

const KEY = 'dio:sidebar-collapsed';
const W_KEY = 'dio:sidebar-width';
export const SB_MIN = 248;
export const sbMax = () => Math.max(SB_MIN, Math.round(window.innerWidth / 3));
export const clampSb = (w: number) => Math.min(sbMax(), Math.max(SB_MIN, Math.round(w)));
const Ctx = createContext<UI | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  const [sbWidth, setW] = useState(() => {
    try { return clampSb(Number(localStorage.getItem(W_KEY)) || SB_MIN); } catch { return SB_MIN; }
  });
  const setSbWidth = useCallback((w: number) => setW(clampSb(w)), []);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* 忽略 */ }
    document.documentElement.style.setProperty('--sb-w', collapsed ? '0px' : `${sbWidth}px`);
    document.documentElement.style.setProperty('--sb-open-w', `${sbWidth}px`);
  }, [collapsed, sbWidth]);

  useEffect(() => {
    try { localStorage.setItem(W_KEY, String(sbWidth)); } catch { /* 忽略 */ }
  }, [sbWidth]);

  // 窗口变窄时，侧栏宽度跟着收回到 1/3 以内
  useEffect(() => {
    const on = () => setW((w) => clampSb(w));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((text: string, action?: Toast['action']) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, action }]);
    window.setTimeout(() => dismiss(id), action ? 6000 : 2600);
  }, [dismiss]);
  const toggleSidebar = useCallback(() => setCollapsed((c) => !c), []);

  const value = useMemo(() => ({ collapsed, sbWidth, setSbWidth, toggleSidebar, drawer, setDrawer, palette, setPalette, toasts, toast, dismiss }),
    [collapsed, sbWidth, setSbWidth, toggleSidebar, drawer, palette, toasts, toast, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUI() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI 必须在 UIProvider 内使用');
  return v;
}

/** 用户是否开启了“减少动态效果” */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** 新建会话：回到不带 t 参数的对话页，并通知对话页清空本地输入状态 */
export function newChat() {
  window.location.hash = '#/ask';
  window.dispatchEvent(new Event('dio:new-chat'));
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // file:// 或旧浏览器没有 clipboard API 时退回 execCommand
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
