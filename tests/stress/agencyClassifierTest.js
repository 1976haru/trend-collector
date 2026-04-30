// ─────────────────────────────────────────────
// tests/stress/agencyClassifierTest.js — 기관 배포자료 자동 식별 단위 테스트
// + 자동 추적 sync 라이프사이클 검증 (실 fixture 기반)
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
  const ac = await imp('server/agencyClassifier.js');

  // ────────────────────────────────────────────
  group('1) 도메인 기반 식별');
  await test('moj.go.kr → 법무부 본부', () => {
    const r = ac.classifyAgencyArticle({ url: 'https://www.moj.go.kr/notice/123' });
    assert(r.isOfficialRelease === true);
    assert(r.officialReleaseType === 'moj', `got ${r.officialReleaseType}`);
    assert(r.agencyName === '법무부');
  });
  await test('korea.kr → 정책브리핑', () => {
    const r = ac.classifyAgencyArticle({ url: 'https://www.korea.kr/news/policyNewsView.do?newsId=148' });
    assert(r.officialReleaseType === 'policy');
    assert(r.agencyName === '대한민국 정책브리핑');
  });
  await test('corrections.go.kr → 교정', () => {
    const r = ac.classifyAgencyArticle({ url: 'https://corrections.go.kr/x' });
    assert(r.officialReleaseType === 'corrections', `got ${r.officialReleaseType}`);
  });
  await test('immigration.go.kr → 출입국', () => {
    const r = ac.classifyAgencyArticle({ url: 'https://www.immigration.go.kr/x' });
    assert(r.officialReleaseType === 'immigration');
  });
  await test('spo.go.kr → 검찰', () => {
    const r = ac.classifyAgencyArticle({ url: 'https://www.spo.go.kr/x' });
    assert(r.officialReleaseType === 'prosecution');
    assert(r.agencyName === '대검찰청');
  });
  await test('기타 .go.kr → other', () => {
    const r = ac.classifyAgencyArticle({ url: 'https://www.unknown-agency.go.kr/x' });
    assert(r.officialReleaseType === 'other');
    assert(r.agencyName === 'unknown-agency.go.kr');
  });

  // ────────────────────────────────────────────
  group('2) 매체명 기반 식별 (URL 없거나 비공식 도메인일 때)');
  await test('source="대한민국 정책브리핑" → policy', () => {
    const r = ac.classifyAgencyArticle({ source: '대한민국 정책브리핑', url: 'https://news.example.com/a' });
    assert(r.officialReleaseType === 'policy');
  });
  await test('source="법무부" → moj', () => {
    const r = ac.classifyAgencyArticle({ source: '법무부' });
    assert(r.officialReleaseType === 'moj');
  });
  await test('source="교정본부" → corrections', () => {
    const r = ac.classifyAgencyArticle({ source: '교정본부' });
    assert(r.officialReleaseType === 'corrections');
  });
  await test('source="대검찰청" → prosecution', () => {
    const r = ac.classifyAgencyArticle({ source: '대검찰청' });
    assert(r.officialReleaseType === 'prosecution');
  });

  // ────────────────────────────────────────────
  group('3) 제목 기반 식별 (도메인/매체 불명확)');
  await test('제목 "[보도자료] …" → policy', () => {
    const r = ac.classifyAgencyArticle({
      title: '[보도자료] 법무부, 보호관찰 강화 방안 발표',
      url: 'https://random-news.com/article/1',
    });
    // moj 단어가 매체명/도메인에 없지만 [보도자료] policy 매칭
    assert(r.isOfficialRelease === true, `got ${JSON.stringify(r)}`);
  });
  await test('제목 "서울보호관찰소…" → probation', () => {
    const r = ac.classifyAgencyArticle({
      title: '서울보호관찰소, 청소년 재범 방지 위한 멘토링 시범',
      summary: '',
      url: 'https://news.example.com/x',
    });
    assert(r.officialReleaseType === 'probation', `got ${r.officialReleaseType}`);
    assert(r.agencyName && r.agencyName.includes('서울보호관찰소'), `name=${r.agencyName}`);
  });
  await test('제목 "수원지방검찰청…" → prosecution + 기관명 추출', () => {
    const r = ac.classifyAgencyArticle({
      title: '수원지방검찰청, 마약사범 전담수사부 신설',
      url: 'https://news.example.com/x',
    });
    assert(r.officialReleaseType === 'prosecution');
    assert((r.agencyName || '').includes('수원지방검찰청'), `name=${r.agencyName}`);
  });
  await test('제목 "안양교도소 …" → corrections', () => {
    const r = ac.classifyAgencyArticle({
      title: '안양교도소, 직업훈련 수료식 개최',
      url: 'https://x.example.com/a',
    });
    assert(r.officialReleaseType === 'corrections');
  });
  await test('제목 "수원출입국·외국인청 …" → immigration', () => {
    const r = ac.classifyAgencyArticle({
      title: '수원출입국·외국인청, 다문화 지원 행사',
      url: 'https://x.example.com/a',
    });
    assert(r.officialReleaseType === 'immigration');
  });

  // ────────────────────────────────────────────
  group('4) 외부 언론 기사 — false 처리');
  await test('일반 외부 기사 — isOfficialRelease=false', () => {
    const r = ac.classifyAgencyArticle({
      title: '검찰개혁 둘러싼 갈등 격화…여야 입장차 뚜렷',
      source: '연합뉴스',
      url: 'https://yna.co.kr/article/123',
    });
    assert(r.isOfficialRelease === false, `got ${JSON.stringify(r)}`);
    assert(r.officialReleaseType === null);
    assert(r.articleSource === 'press');
  });
  await test('단순 "검찰" 단어만으로는 isOfficialRelease=false', () => {
    const r = ac.classifyAgencyArticle({
      title: '검찰 측 변호인은 법정에서…',
      source: '동아일보',
      url: 'https://donga.com/x',
    });
    assert(r.isOfficialRelease === false);
  });

  // ────────────────────────────────────────────
  group('5) shouldAutoTrack — 카테고리별 ON/OFF');
  await test('기본 설정에서 probation 자동 추적 ON', () => {
    const cls = { isOfficialRelease: true, officialReleaseType: 'probation' };
    assert(ac.shouldAutoTrack(cls) === true);
  });
  await test('settings.probation=false 시 OFF', () => {
    const cls = { isOfficialRelease: true, officialReleaseType: 'probation' };
    assert(ac.shouldAutoTrack(cls, { probation: false }) === false);
  });
  await test('isOfficialRelease=false 면 항상 false', () => {
    assert(ac.shouldAutoTrack({ isOfficialRelease: false }) === false);
  });
  await test('officialReleaseType 누락 시 false', () => {
    assert(ac.shouldAutoTrack({ isOfficialRelease: true }) === false);
  });

  // ────────────────────────────────────────────
  group('6) autoSyncReportTrackingLinks — 라이프사이클');
  // 임시 DATA_DIR 로 store 모듈을 격리 (env 변경 후 import 해야 함)
  const tmp = path.join(os.tmpdir(), `tc-tracksync-${Date.now()}`);
  await fs.mkdir(path.join(tmp, 'reports'), { recursive: true });
  process.env.DATA_DIR = tmp;
  // store / collector 모듈을 격리된 env 로 dynamic import
  const store = await imp('server/store.js');

  const sampleReport = {
    id: 'test-report-1',
    articles: [
      { id: 'a1', title: '법무부, 보도자료 발표', url: 'https://www.moj.go.kr/news/1',
        source: '법무부', isOfficialRelease: true, officialReleaseType: 'moj',
        agencyName: '법무부', agencyCategory: '법무부 본부' },
      { id: 'a2', title: '서울보호관찰소 사회봉사', url: 'https://example.com/news/2',
        source: '연합뉴스', isOfficialRelease: true, officialReleaseType: 'probation',
        agencyName: '서울보호관찰소', agencyCategory: '보호직 (보호관찰·소년원)' },
      { id: 'a3', title: '외부 언론 기사', url: 'https://example.com/news/3',
        source: '동아일보', isOfficialRelease: false, officialReleaseType: null },
    ],
  };

  await test('자동 sync — 기관 2건만 신규 등록 (a3 skip)', async () => {
    const r = await store.autoSyncReportTrackingLinks(sampleReport);
    assert(r.created.length === 2, `created=${r.created.length}`);
    assert(r.skipped.length === 1, `skipped=${r.skipped.length}`);
    assert(r.created.every(l => l.trackingMode === 'auto'), 'trackingMode 누락');
    assert(r.created.every(l => l.autoCreatedAt), 'autoCreatedAt 누락');
  });

  await test('자동 sync 재실행 — 같은 URL 중복 생성 X (existing 보강)', async () => {
    const r = await store.autoSyncReportTrackingLinks(sampleReport);
    assert(r.created.length === 0, `2번째 호출 created=${r.created.length}`);
    assert(r.existing.length === 2, `existing=${r.existing.length}`);
  });

  await test('자동 sync — settings.moj=false 시 a1 skip', async () => {
    // 새 fixture — 같은 url 이지만 다른 reportId
    const rep2 = { id: 'test-report-2', articles: sampleReport.articles };
    const r = await store.autoSyncReportTrackingLinks(rep2, {
      autoTracking: { moj: false, probation: true, corrections: true, immigration: true, prosecution: true, policy: true, other: true },
    });
    // moj 는 OFF — a1 은 skip, a2 는 이미 있어 existing
    assert(r.created.length === 0);
    assert(r.skipped.length >= 1);  // a1 (moj OFF) + a3 (false)
  });

  await test('자동 sync 후 listTrackingLinks 에 trackingMode=auto 2건', async () => {
    const all = await store.listTrackingLinks();
    const auto = all.filter(l => l.trackingMode === 'auto');
    assert(auto.length === 2, `auto=${auto.length}`);
    // clickHistory 필드 존재
    assert(Array.isArray(auto[0].clickHistory));
  });

  await test('createTrackingLink (manual) — 같은 originalUrl 시 기존 자동 링크 반환 (중복 방지)', async () => {
    const link = await store.createTrackingLink({
      title: '수동으로 같은 URL 등록 시도',
      originalUrl: 'https://www.moj.go.kr/news/1',
      trackingMode: 'manual',
    });
    // 기존 auto 링크와 같은 originalUrl → 그 링크가 반환됨 (중복 방지)
    assert(link.trackingMode === 'auto', `중복 방지 누락: ${link.trackingMode}`);
  });

  await test('recordTrackingClick — userAgent / referrer / clickHistory 저장', async () => {
    const all = await store.listTrackingLinks();
    const t = all[0];
    const before = (t.clickHistory || []).length;
    const updated = await store.recordTrackingClick(t.id, {
      userAgent: 'Mozilla/5.0 Test',
      referrer:  'https://internal.example.com/dashboard',
    });
    assert(updated.clickCount === (t.clickCount || 0) + 1);
    assert(updated.clickHistory.length === before + 1);
    const last = updated.clickHistory[updated.clickHistory.length - 1];
    assert(last.userAgent === 'Mozilla/5.0 Test');
    assert(last.referrer === 'https://internal.example.com/dashboard');
    assert(last.clickedAt && /^\d{4}-/.test(last.clickedAt));
  });

  await test('recordTrackingClick — 50건 보존 한도', async () => {
    const all = await store.listTrackingLinks();
    const t = all[0];
    // 추가 클릭 60회 — 누적 50건 한도 적용
    for (let i = 0; i < 60; i++) {
      await store.recordTrackingClick(t.id, { userAgent: 'x', referrer: '' });
    }
    const after = (await store.listTrackingLinks()).find(l => l.id === t.id);
    assert(after.clickHistory.length === 50, `len=${after.clickHistory.length}`);
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
