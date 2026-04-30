// ─────────────────────────────────────────────
// tests/stress/naverEnvDiagnosticsTest.js
// — NAVER_ENABLED 정규화, 진단, 우선순위, secret 미노출 검증.
//
// child_process 로 실행 — 각 케이스마다 process.env 를 격리 후 server/sources/naver.js
// 모듈을 fresh 하게 import 한다 (module-level cache 회피).
// ─────────────────────────────────────────────

import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const NAVER_URL = pathToFileURL(path.join(ROOT, 'server/sources/naver.js')).href;

const results = [];
const start = Date.now();
function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, ms: Date.now() - t0 });
    console.log(`  ✅ ${name}  (${Date.now() - t0}ms)`);
  } catch (e) {
    results.push({ name, passed: false, failMsg: e.message || String(e), ms: Date.now() - t0 });
    console.error(`  ❌ ${name}  — ${e.message || e}`);
  }
}
function group(label) { console.log(`\n=== ${label} ===`); }

// child process — env 격리
function runCase({ env = {}, sourceSettings = null, action }) {
  // 임시 DATA_DIR 마련 (admin 저장값 시나리오)
  const tmp = path.join(os.tmpdir(), `tc-naver-diag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  try {
    fsSync.mkdirSync(tmp, { recursive: true });
    if (sourceSettings) {
      fsSync.writeFileSync(path.join(tmp, 'sourceSettings.json'), JSON.stringify(sourceSettings), 'utf8');
    }
  } catch {}

  const envClear = `
    delete process.env.NAVER_ENABLED;
    delete process.env.NAVER_CLIENT_ID;
    delete process.env.NAVER_CLIENT_SECRET;
  `;
  const envSet = Object.entries(env).map(([k, v]) =>
    v === null ? `delete process.env[${JSON.stringify(k)}];`
               : `process.env[${JSON.stringify(k)}] = ${JSON.stringify(String(v))};`
  ).join('\n');

  const code = `
    process.env.DATA_DIR = ${JSON.stringify(tmp)};
    ${envClear}
    ${envSet}
    const naver = await import(${JSON.stringify(NAVER_URL)});
    await naver.preloadNaver();
    const cfg = naver.getNaverConfig();
    const diag = naver.getNaverEnvDiagnostics();
    const out = ${action};
    process.stdout.write('JSON_OUT::' + JSON.stringify(out));
  `;

  let stdout = '';
  try {
    stdout = execSync(`node --input-type=module -e "${code.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 }).toString();
  } catch (e) {
    stdout = (e.stdout?.toString() || '') + '\n--- stderr ---\n' + (e.stderr?.toString() || '');
  } finally {
    try { fsSync.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  const m = stdout.match(/JSON_OUT::(\{[\s\S]*\})$/m);
  if (!m) throw new Error(`child output 파싱 실패:\n${stdout.slice(0, 500)}`);
  return JSON.parse(m[1]);
}

async function main() {
  group('1) NAVER_ENABLED 정규화 — 다양한 케이스');
  for (const [val, expectedEnabled] of [
    ['true',     true],
    ['TRUE',     true],
    ['True',     true],
    ['true ',    true],     // trailing space
    [' true',    true],     // leading space
    ['1',        true],
    ['yes',      true],
    ['on',       true],
    ['enabled',  true],
    ['false',    false],
    ['FALSE',    false],
    ['0',        false],
    ['no',       false],
    ['off',      false],
    ['',         true],     // 빈 문자열 → 기본 ON
  ]) {
    await test(`NAVER_ENABLED='${val}' → normalized=${expectedEnabled}`, async () => {
      const out = runCase({
        env: { NAVER_ENABLED: val, NAVER_CLIENT_ID: 'ID12', NAVER_CLIENT_SECRET: 'SEC' },
        action: 'diag',
      });
      assert(out.naverEnabledNormalized === expectedEnabled,
        `got ${out.naverEnabledNormalized}, raw=${val}`);
    });
  }
  await test('NAVER_ENABLED 미지정 (undefined) → normalized=true', async () => {
    const out = runCase({
      env: { NAVER_ENABLED: null, NAVER_CLIENT_ID: 'ID12', NAVER_CLIENT_SECRET: 'SEC' },
      action: 'diag',
    });
    assert(out.naverEnabledNormalized === true);
    assert(out.hasNAVER_ENABLED === false);
  });
  await test('NAVER_ENABLED 알 수 없는 값 (xxx) → 안전하게 false', async () => {
    const out = runCase({
      env: { NAVER_ENABLED: 'xxx', NAVER_CLIENT_ID: 'ID12', NAVER_CLIENT_SECRET: 'SEC' },
      action: 'diag',
    });
    assert(out.naverEnabledNormalized === false);
  });

  group('2) Secret 절대 노출 금지');
  await test('getNaverConfig().clientIdMasked — 앞 4자 + 별표', async () => {
    const out = runCase({
      env: { NAVER_ENABLED: 'true', NAVER_CLIENT_ID: 'abcd1234EFGH', NAVER_CLIENT_SECRET: 'topSecretValue' },
      action: 'cfg',
    });
    assert(out.configured === true);
    assert(out.clientIdMasked === 'abcd' + '*'.repeat(8), `got ${out.clientIdMasked}`);
  });
  await test('진단 객체에 secret 평문 / clientId 전체값 미포함', async () => {
    const out = runCase({
      env: { NAVER_ENABLED: 'true', NAVER_CLIENT_ID: 'PUBLIC_ID_VALUE', NAVER_CLIENT_SECRET: 'TOPSECRETVALUE12345' },
      action: 'diag',
    });
    const json = JSON.stringify(out);
    assert(!json.includes('TOPSECRETVALUE'), `secret 노출됨: ${json}`);
    assert(!json.includes('PUBLIC_ID_VALUE'), `clientId 전체 노출됨: ${json}`);
    // 마스킹 형태만 노출
    assert(/PUBL\*+/.test(out.naverClientIdMasked), `mask 누락: ${out.naverClientIdMasked}`);
  });

  group('3) 우선순위 — env > admin > none');
  await test('env 만 설정 → source=env, configured=true', async () => {
    const out = runCase({
      env: { NAVER_ENABLED: 'true', NAVER_CLIENT_ID: 'ENV_ID', NAVER_CLIENT_SECRET: 'ENV_SEC' },
      action: 'cfg',
    });
    assert(out.configured === true);
    assert(out.source === 'env');
  });
  await test('admin 만 설정 → source=admin, configured=true', async () => {
    const out = runCase({
      env: {},
      sourceSettings: {
        naverEnabled: true, naverClientId: 'ADMIN_ID', naverClientSecret: 'ADMIN_SEC',
      },
      action: 'cfg',
    });
    assert(out.configured === true);
    assert(out.source === 'admin', `got ${out.source}`);
  });
  await test('env + admin 모두 설정 → env 우선 (source=env)', async () => {
    const out = runCase({
      env: { NAVER_ENABLED: 'true', NAVER_CLIENT_ID: 'ENV_ID', NAVER_CLIENT_SECRET: 'ENV_SEC' },
      sourceSettings: {
        naverEnabled: true, naverClientId: 'ADMIN_ID', naverClientSecret: 'ADMIN_SEC',
      },
      action: 'cfg',
    });
    assert(out.source === 'env');
  });
  await test('미설정 → source=none, configured=false', async () => {
    const out = runCase({ env: {}, action: 'cfg' });
    assert(out.configured === false);
    assert(out.source === 'none');
  });

  group('4) 부분 누락 진단');
  await test('ID 만 있고 SECRET 없음 → completeForEnv=false, partialMissing=true', async () => {
    const out = runCase({
      env: { NAVER_ENABLED: 'true', NAVER_CLIENT_ID: 'ID12' /* SECRET 없음 */ },
      action: 'diag',
    });
    assert(out.completeForEnv === false);
    assert(out.partialMissing === true);
    assert(out.hasNAVER_CLIENT_ID === true);
    assert(out.hasNAVER_CLIENT_SECRET === false);
  });
  await test('SECRET 만 있고 ID 없음 → partialMissing=true', async () => {
    const out = runCase({
      env: { NAVER_ENABLED: 'true', NAVER_CLIENT_SECRET: 'SEC' },
      action: 'diag',
    });
    assert(out.partialMissing === true);
    assert(out.hasNAVER_CLIENT_SECRET === true);
    assert(out.hasNAVER_CLIENT_ID === false);
  });
  await test('NAVER_ENABLED=false + ID/SECRET 있음 → completeForEnv=false, partialMissing=false', async () => {
    const out = runCase({
      env: { NAVER_ENABLED: 'false', NAVER_CLIENT_ID: 'X', NAVER_CLIENT_SECRET: 'Y' },
      action: 'diag',
    });
    assert(out.completeForEnv === false);
    // partialMissing 은 enabled=true 일 때만 의미가 있다 — false 일 때는 false
    assert(out.partialMissing === false, `partialMissing=${out.partialMissing}`);
  });
  await test('공백만 들어간 ID — trim 후 빈 → hasNAVER_CLIENT_ID=false', async () => {
    const out = runCase({
      env: { NAVER_ENABLED: 'true', NAVER_CLIENT_ID: '   ', NAVER_CLIENT_SECRET: 'SEC' },
      action: 'diag',
    });
    assert(out.hasNAVER_CLIENT_ID === false, `hasId=${out.hasNAVER_CLIENT_ID}`);
    assert(out.partialMissing === true);
  });

  group('5) trim 동작 — 사용자가 실수로 공백 포함 입력');
  await test('NAVER_CLIENT_ID 양쪽 공백 → trim 후 정상 인식', async () => {
    const out = runCase({
      env: { NAVER_ENABLED: 'true', NAVER_CLIENT_ID: '  abcd1234  ', NAVER_CLIENT_SECRET: '  SEC  ' },
      action: 'cfg',
    });
    assert(out.configured === true);
    assert(out.source === 'env');
    assert(out.clientIdMasked === 'abcd' + '*'.repeat(4), `got ${out.clientIdMasked}`);
  });

  // ────────────────────────────────────────────
  const failed = results.filter(r => !r.passed);
  console.log(`\n──────────────────────────────────────────`);
  console.log(`총 ${results.length}건 중 통과 ${results.length - failed.length} · 실패 ${failed.length}  (${Date.now() - start}ms)`);
  if (failed.length) {
    for (const f of failed) console.log(`  ❌ ${f.name}\n     → ${f.failMsg}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
