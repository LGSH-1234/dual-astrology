import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5173', trace: 'off' },
  webServer: [
    { command: 'INTERPRETATION_PROVIDER=mock DATA_FILE=/tmp/dio-e2e.sqlite RESET_OUTBOX=/tmp/dio-e2e-outbox.jsonl npx tsx server/index.ts', port: 8787, reuseExistingServer: true },
    { command: 'npx vite --port 5173 --strictPort', port: 5173, reuseExistingServer: true },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
