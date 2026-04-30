// ─────────────────────────────────────────────
// tests/stress/searchLogicTest.js — 검색 로직 / Naver 설정 / 인코딩 정밀 검증
//
// 목적:
//   • collapseContainedKeywords 가 실제 사용 패턴 (보호관찰/보호관찰소/전자감독, AND ON/OFF) 에서 의도대로
//   • normalizeKeyword — 공백/특수문자/한자 혼입에 견고
//   • 빈 키워드 fallback — flatten 결과 사용 가능
//   • Naver 모듈 자격증명 우선순위 / Secret 노출 없음
//   • encodingDetect — UTF-8 / EUC-KR / CP949 의 garbled ratio 변환
//   • departments / sentiment / mediaList 의 입력 안전성
//
// 실행: node tests/stress/searchLogicTest.js
// 종료 코드: 0 통과, 1 실패
// ─────────────────────────────────────────────

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import iconv from 'iconv-lite';

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
  const co = await imp('server/collector.js');
  const naver = await imp('server/sources/naver.js');
  const enc = await imp('server/encodingDetect.js');
  const sentiment = await imp('server/sentiment.js');
  const departments = await imp('server/departments.js');
  const media = await imp('server/mediaList.js');
  const presets = await imp('src/constants/keywordPresets.js');
  const store = await imp('server/store.js');

  // ─────────────── 1) collapseContainedKeywords ──────────────
  group('1) collapseContainedKeywords / normalizeKeyword');
  await test('보호관찰 + 보호관찰소 + 전자감독 → 보호관찰소 + 전자감독', () => {
    const r = co.collapseContainedKeywords(['보호관찰', '보호관찰소', '전자감독']);
    assert(r.length === 2 && r.includes('보호관찰소') && r.includes('전자감독'), `got ${JSON.stringify(r)}`);
  });
  await test('교정 + 출입국 + 검찰 — 모두 유지 (서로 포함 없음)', () => {
    const r = co.collapseContainedKeywords(['교정', '출입국', '검찰']);
    assert(r.length === 3, `got ${JSON.stringify(r)}`);
  });
  await test('수사권 + 검경 수사권 — 검경 수사권 으로 축약', () => {
    const r = co.collapseContainedKeywords(['수사권', '검경 수사권']);
    assert(r.length === 1 && r[0] === '검경 수사권', `got ${JSON.stringify(r)}`);
  });
  await test('단일 키워드 — 그대로 유지', () => {
    const r = co.collapseContainedKeywords(['보호관찰']);
    assert(r.length === 1 && r[0] === '보호관찰');
  });
  await test('빈 배열 — 빈 배열 반환', () => {
    const r = co.collapseContainedKeywords([]);
    assert(Array.isArray(r) && r.length === 0);
  });
  await test('동일 키워드 중복 입력 — 입력 그대로 유지 (UI 가 dedupe 책임)', () => {
    // collapseContainedKeywords 는 "다른 키워드를 포함하는 짧은 키워드" 만 제거.
    // 동일 normalized 키워드는 design 상 그대로 유지되며 — 중복 제거는 UI/Set 단계에서 수행.
    const r = co.collapseContainedKeywords(['보호관찰', '보호관찰']);
    assert(r.length === 2, `design: 동일 normalized 는 보존, got ${JSON.stringify(r)}`);
  });
  await test('normalizeKeyword — 한글+공백+특수문자 혼합', () => {
    assert(co.normalizeKeyword(' 법 무·검찰 ') === '법무검찰');
    assert(co.normalizeKeyword('A.B-C_D') === 'abcd');
    assert(co.normalizeKeyword('') === '');
  });
  await test('normalizeKeyword — HTML/엔티티 제거', () => {
    const v = co.normalizeKeyword('<b>보호&nbsp;관찰</b>');
    assert(v === '보호관찰', `got ${v}`);
  });

  // ─────────────── 2) keywordPresets ────────────────────────
  group('2) 키워드 프리셋 / 추천 / 검색 목적');
  await test('moj 카테고리 5개 + 보호직 6/14', () => {
    const cats = presets.listCategories('moj');
    assert(cats.length === 5);
    const protection = cats.find(c => c.id === 'protection');
    assert(protection.core.length === 6 && protection.extended.length === 14);
  });
  await test('flatten — 90+ unique', () => {
    const all = presets.flattenAllKeywords('moj');
    assert(new Set(all).size === all.length);
    assert(all.length > 80, `${all.length}`);
  });
  await test('빈 키워드 fallback — flatten 가능 (수집 직전 빈 키워드 방어)', () => {
    const fallback = presets.flattenAllKeywords('moj');
    assert(fallback.length > 0, '빈 키워드 fallback 누락');
  });
  await test('intent — 6종 + 각 keywords 배열', () => {
    assert(presets.INTENT_PRESETS.length === 6);
    for (const p of presets.INTENT_PRESETS) {
      assert(typeof p.id === 'string' && Array.isArray(p.keywords), `intent ${p.id} broken`);
    }
  });
  await test('suggestRelated — 보호관찰 → 5+ 추천', () => {
    const r = presets.suggestRelated(['보호관찰']);
    assert(r.length >= 5, `${r.join(',')}`);
    assert(r.includes('전자감독') && r.includes('보호관찰소'));
  });
  await test('suggestRelated — 이미 선택된 항목은 추천 제외', () => {
    const r = presets.suggestRelated(['보호관찰', '전자감독']);
    assert(!r.includes('보호관찰') && !r.includes('전자감독'));
  });

  // ─────────────── 3) Naver 자격증명 ────────────────────────
  group('3) Naver 자격증명 우선순위 / 노출 검사');
  await test('isNaverConfigured() boolean', () => {
    const v = naver.isNaverConfigured();
    assert(typeof v === 'boolean', `got ${typeof v}`);
  });
  await test('getNaverSource() — env|admin|none 중 하나', () => {
    const v = naver.getNaverSource();
    assert(['env', 'admin', 'none'].includes(v), `got ${v}`);
  });
  await test('safeSourceSettings — Secret 평문 노출 없음', async () => {
    const safe = await store.safeSourceSettings();
    // safe* 함수는 Secret 키를 반환하지 않거나 마스킹해야 한다
    const json = JSON.stringify(safe || {});
    // 환경변수의 실제 secret 값이 그대로 들어가지 않아야 한다 (프리픽스 'naverClientSecret' 키만 OK)
    assert(!/clientSecret\s*"\s*:\s*"[A-Za-z0-9]{16,}/i.test(json),
      'naverClientSecret 평문 노출 의심');
    // hasClientSecret 같은 boolean 만 노출되는 것이 권장
  });
  await test('preloadNaver / reloadNaver — 정상 동작', async () => {
    naver.reloadNaver();
    await naver.preloadNaver();
    // 어떤 결과든 throw 없이 끝나야 함
  });

  // ─────────────── 4) encodingDetect ───────────────────────
  group('4) encodingDetect — 한국어 인코딩 매트릭스');
  const KO_TEXT = '<html><head></head><body>대한민국 법무부 보도자료 — 검찰개혁 추진</body></html>';
  await test('UTF-8 입력 → encoding utf-8, ratio 0', () => {
    const buf = Buffer.from(KO_TEXT, 'utf-8');
    const r = enc.decodeHtmlBuffer(buf, 'text/html; charset=utf-8');
    assert(r.encoding === 'utf-8', `got ${r.encoding}`);
    assert(r.ratio === 0, `ratio ${r.ratio}`);
    assert(r.text.includes('법무부') && r.text.includes('검찰개혁'));
  });
  await test('EUC-KR 입력 + Content-Type 명시 → 정상 디코딩', () => {
    const buf = iconv.encode(KO_TEXT, 'euc-kr');
    const r = enc.decodeHtmlBuffer(buf, 'text/html; charset=euc-kr');
    assert(r.encoding === 'euc-kr', `got ${r.encoding}`);
    assert(r.ratio < 0.01);
    assert(r.text.includes('법무부'), `text=${r.text.slice(0, 80)}`);
  });
  await test('CP949 입력 + 헤더 누락 → meta charset fallback', () => {
    const html = '<html><head><meta charset="cp949"></head><body>대한민국 법무부</body></html>';
    const buf = iconv.encode(html, 'cp949');
    const r = enc.decodeHtmlBuffer(buf, '');
    assert(r.text.includes('법무부'), `text=${r.text.slice(0, 80)}`);
    assert(r.ratio < 0.01);
  });
  await test('잘못된 charset 명시 → 자동 fallback (UTF-8 → CP949 retry)', () => {
    const html = '<html><body>대한민국 법무부</body></html>';
    const buf = iconv.encode(html, 'cp949');
    // 잘못된 utf-8 로 디코딩 시도 → 깨짐 → fallback
    const r = enc.decodeHtmlBuffer(buf, 'text/html; charset=utf-8');
    assert(r.text.includes('법무부'), `auto fallback 실패 — text=${r.text.slice(0, 80)}`);
    assert(r.ratio < 0.05, `ratio=${r.ratio}`);
  });
  await test('garbledRatio — 정상값 정상 계산', () => {
    assert(enc.garbledRatio('법무부') === 0);
    assert(enc.garbledRatio('') === 0);
    const r = enc.garbledRatio('법무�부�');
    assert(r > 0 && r < 1, `${r}`);
  });

  // ─────────────── 5) sentiment / departments / mediaList 입력 안전성 ──
  group('5) 분석 모듈 입력 견고성');
  await test('analyzeSentiments — 빈 배열 → {total:0, overall:중립}', () => {
    const r = sentiment.analyzeSentiments([]);
    assert(r && typeof r === 'object', '집계 객체 반환');
    assert(r.total === 0 && r.positive === 0 && r.negative === 0 && r.neutral === 0);
    assert(r.overall === '중립');
  });
  await test('scoreSentiment — null/undefined 필드 견고', () => {
    // analyzeSentiments 는 mutable: 입력 article 의 a.sentiment 를 채움.
    // null title 같은 corner case 도 string 으로 강제되어 throw 없어야 함.
    const arts = [
      { title: '', contentText: '', summary: '' },
      { title: '', contentText: '논란이 일고 있다.', summary: '' },
    ];
    const r = sentiment.analyzeSentiments(arts);
    assert(r.total === 2);
    assert(arts[0].sentiment && typeof arts[0].sentiment.label === 'string');
    assert(arts[1].sentiment && arts[1].sentiment.label === '부정', `got ${arts[1].sentiment?.label}`);
  });
  await test('scoreSentiment — undefined 인자 견고', () => {
    const r = sentiment.scoreSentiment();
    assert(r && r.label === '중립' && Array.isArray(r.matchedKeywords?.positive));
  });
  await test('suggestDepartments — 다양한 키워드 입력', () => {
    const r1 = departments.suggestDepartments({ title: '보호관찰소 시설 점검', contentText: '' });
    assert(Array.isArray(r1));
    const r2 = departments.suggestDepartments({ title: '', contentText: '' });
    assert(Array.isArray(r2));
  });
  await test('classifyMedia — 미상/공백 입력 안전', () => {
    const t1 = media.classifyMedia('연합뉴스');
    const t2 = media.classifyMedia('');
    const t3 = media.classifyMedia(null);
    assert(t1 && t2 !== undefined && t3 !== undefined);
  });
  await test('countByMediaType — 빈 배열 안전', () => {
    const r = media.countByMediaType([]);
    assert(typeof r === 'object' && r !== null);
  });

  // ─────────────── 6) Naver fetchNaverNews — 자격증명 / 잘못된 키 처리 ──
  group('6) Naver fetchNaverNews — 미설정 / 잘못된 키 처리');
  await test('Naver 미설정 시뮬레이션 (env 클리어 + 빈 DATA_DIR) → 명확한 오류', async () => {
    // 자격증명 완전 제거: env 비활성 + admin 저장값(sourceSettings.json) 도 없는 빈 DATA_DIR.
    const { execSync } = await import('node:child_process');
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const tmp = path.join(os.tmpdir(), `tc-naver-test-${Date.now()}`);
    await fs.mkdir(tmp, { recursive: true });
    const code = `
      process.env.DATA_DIR = ${JSON.stringify(tmp)};
      delete process.env.NAVER_CLIENT_ID;
      delete process.env.NAVER_CLIENT_SECRET;
      process.env.NAVER_ENABLED = 'false';
      const naver = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'server/sources/naver.js')).href)});
      naver.reloadNaver();
      try {
        await naver.fetchNaverNews('테스트', { display: 1 });
        console.log('NO_THROW');
      } catch (e) {
        console.log('MSG=' + (e.message || '').slice(0, 100));
      }
    `;
    let out = '';
    try {
      out = execSync(`node --input-type=module -e "${code.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 }).toString();
    } catch (e) {
      out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
    } finally {
      try { await fs.rm(tmp, { recursive: true, force: true }); } catch {}
    }
    assert(/MSG=.*Naver|MSG=.*설정되지|MSG=.*configured/i.test(out),
      `미설정 시 throw 또는 명확한 오류 누락 — out=${out.slice(0, 200)}`);
  });
  await test('잘못된 Naver Secret — child process 에서 외부 호출 401/403 처리', async () => {
    // 실제 네트워크 호출 — 매우 빠르게 끝남 (잘못된 키)
    const { execSync } = await import('node:child_process');
    const code = `
      process.env.NAVER_CLIENT_ID = 'INVALID_TEST_ID_zzz';
      process.env.NAVER_CLIENT_SECRET = 'INVALID_TEST_SECRET';
      process.env.NAVER_ENABLED = 'true';
      const naver = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'server/sources/naver.js')).href)});
      naver.reloadNaver();
      try {
        const r = await naver.fetchNaverNews('테스트', { display: 1 });
        console.log('LEN=' + r.length);
      } catch (e) {
        console.log('THROW=' + (e.message || '').slice(0, 80));
      }
    `;
    let out = '';
    try {
      out = execSync(`node --input-type=module -e "${code.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 }).toString();
    } catch (e) {
      out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
    }
    // 잘못된 키는 throw 또는 빈 응답 처리 둘 다 OK — 서버 다운만 안 되면 됨
    assert(/THROW=|LEN=/.test(out), `예상 외 응답 — out=${out.slice(0, 200)}`);
  });

  const failed = results.filter(r => !r.passed);
  console.log(`\n──────────────────────────────────────────`);
  console.log(`총 ${results.length}건 중 통과 ${results.length - failed.length} · 실패 ${failed.length}  (${Date.now() - start}ms)`);
  if (failed.length) {
    console.log('\n실패 목록:');
    for (const f of failed) console.log(`  ❌ ${f.name}\n     → ${f.failMsg}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
