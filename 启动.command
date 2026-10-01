#!/bin/bash
# Dio delle Stelle · 星神：双击启动（macOS）。
# 做的事：检查 Node → 按本机平台安装依赖 → 构建前端 → 启动服务（页面和接口同一个端口）→ 打开浏览器。
# 关掉这个终端窗口或按 Ctrl+C 即停止服务。
set -e
cd "$(dirname "$0")"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$1"; echo; read -r -p "按回车键关闭…" _; exit 1; }

# 1. Node 版本（需要 22.5+，内置 SQLite）
if ! command -v node >/dev/null 2>&1; then
  fail "没有找到 Node.js。请先到 https://nodejs.org 下载安装 22 LTS（或用 Homebrew：brew install node@22），然后重新双击本文件。"
fi
NODE_VER="$(node -p 'process.versions.node')"
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)'; then
  fail "当前 Node.js 版本是 $NODE_VER，需要 22.5 或更高。请到 https://nodejs.org 安装 22 LTS 后重试。"
fi

# 2. 读取端口（.env 里的 PORT，默认 8787）
PORT=8787
if [ -f .env ]; then
  P="$(grep -E '^PORT=' .env | tail -n1 | cut -d= -f2 | tr -d '[:space:]"'"'"'')"
  [ -n "$P" ] && PORT="$P"
fi
case "$PORT" in ''|*[!0-9]*) fail ".env 里的 PORT 必须是数字（当前：$PORT）。" ;; esac
URL="http://localhost:$PORT"
open_browser() { command -v open >/dev/null 2>&1 && open "$URL" || echo "请在浏览器打开 $URL"; }

# 端口被占用：如果是本项目的旧服务，先停掉再用最新代码重启；否则提示换端口
if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  if curl -fsS "http://127.0.0.1:$PORT/api/status" 2>/dev/null | grep -q '"provider"'; then
    say "发现正在运行的旧服务，先停止它，再用最新代码重新启动…"
    PIDS="$(lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN)"
    kill $PIDS 2>/dev/null || true
    for _ in $(seq 1 20); do
      lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
      sleep 0.25
    done
    if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      kill -9 $PIDS 2>/dev/null || true
      sleep 0.5
    fi
  else
    fail "端口 $PORT 被其他程序占用。请关闭那个程序，或在 .env 里设置 PORT=其他端口 后重试。"
  fi
fi

# 3. 依赖：node_modules 里的原生包（esbuild、rollup）分平台，换了电脑/系统要重装
PLATFORM="$(uname -s)-$(uname -m)-node$(node -p 'process.versions.node.split(".")[0]')"
if [ ! -d node_modules ] || [ "$(cat node_modules/.platform 2>/dev/null)" != "$PLATFORM" ]; then
  say "安装依赖（首次或换了平台，大约 1 分钟）…"
  rm -rf node_modules
  if [ -f package-lock.json ]; then npm ci --no-audit --no-fund || fail "依赖安装失败，请检查网络后重试。"
  else npm install --no-audit --no-fund || fail "依赖安装失败，请检查网络后重试。"; fi
  echo "$PLATFORM" > node_modules/.platform
fi

# 4. 构建前端
say "构建页面…"
npx vite build --logLevel warn || fail "构建失败，请把上面的报错发给开发者。"

# 5. 启动服务，就绪后打开浏览器
mkdir -p server/data
if [ ! -f .env ]; then
  say "当前使用演示解读。"
fi
say "启动服务：$URL （按 Ctrl+C 停止）"
( for _ in $(seq 1 40); do
    sleep 0.5
    if curl -fsS "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then open_browser; break; fi
  done ) &
exec npx tsx server/index.ts
