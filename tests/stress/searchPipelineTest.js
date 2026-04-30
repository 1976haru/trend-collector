// ─────────────────────────────────────────────
// tests/stress/searchPipelineTest.js — 검색 파이프라인 재설계 검증 (사용자 spec 14절)
//
// 핵심 케이스:
//   A. 전자감독 → 보호관찰 맥락 포함, 금융감독원 / KBL 농구 감독 제외
//   B. 보호관찰 → 보호관찰소 등 포함, 불소도포 / 치과 제외
//   C. 교정     → 교정본부 등 포함, 치아교정 / 자세교정 제외
//   D. 출입국   → 출입국외국인청 등 포함, 여행 후기 제외
//   E. 검찰     → 검찰청 등 포함, 무관 표현 제외
//   F. 법원     → 판결/재판 등 포함, 법원 맛집 / 법원 경매 광고 제외
//   G. 본문 정제 — "많이 본 뉴스" 등 잡텍스트 제거
//   H. activeArticles 헬퍼 — excluded || relevancePassed=false 모두 제외
// ─────────────────────────────────────────────

import path from 'node:path';
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
  const intent     = await imp('server/searchIntent.js');
  const scorer     = await imp('server/relevanceScorer.js');
  const cleaner    = await imp('server/articleCleaner.js');
  const collector  = await imp('server/collector.js');

  // ────────────────────────────────────────────
  group('1) detectSearchIntent — 카테고리 자동 분류');
  await test('보호관찰 키워드 → category=probation', () => {
    const i = intent.detectSearchIntent(['보호관찰', '전자감독'], null);
    assert(i.category === 'probation', `got ${i.category}`);
    assert(i.strictMode === true);
    assert(i.requiredContextTerms.includes('보호관찰소'));
    assert(i.positiveContextTerms.includes('전자감독'));
  });
  await test('selectedQuickCategory 우선 적용', () => {
    const i = intent.detectSearchIntent(['감독'], 'probation');
    assert(i.category === 'probation');
  });
  await test('searchMode=raw 시 strictMode=false', () => {
    const i = intent.detectSearchIntent(['보호관찰'], null, { searchMode: 'raw' });
    assert(i.searchMode === 'raw' && i.strictMode === false);
  });

  // ────────────────────────────────────────────
  group('2) A. 전자감독 — 도메인 포함 / 무관 분야 제외');
  const probationIntent = intent.detectSearchIntent(['전자감독', '보호관찰'], 'probation');
  await test('포함: 전자발찌 부착명령 보호관찰소', () => {
    const r = scorer.scoreArticleRelevance({
      title: '전자감독 대상자 부착명령 강화', summary: '보호관찰소가 운영하는 전자발찌 시스템',
      contentText: '서울보호관찰소는 부착명령 대상자의 재범 방지를 위한 새 시스템 도입.',
    }, probationIntent);
    assert(r.passed === true, `passed=${r.passed} score=${r.score}`);
    assert(r.level === 'high', `level=${r.level}`);
    assert(!r.autoExcluded);
  });
  await test('제외: 금융감독원 / 전자공시', () => {
    const r = scorer.scoreArticleRelevance({
      title: '금융감독원 DART 전자공시 시스템 개편',
      summary: 'IPO / 유상증자 / 코스닥 공시',
      contentText: '금감원은 투자주의 종목 모니터링을 강화한다.',
    }, probationIntent);
    assert(r.passed === false, `passed=${r.passed}, evidence=${r.evidence?.join(' | ')}`);
    assert(r.autoExcluded === true);
    assert(r.level === 'none' || r.level === 'low');
    // 강한 노이즈 매칭 확인
    assert(r.matchedStrongNoise.length > 0, `strong noise empty: ${JSON.stringify(r.matchedStrongNoise)}`);
  });
  await test('제외: KBL 프로농구 감독', () => {
    const r = scorer.scoreArticleRelevance({
      title: 'KBL 정관장 KCC 코칭스태프 감독 교체',
      summary: '프로농구 플레이오프 진출',
      contentText: '치어리더 응원 속에 챔프전 시작',
    }, probationIntent);
    assert(r.autoExcluded === true);
    assert(r.matchedStrongNoise.some(n => /KBL|프로농구|치어리더/.test(n)));
  });

  // ────────────────────────────────────────────
  group('3) B. 보호관찰 — 불소도포 / 치과 제외');
  await test('포함: 사회봉사명령 수강명령', () => {
    const r = scorer.scoreArticleRelevance({
      title: '보호관찰 대상 사회봉사명령 확대',
      summary: '수강명령 시범사업', contentText: '보호관찰소 협력',
    }, probationIntent);
    assert(r.passed === true);
  });
  await test('제외: 불소도포, 치과 건강 기사', () => {
    const r = scorer.scoreArticleRelevance({
      title: '불소도포, 언제 해야 효과 볼 수 있을까',
      summary: '소아 치아 건강 / 충치 예방',
      contentText: '치과 의사들은 6세 전후 권장',
    }, probationIntent);
    assert(r.autoExcluded === true);
    assert(r.matchedStrongNoise.some(n => /불소도포|치아교정/.test(n)));
  });

  // ────────────────────────────────────────────
  group('4) C. 교정 — 치아교정 / 자세교정 제외');
  const correctionsIntent = intent.detectSearchIntent(['교정'], 'corrections');
  await test('포함: 교정본부 교도소 가석방', () => {
    const r = scorer.scoreArticleRelevance({
      title: '교정본부 교도소 가석방 심사 기준 강화',
      summary: '수용자 교화', contentText: '구치소 환경 개선',
    }, correctionsIntent);
    assert(r.passed === true);
  });
  await test('제외: 치아교정 / 자세교정 / 시력 교정 (동음이의어)', () => {
    const r = scorer.scoreArticleRelevance({
      title: '치아교정 비용 정리', summary: '자세 교정 운동',
      contentText: '시력 교정 안경',
    }, correctionsIntent);
    assert(r.autoExcluded === true);
  });

  // ────────────────────────────────────────────
  group('5) D. 출입국 — 여행 후기 제외');
  const immIntent = intent.detectSearchIntent(['출입국'], 'immigration');
  await test('포함: 출입국외국인청 / 외국인보호소 / 강제퇴거', () => {
    const r = scorer.scoreArticleRelevance({
      title: '서울출입국외국인청 외국인보호소 인권 점검',
      summary: '강제퇴거 절차 개선', contentText: '체류 외국인 정책',
    }, immIntent);
    assert(r.passed === true);
  });
  await test('제외: 항공권 특가 / 면세점 쇼핑', () => {
    const r = scorer.scoreArticleRelevance({
      title: '항공권 특가 / 면세점 쇼핑몰 할인',
      summary: '여행 후기 / 호텔 패키지',
      contentText: '관광 홍보',
    }, immIntent);
    assert(r.autoExcluded === true);
  });

  // ────────────────────────────────────────────
  group('6) E. 검찰 — 인기기사 추천 영역 제외');
  const prosIntent = intent.detectSearchIntent(['검찰'], 'prosecution');
  await test('포함: 검찰청 수사 압수수색 기소', () => {
    const r = scorer.scoreArticleRelevance({
      title: '서울중앙지검 압수수색 후 기소',
      summary: '검찰 수사 결과', contentText: '대검찰청 발표',
    }, prosIntent);
    assert(r.passed === true);
  });

  // ────────────────────────────────────────────
  group('7) G. articleCleaner — 본문 잡텍스트 제거');
  await test('"많이 본 뉴스" 다음 영역 cut', () => {
    const raw = '서울보호관찰소는 5월부터 사회봉사명령 시범 운영을 시작한다.\n해당 사업은 청소년 대상자에게 적용된다.\n관계 부서는 효과 검증 후 전국 확대를 검토할 예정이다.\n많이 본 뉴스\nKBL 정관장 우승\n금감원 IPO 제재\n불소도포 치과 추천';
    const c = cleaner.cleanArticleContent(raw);
    assert(c.cleanText.includes('서울보호관찰소'));
    assert(!c.cleanText.includes('KBL 정관장'), 'KBL 잡텍스트 잔존');
    assert(!c.cleanText.includes('많이 본 뉴스'));
    assert(c.boilerplateRatio > 0);
  });
  await test('"좋아요/슬퍼요" 라인 제거', () => {
    const raw = '본문 정상 내용\n좋아요 12\n슬퍼요 3\n화나요 5\n팬이에요 7';
    const c = cleaner.cleanArticleContent(raw);
    assert(c.cleanText === '본문 정상 내용');
  });
  await test('무단전재 / 광고문의 / 회사소개 제거', () => {
    const raw = '본문\n무단 전재 및 재배포 금지\n광고·제휴 문의\n이용약관';
    const c = cleaner.cleanArticleContent(raw);
    assert(c.cleanText === '본문');
  });

  // ────────────────────────────────────────────
  group('8) H. getActiveArticles 헬퍼');
  await test('excluded=true 또는 relevancePassed=false 모두 제외', () => {
    const report = {
      articles: [
        { id: 'a1', excluded: false, relevancePassed: true },
        { id: 'a2', excluded: true,  relevancePassed: true },
        { id: 'a3', excluded: false, relevancePassed: false },
        { id: 'a4', excluded: false /* relevancePassed undefined → 통과 */ },
      ],
    };
    const active = collector.getActiveArticles(report);
    const ids = active.map(a => a.id);
    assert(ids.includes('a1'));
    assert(!ids.includes('a2'));   // excluded
    assert(!ids.includes('a3'));   // relevancePassed=false
    assert(ids.includes('a4'));    // relevancePassed undefined → 통과
  });

  // ────────────────────────────────────────────
  group('9) rescoreReport — 일괄 적용 + autoExcluded set');
  await test('보호관찰 의도 + 무관 기사 다수 → 자동 제외', () => {
    const report = {
      articles: [
        { id: 'p1', title: '보호관찰 강화', summary: '법무부 발표', contentText: '재범방지' },
        { id: 'p2', title: '불소도포 효과', summary: '치과 건강', contentText: '충치 예방' },
        { id: 'p3', title: 'KBL 농구 감독 교체', summary: '프로농구', contentText: '치어리더' },
        { id: 'p4', title: '서울보호관찰소 사회봉사', summary: '준법지원센터', contentText: '수강명령' },
      ],
    };
    const i = intent.detectSearchIntent(['보호관찰'], 'probation');
    const stats = scorer.rescoreReport(report, i);
    // p1, p4 통과 / p2, p3 자동 제외
    assert(report.articles[0].relevancePassed === true);
    assert(report.articles[3].relevancePassed === true);
    assert(report.articles[1].excluded === true && report.articles[1].excludedBy === 'system-auto');
    assert(report.articles[2].excluded === true && report.articles[2].excludedBy === 'system-auto');
    assert(stats.pass === 2);
    assert(stats.autoExcluded === 2);
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
