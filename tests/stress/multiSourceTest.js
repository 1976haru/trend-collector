// ─────────────────────────────────────────────
// tests/stress/multiSourceTest.js — 다중 소스 / 백업·복원 / 확장 검색 검증
// ─────────────────────────────────────────────

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

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

async function main() {
  // 격리 DATA_DIR
  const tmp = path.join(os.tmpdir(), `tc-multisrc-${Date.now()}`);
  await fs.mkdir(tmp, { recursive: true });
  process.env.DATA_DIR = tmp;

  const store = await imp('server/store.js');
  const oa    = await imp('server/sources/officialAgency.js');
  const cs    = await imp('server/sources/customSources.js');
  const rel   = await imp('server/relevance.js');

  // ────────────────────────────────────────────
  group('1) officialAgency 모듈');
  await test('isOfficialAgencyEnabled — 기본 ON', () => {
    assert(oa.isOfficialAgencyEnabled() === true);
    assert(oa.isOfficialAgencyEnabled({}) === true);
    assert(oa.isOfficialAgencyEnabled({ officialAgencyEnabled: false }) === false);
    assert(oa.isOfficialAgencyEnabled({ officialAgencyEnabled: true }) === true);
  });
  await test('DEFAULT_AGENCY_DOMAINS — 6+ 도메인 (moj/korea/corrections/immigration/spo/hikorea)', () => {
    const want = ['moj.go.kr', 'korea.kr', 'corrections.go.kr', 'immigration.go.kr', 'spo.go.kr'];
    for (const w of want) assert(oa.DEFAULT_AGENCY_DOMAINS.includes(w), `${w} missing`);
  });

  // ────────────────────────────────────────────
  group('2) customSources — 검증 / CRUD / 백업');
  await test('addCustomSource — 정상 추가 + 자동 id', async () => {
    const item = await store.addCustomSource({
      name: '법무부 공지', url: 'https://example.com/feed.rss', type: 'rss',
      agencyCategory: '법무부 본부',
    });
    assert(item.id && item.id.startsWith('cs_'));
    assert(item.name === '법무부 공지');
    assert(item.enabled === true);
  });
  await test('addCustomSource — name 누락 시 throw', async () => {
    let threw = false;
    try { await store.addCustomSource({ url: 'https://x.com', type: 'rss' }); }
    catch { threw = true; }
    assert(threw);
  });
  await test('addCustomSource — 잘못된 url 시 throw', async () => {
    let threw = false;
    try { await store.addCustomSource({ name: 'X', url: 'not-a-url' }); }
    catch { threw = true; }
    assert(threw);
  });
  await test('updateCustomSource — enabled 토글', async () => {
    const list = (await store.loadSourceSettings()).customSources;
    const id = list[0].id;
    const upd = await store.updateCustomSource(id, { enabled: false });
    assert(upd.enabled === false);
  });
  await test('safeSourceSettings — customSources 평문 노출 (URL/이름은 secret 아님)', async () => {
    const stored = await store.loadSourceSettings();
    const safe = store.safeSourceSettings(stored);
    assert(Array.isArray(safe.customSources));
    assert(safe.customSources[0].url.startsWith('https://'));
  });
  await test('deleteCustomSource — 정상 제거', async () => {
    const list = (await store.loadSourceSettings()).customSources;
    const id = list[0].id;
    await store.deleteCustomSource(id);
    const after = (await store.loadSourceSettings()).customSources;
    assert(after.find(x => x.id === id) === undefined);
  });

  // ────────────────────────────────────────────
  group('3) 백업 / 복원');
  await test('exportSourceSettingsBackup — secret 기본 제외', async () => {
    await store.saveSourceSettings({ naverEnabled: true, naverClientId: 'TESTID', naverClientSecret: 'SUPERSECRET' });
    const backup = await store.exportSourceSettingsBackup();
    assert(backup.naverEnabled === true);
    assert(backup.naverClientId === 'TESTID');
    assert(backup.naverClientSecret === '', `secret leaked: ${backup.naverClientSecret}`);
    assert(backup.secretsIncluded === false);
  });
  await test('exportSourceSettingsBackup — includeSecrets=true 시 비밀값 포함', async () => {
    const backup = await store.exportSourceSettingsBackup({ includeSecrets: true });
    assert(backup.naverClientSecret === 'SUPERSECRET');
    assert(backup.secretsIncluded === true);
  });
  await test('importSourceSettingsBackup — Naver / customSources / autoTracking 복원', async () => {
    // 같은 store 인스턴스 — 현재 sourceSettings.json 을 덮어쓰는 형태로 검증
    const backup = {
      version: 1,
      naverEnabled: true, naverClientId: 'RESTORED_ID', naverClientSecret: 'RESTORED_SECRET',
      officialAgencyEnabled: false,
      customSources: [{ id: 'cs_test', name: '테스트 RSS', url: 'https://example.com/r.rss', type: 'rss', enabled: true }],
      expandKeywords: false,
      autoTracking: { moj: true, probation: false, corrections: true, immigration: true, prosecution: true, policy: true, other: true },
    };
    const saved = await store.importSourceSettingsBackup(backup);
    assert(saved.naverClientId === 'RESTORED_ID');
    assert(saved.naverClientSecret === 'RESTORED_SECRET');
    assert(saved.officialAgencyEnabled === false);
    assert(saved.customSources.length === 1 && saved.customSources[0].name === '테스트 RSS');
    assert(saved.expandKeywords === false);
    assert(saved.autoTracking.probation === false);
  });
  await test('importSourceSettingsBackup — 빈 secret 입력 시 기존 secret 보존', async () => {
    // 직전 테스트에서 RESTORED_SECRET 가 저장된 상태
    const before = await store.loadSourceSettings();
    assert(before.naverClientSecret === 'RESTORED_SECRET');
    const backup = { naverEnabled: true, naverClientId: 'NEW_ID', naverClientSecret: '' };
    const saved = await store.importSourceSettingsBackup(backup);
    assert(saved.naverClientId === 'NEW_ID');
    assert(saved.naverClientSecret === 'RESTORED_SECRET', `secret 손실: ${saved.naverClientSecret}`);
  });

  // ────────────────────────────────────────────
  group('4) relevance — 확장 키워드 가산');
  await test('직접 매칭 X + relatedKeywordSource 매칭 → +1 가산 (level=low)', () => {
    const r = rel.scoreRelevance({
      title: '전자감독 부착명령 새 정책',
      summary: '전자감독 강화',
      contentText: '',
      relatedKeywordSource: '전자감독',
    }, ['보호관찰']);    // 사용자는 '보호관찰' 만 선택 — 직접 매칭 X
    // matchedKeywords 는 0 이지만 relatedKeywordSource 가 본문에 있어 +1
    assert(r.relevanceScore === 1, `score=${r.relevanceScore}`);
    assert(r.relevanceLevel === 'low');
  });
  await test('직접 매칭 있을 때는 확장 가산 적용 X', () => {
    const r = rel.scoreRelevance({
      title: '보호관찰 강화',
      summary: '보호관찰',
      relatedKeywordSource: '전자감독',
    }, ['보호관찰']);
    // 제목 +5 + 요약 +3 = 8, 확장 가산은 matchedKeywords 가 0 일 때만
    assert(r.relevanceScore === 8, `score=${r.relevanceScore}`);
  });

  // ────────────────────────────────────────────
  group('5) customSources testCustomSource — error handling');
  await test('테스트 — 존재하지 않는 URL → 실패 응답 (ok=false)', async () => {
    const r = await cs.testCustomSource({
      id: 'tmp', name: '존재 X', url: 'https://nonexistent-host-test-xyz.invalid/feed.rss', type: 'rss',
    }, '보호관찰');
    assert(r.ok === false, `should fail: ${JSON.stringify(r)}`);
    assert(r.count === 0);
  });
  await test('테스트 — HTML 응답 (RSS 아님) → ok=false + 한국어 메시지', async () => {
    // example.com 은 HTML 반환 — RSS 가 아니어야 함
    const r = await cs.testCustomSource({
      id: 'tmp', name: 'HTML', url: 'https://example.com', type: 'rss',
    }, '보호관찰');
    assert(r.ok === false);
    assert(/RSS|XML|피드/.test(r.error || ''), `한국어 안내 누락: ${r.error}`);
  });

  // 정리
  await fs.rm(tmp, { recursive: true, force: true });

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
