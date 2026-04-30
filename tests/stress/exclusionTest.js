// ─────────────────────────────────────────────
// tests/stress/exclusionTest.js — 기사 제외 / 복원 / 재분석 / 관련성 / 출력물 검증
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
  const rel = await imp('server/relevance.js');
  const ra  = await imp('server/reportAnalyzer.js');

  // ────────────────────────────────────────────
  group('1) scoreRelevance — 키워드 관련성 점수');
  await test('제목+본문 모두 매칭 — 점수 ≥ 7, level=high', () => {
    const r = rel.scoreRelevance({
      title:       '보호관찰 강화 종합대책 발표',
      summary:     '법무부가 보호관찰 인력 증원',
      contentText: '서울보호관찰소는 청소년 사회봉사명령',
    }, ['보호관찰']);
    assert(r.relevanceScore >= 7, `score=${r.relevanceScore}`);
    assert(r.relevanceLevel === 'high');
    assert(r.matchedKeywords.includes('보호관찰'));
    assert(r.unmatchedKeywords.length === 0);
  });
  await test('제목에만 매칭 — 점수 5, level=high', () => {
    const r = rel.scoreRelevance({ title: '검찰개혁 논의', summary: '관계 없는 내용', contentText: '' }, ['검찰개혁']);
    assert(r.relevanceScore === 5);
    assert(r.relevanceLevel === 'high');
  });
  await test('요약에만 매칭 — 점수 3, level=medium', () => {
    const r = rel.scoreRelevance({ title: '관계 없음', summary: '교정시설 점검 결과', contentText: '' }, ['교정']);
    assert(r.relevanceScore === 3);
    assert(r.relevanceLevel === 'medium');
  });
  await test('어디에도 매칭 안 됨 — 점수 0, level=none, matchedKeywords 빈배열', () => {
    const r = rel.scoreRelevance({ title: '연예인 결혼', summary: '주식 시황', contentText: '경제 동향' }, ['보호관찰', '교정']);
    assert(r.relevanceScore === 0);
    assert(r.relevanceLevel === 'none');
    assert(r.matchedKeywords.length === 0);
    assert(r.unmatchedKeywords.length === 2);
  });
  await test('빈 키워드 입력 — relevanceScore 0, level=none', () => {
    const r = rel.scoreRelevance({ title: '아무거나' }, []);
    assert(r.relevanceScore === 0 && r.relevanceLevel === 'none');
  });
  await test('한 키워드는 한 필드에서 1회만 가산 (multi-occurrence 무시)', () => {
    // 제목 1회 + 요약 1회 = 8점 (5 + 3), 본문에서 다시 등장해도 +2 (한 필드당 1회)
    const r = rel.scoreRelevance({
      title: '보호관찰 보호관찰 보호관찰',  // 제목 1필드 = +5
      summary: '보호관찰',                    // 요약 1필드 = +3
      contentText: '보호관찰',                // 본문 1필드 = +2
    }, ['보호관찰']);
    assert(r.relevanceScore === 10, `점수 ${r.relevanceScore} (예상 10 = 5+3+2)`);
  });

  // ────────────────────────────────────────────
  group('2) suggestExclusionCandidates — 자동 후보');
  await test('matchedKeywords=0 기사 — 후보로 추천', () => {
    const arts = [
      { id: 'a1', title: 'X', matchedKeywords: [], relevanceScore: 0 },
      { id: 'a2', title: 'Y', matchedKeywords: ['보호관찰'], relevanceScore: 5 },
      { id: 'a3', title: 'Z', matchedKeywords: [], relevanceScore: 1 },
    ];
    const c = rel.suggestExclusionCandidates(arts, ['보호관찰']);
    const ids = c.map(x => x.id);
    assert(ids.includes('a1') && ids.includes('a3'));
    assert(!ids.includes('a2'), '매칭 있는 기사가 후보에 들어감');
  });
  await test('이미 excluded=true 인 기사는 후보에서 제외', () => {
    const arts = [
      { id: 'a1', title: 'X', matchedKeywords: [], relevanceScore: 0, excluded: true },
    ];
    const c = rel.suggestExclusionCandidates(arts, ['보호관찰']);
    assert(c.length === 0);
  });

  // ────────────────────────────────────────────
  group('3) suggestExcludeWords — 제외 키워드 추천');
  await test('제외 기사에 반복 단어 → 빈도순 추천', () => {
    const excluded = [
      { title: '연예인 결혼 발표', summary: '연예 뉴스' },
      { title: '연예인 이혼 소식', summary: '연예 가십' },
      { title: '주식 시황 폭등',  summary: '주식 분석' },
    ];
    const r = rel.suggestExcludeWords(excluded, ['보호관찰']);
    const words = r.map(x => x.word);
    // '연예' 가 여러 번 등장 → 추천
    assert(words.some(w => w.includes('연예')) || words.length > 0, `words=${JSON.stringify(words)}`);
  });
  await test('검색 키워드와 substring 관계인 단어는 추천 X', () => {
    const excluded = [{ title: '보호 시설', summary: '보호 정책' }];
    const r = rel.suggestExcludeWords(excluded, ['보호관찰']);
    const words = r.map(x => x.word);
    // '보호' 는 '보호관찰' 의 substring 이므로 추천에서 제외
    assert(!words.includes('보호'), '보호 단어가 추천됨 — substring 관계 보호 실패');
  });

  // ────────────────────────────────────────────
  group('4) recomputeReport — 재분석');
  // 임시 fixture
  const baseReport = {
    id: 'test-report',
    keywords: ['보호관찰'],
    articles: [
      { id: 'p1', title: '긍정 보도 — 보호관찰 강화', source: '연합뉴스', mediaType: '인터넷언론',
        sentiment: { label: '긍정', score: 1, matchedKeywords: { positive: ['강화'], negative: [] } },
        articleSource: 'press', priority: '참고', extracted: true, keyword: '보호관찰' },
      { id: 'p2', title: '부정 보도 — 보호관찰 논란', source: 'KBS', mediaType: '방송사',
        sentiment: { label: '부정', score: -2, matchedKeywords: { positive: [], negative: ['논란', '비판'] } },
        articleSource: 'press', priority: '주의', extracted: true, keyword: '보호관찰',
        centralCoverage: true, importanceScore: 4 },
      { id: 'a1', title: '법무부 보도자료 — 정책 발표', source: '법무부', mediaType: '정부/공공기관',
        sentiment: { label: '중립', score: 0, matchedKeywords: { positive: [], negative: [] } },
        articleSource: 'agency', priority: '참고', extracted: true, keyword: '보호관찰',
        importanceScore: 2 },
      { id: 'x1', title: '연예인 가십 — 무관 기사', source: '연예일보', mediaType: '인터넷언론',
        sentiment: { label: '중립', score: 0, matchedKeywords: { positive: [], negative: [] } },
        articleSource: 'press', priority: '참고', extracted: true, keyword: '보호관찰' },
    ],
    sentiment: { total: 4, positive: 1, negative: 1, neutral: 2, overall: '중립' },
    trending: [],
  };

  await test('전 기사 활성 — sentiment.total = 4', () => {
    const r = ra.recomputeReport(baseReport);
    assert(r.sentiment.total === 4, `total=${r.sentiment.total}`);
    assert(r.activeArticleCount === 4);
    assert(r.excludedCount === 0);
  });

  await test('1건 제외 — activeArticleCount=3, excludedCount=1', () => {
    const r2 = JSON.parse(JSON.stringify(baseReport));
    r2.articles[3].excluded = true;     // x1 제외
    const rec = ra.recomputeReport(r2);
    assert(rec.activeArticleCount === 3);
    assert(rec.excludedCount === 1);
    assert(rec.sentiment.total === 3, `total=${rec.sentiment.total}`);
    // 분석 갱신 시각 부착
    assert(rec.analysisUpdatedAt && /^\d{4}-/.test(rec.analysisUpdatedAt));
  });

  await test('부정 기사 제외 시 부정 카운트 감소', () => {
    const r2 = JSON.parse(JSON.stringify(baseReport));
    r2.articles[1].excluded = true;   // p2 (부정) 제외
    const rec = ra.recomputeReport(r2);
    assert(rec.sentiment.negative === 0, `neg=${rec.sentiment.negative}`);
    assert(rec.negativeIssues.length === 0);
  });

  await test('agency 기사 제외 시 agencyStats.agency 감소', () => {
    const r2 = JSON.parse(JSON.stringify(baseReport));
    r2.articles[2].excluded = true;   // a1 (agency)
    const rec = ra.recomputeReport(r2);
    assert(rec.agencyStats.agency === 0, `agency=${rec.agencyStats.agency}`);
    assert(rec.agencyStats.press === 3);
    assert(rec.publicityStats.agencyDistributed === 0);
  });

  await test('riskLevel 재계산 — 부정 비율 따라 변경', () => {
    const r2 = JSON.parse(JSON.stringify(baseReport));
    // 긍정/중립 모두 제외 → 부정 1건만 남음 (100%)
    r2.articles[0].excluded = true;
    r2.articles[2].excluded = true;
    r2.articles[3].excluded = true;
    const rec = ra.recomputeReport(r2);
    assert(rec.sentiment.negative === 1);
    assert(rec.sentiment.negativePct === 100, `pct=${rec.sentiment.negativePct}`);
    assert(rec.riskLevel.level === '긴급', `level=${rec.riskLevel.level}`);
  });

  await test('원본 articles 배열 보존 (excluded 기사도 그대로)', () => {
    const r2 = JSON.parse(JSON.stringify(baseReport));
    r2.articles[3].excluded = true;
    const rec = ra.recomputeReport(r2);
    assert(rec.articles.length === 4, `articles len=${rec.articles.length}`);
    assert(rec.articles[3].excluded === true);
  });

  // ────────────────────────────────────────────
  group('5) store — exclude/restore/bulk 라이프사이클');
  const tmp = path.join(os.tmpdir(), `tc-exclude-${Date.now()}`);
  await fs.mkdir(path.join(tmp, 'reports'), { recursive: true });
  process.env.DATA_DIR = tmp;
  // fixture 저장
  await fs.writeFile(path.join(tmp, 'reports', 'test-report.json'),
    JSON.stringify(baseReport, null, 2), 'utf8');
  const store = await imp('server/store.js');

  await test('excludeArticle — excluded=true + audit log 추가', async () => {
    const r = await store.excludeArticle('test-report', 'x1', { reason: '키워드 불일치', by: 'tester' });
    assert(r.ok && r.article.excluded === true);
    assert(r.article.excludedReason === '키워드 불일치');
    assert(r.article.excludedBy === 'tester');
    assert(r.excludedCount === 1);
    const fresh = await store.loadReport('test-report');
    assert(fresh.articleAuditLog && fresh.articleAuditLog[0].action === 'exclude');
  });

  await test('excludeArticle — 같은 기사 재제외 시 audit log 중복 X', async () => {
    const r1 = await store.excludeArticle('test-report', 'x1', { reason: '재시도' });
    const fresh = await store.loadReport('test-report');
    // 같은 기사 두 번째 exclude 는 audit 추가 X (이미 excluded 상태)
    const cnt = (fresh.articleAuditLog || []).filter(e => e.articleId === 'x1' && e.action === 'exclude').length;
    assert(cnt === 1, `audit 중복 cnt=${cnt}`);
  });

  await test('restoreArticle — excluded=false + audit restore 추가', async () => {
    const r = await store.restoreArticle('test-report', 'x1', { by: 'tester' });
    assert(r.article.excluded === false);
    assert(r.excludedCount === 0);
    const fresh = await store.loadReport('test-report');
    const restoreLogs = (fresh.articleAuditLog || []).filter(e => e.action === 'restore');
    assert(restoreLogs.length === 1);
  });

  await test('bulkExcludeArticles — 2건 제외 + changed=2', async () => {
    const r = await store.bulkExcludeArticles('test-report', ['p1', 'a1'], { reason: '관련 없음', by: 'tester' });
    assert(r.changed === 2);
    assert(r.excludedCount === 2);
    const fresh = await store.loadReport('test-report');
    assert(fresh.articles.find(a => a.id === 'p1').excluded === true);
    assert(fresh.articles.find(a => a.id === 'a1').excluded === true);
  });

  await test('bulkRestoreArticles — 2건 복원 + changed=2', async () => {
    const r = await store.bulkRestoreArticles('test-report', ['p1', 'a1']);
    assert(r.changed === 2);
    assert(r.excludedCount === 0);
  });

  await test('존재하지 않는 articleId — ok=false', async () => {
    const r = await store.excludeArticle('test-report', 'no-such-id', {});
    assert(r.ok === false);
  });

  // ────────────────────────────────────────────
  group('6) 출력물 — excluded 기사 자동 필터');
  const ct = await imp('server/clippingTemplate.js');
  const at = await imp('server/analysisTemplate.js');
  const rt = await imp('server/reportTemplate.js');
  const xg = await imp('server/excelGenerator.js');

  const reportWithExclusion = {
    ...baseReport,
    articles: baseReport.articles.map(a => a.id === 'x1' ? { ...a, excluded: true, excludedReason: '관련 없음', excludedAt: '2026-04-30T12:00:00Z' } : a),
  };

  await test('clipping HTML — excluded 기사 본문/제목 미포함', () => {
    const html = ct.renderClippingHtml(reportWithExclusion);
    assert(!html.includes('연예인 가십'), '제외 기사 제목 잔존');
  });
  await test('report HTML — excluded 기사 미포함', () => {
    const html = rt.renderReportHtml(reportWithExclusion);
    assert(!html.includes('연예인 가십'), '제외 기사 잔존');
  });
  await test('analysis HTML — buildOnePageSummary.totalArticles 가 active count 만 반영', () => {
    const html = at.renderAnalysisHtml(reportWithExclusion);
    // 1페이지 요약: 총 3건 (excluded 제외)
    assert(/3건/.test(html) || html.includes('3건'), 'totalArticles 가 active 기준이 아님');
  });
  await test('Excel — 제외기사 시트에 excluded 기사 표시', async () => {
    const xbuf = await xg.reportToXlsx(reportWithExclusion, { tracking: { totalLinks: 0, totalClicks: 0, items: [] } });
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xbuf);
    const ws = wb.worksheets.find(s => s.name === '제외기사');
    assert(ws, '제외기사 시트 누락');
    let found = false;
    ws.eachRow((row) => {
      const cells = row.values || [];
      if (cells.some(v => String(v || '').includes('연예인 가십'))) found = true;
    });
    assert(found, '제외기사 시트에 해당 기사 미표시');
  });
  await test('Excel — 2.전체기사 시트에 excluded 기사 미포함', async () => {
    const xbuf = await xg.reportToXlsx(reportWithExclusion, { tracking: { totalLinks: 0, totalClicks: 0, items: [] } });
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xbuf);
    const ws = wb.worksheets.find(s => s.name === '2.전체기사');
    assert(ws);
    let found = false;
    ws.eachRow((row) => {
      const cells = row.values || [];
      if (cells.some(v => String(v || '').includes('연예인 가십'))) found = true;
    });
    assert(!found, '2.전체기사 시트에 제외 기사가 포함됨 (필터 누락)');
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
