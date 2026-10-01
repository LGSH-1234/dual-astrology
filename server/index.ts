import { serve } from '@hono/node-server';
import { createApp } from './app';

// 读取项目根目录的 .env（Node 22 内置，不覆盖已有环境变量）；没有 .env 时用默认 mock。
try { process.loadEnvFile('.env'); } catch { /* 无 .env */ }

const port = Number(process.env.PORT ?? 8787);
const app = createApp({
  INTERPRETATION_PROVIDER: process.env.INTERPRETATION_PROVIDER ?? 'mock',
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  DATA_FILE: process.env.DATA_FILE ?? 'server/data/dio.sqlite',
  SECURE_COOKIE: process.env.SECURE_COOKIE === 'true',
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
  APP_URL: process.env.APP_URL,
  STATIC_DIR: process.env.STATIC_DIR ?? 'dist',
  RESET_OUTBOX: process.env.RESET_OUTBOX,
});

serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? '127.0.0.1' }, () => {
  const ai = (process.env.INTERPRETATION_PROVIDER ?? 'mock') === 'deepseek' && process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'mock';
  console.log(`[server] http://localhost:${port}  AI=${ai}`);
});
