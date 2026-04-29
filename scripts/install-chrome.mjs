// ─────────────────────────────────────────────
// scripts/install-chrome.mjs — npm install 직후 자동 실행되는 안전망
// Puppeteer 가 사용할 Chrome 을 idempotent 하게 설치한다.
// 이미 설치되어 있거나, install 명령이 실패해도 npm install 전체를 죽이지 않는다.
// (Render 의 buildCommand 에는 별도로 `npx puppeteer browsers install chrome` 이 있어
//  postinstall 이 어떤 이유로 skip 되더라도 빌드 단계에서 한 번 더 시도된다)
// ─────────────────────────────────────────────

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// PUPPETEER_CACHE_DIR > ~/.cache/puppeteer 순으로 점검
const cacheDir = process.env.PUPPETEER_CACHE_DIR || join(homedir(), '.cache', 'puppeteer');

// 이미 설치된 Chrome 이 있는지 빠르게 확인 (디렉터리 존재만 체크)
if (existsSync(join(cacheDir, 'chrome'))) {
  // 추가로 puppeteer API 로 verify 할 수도 있지만 정확도보다 속도/안전 우선
  console.log(`[postinstall] Chrome 캐시 발견: ${cacheDir}/chrome — skip`);
  process.exit(0);
}

console.log(`[postinstall] Chrome 미발견 — 설치 시도 (cache=${cacheDir})`);
try {
  execSync('npx puppeteer browsers install chrome', { stdio: 'inherit' });
  console.log('[postinstall] Chrome 설치 완료');
} catch (err) {
  console.warn('[postinstall] ⚠️ Chrome 설치 실패:', err.message);
  console.warn('[postinstall] 운영 환경에서는 buildCommand 의 명시적 설치 또는 PUPPETEER_EXECUTABLE_PATH 가 필요할 수 있습니다.');
  // 의도적으로 process.exit(0) — npm install 은 성공 처리
  process.exit(0);
}
