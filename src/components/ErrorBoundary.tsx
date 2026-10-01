import { Component, type ErrorInfo, type ReactNode } from 'react';
import { navigate } from '../state/hooks';

interface Props { children: ReactNode }
interface State { error: Error | null }

/** 命盘或第三方计算库异常时提供可恢复的界面，避免整棵 React 树白屏。 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('页面渲染失败', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-5 py-12 text-center">
        <section className="max-w-md">
          <h1 className="h-display text-xl">这份命盘暂时无法显示</h1>
          <p className="mt-3 text-sm leading-7 text-muted">出生资料可能超出了当前计算范围。请检查日期、时间和地点后重试。</p>
          <div className="mt-5 flex justify-center gap-2">
            <button type="button" className="btn-primary" onClick={() => { this.setState({ error: null }); navigate('profile'); }}>检查出生资料</button>
            <button type="button" className="btn-ghost" onClick={() => window.location.reload()}>重新加载</button>
          </div>
        </section>
      </main>
    );
  }
}
