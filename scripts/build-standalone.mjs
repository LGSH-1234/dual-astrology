// 生成单文件离线版：dist-standalone/DioDelleStelle.html
// 双击即可在浏览器打开；没有服务端时，问答自动使用浏览器本地的演示解读。
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist-standalone';
const tmp = join(out, '.tmp');
rmSync(out, { recursive: true, force: true });

await build({
  configFile: false,
  plugins: [react()],
  base: './',
  logLevel: 'warn',
  build: {
    outDir: tmp,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});

const assets = join(tmp, 'assets');
const files = readdirSync(assets);
const js = readFileSync(join(assets, files.find((f) => f.endsWith('.js'))), 'utf8').replace(/<\/script/gi, '<\\/script');
const cssFile = files.find((f) => f.endsWith('.css'));
const css = cssFile ? readFileSync(join(assets, cssFile), 'utf8') : '';
const favicon = 'data:image/svg+xml;base64,' + readFileSync('public/favicon.svg').toString('base64');

let html = readFileSync(join(tmp, 'index.html'), 'utf8')
  .replace(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/, '')
  .replace(/<link rel="stylesheet"[^>]*>/, '')
  .replace(/href="[^"]*favicon\.svg"/, () => `href="${favicon}"`);
html = html.replace('</head>', () => `<style>${css}</style>\n</head>`);
html = html.replace('</body>', () => `<script type="module">${js}</script>\n</body>`);

rmSync(tmp, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'DioDelleStelle.html'), html);
console.log(`✓ ${out}/DioDelleStelle.html  ${(html.length / 1024).toFixed(0)} KB`);
