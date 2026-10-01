// 网络相关的小工具：客户端 IP、限流器、安全响应头。
import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

/**
 * 客户端 IP。默认只用 TCP 连接的真实地址，X-Forwarded-For 可被伪造，
 * 只有明确部署在反向代理后面（TRUST_PROXY=true）时才读取它。
 * 取最右边一项：那是我们信任的那一层代理追加的，左边的内容客户端可以随便填。
 */
export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const parts = (c.req.header('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const xff = parts.at(-1);
    if (xff) return xff.slice(0, 64);
  }
  try {
    return getConnInfo(c).remote.address ?? 'local';
  } catch {
    return 'local'; // 测试里直接调用 app.request 时没有底层连接
  }
}

/** 固定窗口滑动计数限流；条目过多时清理过期键，避免内存无限增长。 */
export class RateLimiter {
  private map = new Map<string, number[]>();
  constructor(private windowMs: number, private limit: number, private maxKeys = 10_000) {}

  private recent(key: string, now: number) {
    return (this.map.get(key) ?? []).filter((t) => now - t < this.windowMs);
  }
  check(key: string): boolean {
    return this.recent(key, Date.now()).length < this.limit;
  }
  hit(key: string) {
    const now = Date.now();
    const r = this.recent(key, now);
    r.push(now);
    this.map.set(key, r);
    if (this.map.size > this.maxKeys) this.purge(now);
  }
  /** 检查并计数，超限返回 false。 */
  take(key: string): boolean {
    if (!this.check(key)) return false;
    this.hit(key);
    return true;
  }
  clear(key: string) {
    this.map.delete(key);
  }
  private purge(now: number) {
    for (const [k, v] of this.map) if (!v.some((t) => now - t < this.windowMs)) this.map.delete(k);
    // 仍然过多（大量活跃键），丢弃最早插入的一半
    if (this.map.size > this.maxKeys) {
      let n = Math.floor(this.map.size / 2);
      for (const k of this.map.keys()) { if (n-- <= 0) break; this.map.delete(k); }
    }
  }
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** 安全响应头；HTTPS 下额外加 HSTS。 */
export function securityHeaders(opts: { https: (c: Context) => boolean }): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'no-referrer');
    h.set('X-Frame-Options', 'DENY');
    h.set('Cross-Origin-Opener-Policy', 'same-origin');
    h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (c.req.path.startsWith('/api/')) h.set('Cache-Control', 'no-store');
    else h.set('Content-Security-Policy', CSP);
    if (opts.https(c)) h.set('Strict-Transport-Security', 'max-age=15552000');
  };
}
