// ─────────────────────────────────────────────
// tests/stress/agentsTest.js — 에이전트 파이프라인 7개 검증
//
// 검증 항목 (스펙):
//   1) 관련성 없는 기사 자동 제외 / 관련성 통과율 계산
//   2) 위험 이슈 감지 — 부정 비율 / 동일 이슈 / 중앙언론 부정
//   3) 보고서 요약 생성 — executiveSummary / dailyBrief / 기승전결
//   4) 홍보성과 계산 — 등급 산정 5종 분기
//   5) 품질 경고 표시 — 한글 깨짐 / 추출 실패 / PDF 위험
//   6) 에이전트 ON/OFF — settings 로 비활성 시 skipped 결과
//   7) LLM 비활성 상태에서 정상 작동
//   8) Word/Excel 반영 (생성만 검증, 내용 sanity check)
// ─────────────────────────────────────────────

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const results = [];
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

// ── 테스트 fixture 빌더 ───────────────────────
function makeArticle(overrides = {}) {
  return {
    id: 'a' + Math.random().toString(36).slice(2, 8),
    title: '보호관찰 강화 종합대책 발표',
    summary: '법무부가 보호관찰 인력 증원을 발표함',
    contentText: '서울보호관찰소는 청소년 사회봉사명령을 강화한다고 밝혔다.',
    source: '연합뉴스',
    keyword: '보호관찰',
    sourceProvider: 'google',
    url: 'https://www.example.com/news/123',
    extracted: true,
    images: [{ url: 'https://x.com/i.jpg' }],
    sentiment: { label: '중립', score: 0, matchedKeywords: { positive: [], negative: [] } },
    relevanceLevel: 'high',
    relevanceScore: 8,
    relevancePassed: true,
    matchedKeywords: ['보호관찰'],
    isOfficialRelease: false,
    articleSource: 'press',
    excluded: false,
    priority: '참고',
    publicityRating: '일반',
    reCiteCount: 0,
    centralCoverage: false,
    importanceScore: 1,
    ...overrides,
  };
}

function makeReport(overrides = {}) {
  const articles = overrides.articles || [makeArticle()];
  const total = articles.filter(a => !a.excluded).length;
  return {
    id: 'r-test',
    title: '테스트 리포트',
    generatedAt: new Date().toISOString(),
    keywords: ['보호관찰'],
    excludes: [],
    trigger: 'manual',
    articles,
    errors: [],
    period: { from: Date.now() - 86400000, to: Date.now(), label: '24h' },
    sourceCounts: { google: total },
    sentiment: { total, positive: 0, negative: 0, neutral: total, positivePct: 0, negativePct: 0, neutralPct: 100, overall: '중립' },
    mediaCounts: { '통신사': total },
    trending: [],
    groups: [{ signature: 'sig', count: total, sources: ['연합뉴스'], titles: ['보호관찰 강화 종합대책 발표'], priority: '참고' }],
    riskLevel: { level: '안정', reasons: [] },
    agencyStats: { agency: 0, press: total, byAgency: {} },
    publicityStats: { agencyDistributed: 0, totalReCites: 0, centralCoverage: 0, averageImportance: 0, topAgencyItems: [] },
    extractionStats: { total, extracted: total, failed: 0, withImage: total, withoutImage: 0, quality: { success: total, partial: 0, fallback: 0, failed: 0 } },
    extractedCount: total,
    relevanceQuality: { total, pass: total, autoExcluded: 0, manualExcluded: 0, byLevel: {}, byNoiseCategory: {}, autoExcludeReasons: {} },
    negativeIssues: [],
    positiveIssues: [],
    neutralIssues: articles,
    actionRequired: [],
    ...overrides,
  };
}

async function main() {
  const ag = await imp('server/agents/index.js');

  // ────────────────────────────────────────────
  group('1) 관련성 검증 에이전트 — 자동 제외 / 통과율');
  await test('관련성 양호 — 통과율 100%, verdict=관련성 양호', () => {
    const r = makeReport();
    const out = ag.runRelevanceAgent(r);
    assert(out.passRate === 100, `passRate=${out.passRate}`);
    assert(out.verdict === '관련성 양호', `verdict=${out.verdict}`);
    assert(out.distribution.high === 1, `high=${out.distribution.high}`);
  });
  await test('관련성 없는 기사 — none 카운트 + 자동 제외 사유 캡처', () => {
    const r = makeReport({
      articles: [
        makeArticle({ id: 'a1', relevanceLevel: 'none', relevanceScore: 0, matchedKeywords: [], relevancePassed: false, excluded: true, autoExcluded: true, excludedBy: 'system-auto', autoExcludeReason: '도메인 미스매치' }),
        makeArticle({ id: 'a2', relevanceLevel: 'high' }),
      ],
    });
    const out = ag.runRelevanceAgent(r);
    assert(out.distribution.none >= 1, `none=${out.distribution.none}`);
    assert(out.autoExcludedCount === 1, `autoExcludedCount=${out.autoExcludedCount}`);
    assert(out.autoExcluded[0].reason.includes('도메인'), 'auto excluded reason captured');
  });
  await test('공공기관 도메인 매칭 — 점수 보강', () => {
    const r = makeReport({
      articles: [makeArticle({ contentText: '법무부 검찰 보호관찰소 정책 발표' })],
    });
    const out = ag.runRelevanceAgent(r);
    assert(out.publicDomainHits >= 1, `publicDomainHits=${out.publicDomainHits}`);
  });

  // ────────────────────────────────────────────
  group('2) 위험 이슈 감지 에이전트');
  await test('부정 비율 50% 이상 → 긴급', () => {
    const arts = [];
    for (let i = 0; i < 5; i++) arts.push(makeArticle({ id: 'n'+i, sentiment: { label: '부정', score: -3, matchedKeywords: { positive: [], negative: ['논란'] } } }));
    for (let i = 0; i < 5; i++) arts.push(makeArticle({ id: 'p'+i, sentiment: { label: '중립' } }));
    const r = makeReport({
      articles: arts,
      sentiment: { total: 10, positive: 0, negative: 5, neutral: 5, positivePct: 0, negativePct: 50, neutralPct: 50, overall: '부정 우세' },
    });
    const out = ag.runRiskAgent(r);
    assert(out.level === '긴급', `level=${out.level}`);
    assert(out.reasons.some(r => r.includes('50%')), 'reason includes 50%');
  });
  await test('부정 비율 30~49% → 주의', () => {
    const r = makeReport({
      sentiment: { total: 10, positive: 1, negative: 3, neutral: 6, positivePct: 10, negativePct: 30, neutralPct: 60, overall: '중립' },
    });
    const out = ag.runRiskAgent(r);
    assert(out.level === '주의', `level=${out.level}`);
  });
  await test('동일 이슈 5건 이상 반복 → 주의 상승', () => {
    const r = makeReport({
      groups: [{ signature: 'sig1', count: 6, sources: ['A','B','C','D','E','F'], titles: ['반복 이슈'], priority: '참고' }],
    });
    const out = ag.runRiskAgent(r);
    assert(out.level !== '안정', `level=${out.level}`);
    assert(out.repeatedIssues.length === 1, 'repeatedIssues length');
    assert(out.mediaSpread === 6, `mediaSpread=${out.mediaSpread}`);
  });
  await test('중앙언론 + 부정 키워드 → 우선순위 상승', () => {
    const arts = [];
    for (let i = 0; i < 3; i++) arts.push(makeArticle({ id: 'cn'+i, source: '조선일보', sentiment: { label: '부정', matchedKeywords: { negative: ['비판'] } } }));
    const r = makeReport({
      articles: arts,
      sentiment: { total: 3, positive: 0, negative: 3, neutral: 0, positivePct: 0, negativePct: 100, neutralPct: 0, overall: '부정 우세' },
    });
    const out = ag.runRiskAgent(r);
    assert(out.level === '긴급', `level=${out.level}`);
    assert(out.centralNegativeCount === 3, `centralNegative=${out.centralNegativeCount}`);
  });

  // ────────────────────────────────────────────
  group('3) 보고서 작성 에이전트');
  await test('executiveSummary / dailyBrief / 기승전결 모두 생성', () => {
    const r = makeReport();
    const out = ag.runReportAgent(r);
    assert(out.executiveSummary && out.executiveSummary.includes('○ 일자'), 'executiveSummary 생성');
    assert(out.dailyBrief && out.dailyBrief.length > 20, 'dailyBrief 생성');
    assert(out.storyArc.introduction && out.storyArc.development && out.storyArc.turn && out.storyArc.conclusion, '기승전결 4개 모두');
    assert(out.responseRecommendation && out.responseRecommendation.length > 0, '대응 권고 있음');
    assert(Array.isArray(out.monitoringKeywords), '모니터링 키워드 배열');
  });
  await test('LLM 비활성 시 llmEnabled=false', () => {
    const out = ag.runReportAgent(makeReport(), { llmEnabled: false });
    assert(out.llmEnabled === false);
    assert(out.llmPolished === false);
  });
  await test('공공기관 보고 문체 — ~임 / ~함 / ~필요함 / ~판단됨', () => {
    const r = makeReport({
      sentiment: { total: 10, positive: 0, negative: 5, neutral: 5, positivePct: 0, negativePct: 50, neutralPct: 50, overall: '부정 우세' },
      riskLevel: { level: '긴급', reasons: ['부정 비율 50%'] },
    });
    const out = ag.runReportAgent(r);
    const text = out.dailyBrief + ' ' + out.storyArc.introduction + ' ' + out.storyArc.conclusion;
    assert(/[임함됨]\.|필요함|판단됨/.test(text), `gov-report 문체 미준수: ${text}`);
  });

  // ────────────────────────────────────────────
  group('4) 홍보성과 분석 에이전트');
  await test('일반 등급 — 기관 배포자료 0', () => {
    const out = ag.runPublicityAgent(makeReport());
    assert(out.publicityRating === '일반', `rating=${out.publicityRating}`);
    assert(out.officialReleaseCount === 0);
  });
  await test('파급 가능 — 중앙언론 노출만 1', () => {
    const r = makeReport({
      articles: [makeArticle({ articleSource: 'agency', centralCoverage: true })],
    });
    const out = ag.runPublicityAgent(r);
    assert(out.publicityRating === '파급 가능', `rating=${out.publicityRating}`);
  });
  await test('확산 양호 — 재인용 5건 이상', () => {
    const r = makeReport({
      articles: [makeArticle({ articleSource: 'agency', reCiteCount: 6 })],
    });
    const out = ag.runPublicityAgent(r);
    assert(out.publicityRating === '확산 양호', `rating=${out.publicityRating}`);
  });
  await test('관심 매우 높음 — 클릭 100+ + 중앙', () => {
    const r = makeReport({
      articles: [makeArticle({ articleSource: 'agency', centralCoverage: true })],
    });
    const out = ag.runPublicityAgent(r, { tracking: { totalClicks: 150, totalLinks: 5 } });
    assert(out.publicityRating === '관심 매우 높음', `rating=${out.publicityRating}`);
  });
  await test('대응 필요 — 부정 3+ + 중앙', () => {
    const arts = [
      makeArticle({ id: 'c1', articleSource: 'agency', centralCoverage: true, reCiteCount: 4 }),
      ...Array.from({ length: 3 }).map((_, i) => makeArticle({ id: 'n'+i, sentiment: { label: '부정' } })),
    ];
    const out = ag.runPublicityAgent(makeReport({ articles: arts }));
    assert(out.publicityRating === '대응 필요', `rating=${out.publicityRating}`);
  });

  // ────────────────────────────────────────────
  group('5) 품질 점검 에이전트');
  await test('정상 — 점수 ≥ 85, grade=우수', () => {
    const out = ag.runQualityAgent(makeReport());
    assert(out.qualityScore >= 85, `score=${out.qualityScore}`);
    assert(out.grade === '우수' || out.grade === '양호', `grade=${out.grade}`);
  });
  await test('한글 깨짐 의심 — warning 발생', () => {
    const r = makeReport({
      articles: [makeArticle({ contentText: '��� broken text �' })],
    });
    const out = ag.runQualityAgent(r);
    assert(out.counts.brokenKoreanSuspect >= 1, `brokenKoreanSuspect=${out.counts.brokenKoreanSuspect}`);
    assert(out.warnings.some(w => w.code === 'korean-broken'), '한글 깨짐 경고');
  });
  await test('추출 실패 다수 — Word 권장', () => {
    const arts = [];
    for (let i = 0; i < 10; i++) arts.push(makeArticle({ id: 'f'+i, extracted: false }));
    const out = ag.runQualityAgent(makeReport({ articles: arts }));
    assert(out.recommendedDownloadType === 'word', `recommend=${out.recommendedDownloadType}`);
    assert(out.warnings.some(w => w.code === 'extraction-failed'), '추출 실패 경고');
  });
  await test('PDF 위험 — 이미지 60+ → Word 권장', () => {
    const imgs = Array.from({ length: 70 }, (_, i) => ({ url: `https://x.com/${i}.jpg` }));
    const out = ag.runQualityAgent(makeReport({
      articles: [makeArticle({ images: imgs })],
    }));
    assert(out.pdfRisk === true, `pdfRisk=${out.pdfRisk}`);
    assert(out.recommendedDownloadType === 'word', `recommend=${out.recommendedDownloadType}`);
  });
  await test('기사 0건 — qualityScore=0, no-articles 경고', () => {
    const out = ag.runQualityAgent(makeReport({ articles: [] }));
    assert(out.qualityScore === 0, `score=${out.qualityScore}`);
    assert(out.warnings.some(w => w.code === 'no-articles'), 'no-articles 경고');
    assert(out.recommendedDownloadType === 'none');
  });

  // ────────────────────────────────────────────
  group('6) 수집 + 개선 제안 에이전트');
  await test('수집 — sourceCounts / 누락 키워드 식별', () => {
    const r = makeReport({
      keywords: ['보호관찰', '교정시설'],     // 두 번째 키워드는 결과 없음
      articles: [makeArticle()],
    });
    const out = ag.runCollectionAgent(r);
    assert(out.rawCount === 1, `rawCount=${out.rawCount}`);
    assert(out.unusedKeywords.includes('교정시설'), '교정시설 누락 의심 식별');
    assert(out.collectionSummary.includes('총 1건'), 'summary');
  });
  await test('개선 제안 — 제외 키워드 / 도메인 룰 / 누락 키워드 / 기능 개선', () => {
    const arts = [
      makeArticle({ id: 'e1', excluded: true, source: '연예매체', title: '연예인 결혼식 화제 화제 화제', summary: '관련 없음' }),
      makeArticle({ id: 'e2', excluded: true, source: '연예매체', title: '아이돌 화제 화제 화제 컴백', summary: '관련 없음' }),
      makeArticle({ id: 'e3', excluded: true, source: '연예매체', title: '드라마 종영 화제 화제 화제', summary: '관련 없음' }),
      makeArticle({ id: 'f1', extracted: false, url: 'https://broken-domain.com/a' }),
      makeArticle({ id: 'f2', extracted: false, url: 'https://broken-domain.com/b' }),
    ];
    const out = ag.runSuggestionAgent(makeReport({
      keywords: ['보호관찰', '교정', '검찰'],
      articles: arts,
    }), { feedback: [{ id: 'f', title: '폰트 깨짐', severity: '높음', read: false }] });
    assert(out.suggestedDomainRules.length >= 1, `domain rules=${out.suggestedDomainRules.length}`);
    assert(out.suggestedDomainRules.some(d => d.domain === 'broken-domain.com'), 'broken-domain detected');
    assert(out.suggestedDomainRules.some(d => d.ruleType === 'auto-exclude-media'), '매체 차단 제안');
    assert(out.suggestedKeywordCheck.length >= 1, '검색 누락 의심 키워드 추천');
    assert(out.suggestedFeatureImprovements.length >= 1, 'feedback 반영');
  });

  // ────────────────────────────────────────────
  group('7) 오케스트레이터 — settings ON/OFF + LLM 비활성');
  await test('전체 ON (기본값) — 7개 에이전트 모두 결과 반환', () => {
    const out = ag.runAgents(makeReport());
    for (const k of ['collection', 'relevance', 'risk', 'report', 'publicity', 'quality', 'suggestion']) {
      assert(out[k] && !out[k].skipped, `${k} 결과 있음`);
    }
    assert(out.runMeta && out.runMeta.llmEnabled === false, 'LLM 비활성 (테스트 환경)');
  });
  await test('settings OFF — 비활성 에이전트는 skipped:true', () => {
    const out = ag.runAgents(makeReport(), {
      settings: { riskAgent: false, publicityAgent: false },
    });
    assert(out.risk.skipped === true, 'risk skipped');
    assert(out.publicity.skipped === true, 'publicity skipped');
    assert(out.report.skipped !== true, 'report 살아있음');
  });
  await test('collectionAgent 강제 ON 정책 (사용자가 false 줘도 동작)', () => {
    // 오케스트레이터는 settings.collectionAgent === false 시 skip 한다.
    // 단, /api/config 의 검증 단계에서 강제로 true 처리되므로 실 운영 OFF 불가.
    // 이 테스트는 오케스트레이터의 raw 동작 검증.
    const out = ag.runAgents(makeReport(), { settings: { collectionAgent: false } });
    assert(out.collection.skipped === true);
  });
  await test('LLM 환경변수 없으면 비활성', () => {
    const cfg = ag.getLlmConfig({});
    assert(cfg.enabled === false);
    assert(cfg.provider === null);
  });
  await test('LLM 환경변수 + 키 둘 다 있어야 활성', () => {
    const off1 = ag.getLlmConfig({ LLM_AGENT_ENABLED: 'true' });
    assert(off1.enabled === false, 'flag 만 있고 키 없으면 비활성');
    const off2 = ag.getLlmConfig({ OPENAI_API_KEY: 'sk-xxx' });
    assert(off2.enabled === false, '키만 있고 flag 없으면 비활성');
    const on = ag.getLlmConfig({ LLM_AGENT_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-ant-xxx' });
    assert(on.enabled === true, '둘 다 있으면 활성');
    assert(on.provider === 'anthropic');
  });

  // ────────────────────────────────────────────
  group('8) Word / Excel 반영');
  await test('Word — 9. 에이전트 종합 판단 섹션 포함 (Buffer 반환)', async () => {
    const wg = await imp('server/wordGenerator.js');
    const r = makeReport();
    r.agentResults = ag.runAgents(r);
    const buf = await wg.reportToDocx(r);
    assert(Buffer.isBuffer(buf), 'Buffer 반환');
    assert(buf.length > 1000, `buf size=${buf.length}`);
  });
  await test('Excel — 에이전트 분석 시트 포함 (Buffer 반환)', async () => {
    const xg = await imp('server/excelGenerator.js');
    const r = makeReport();
    r.agentResults = ag.runAgents(r);
    const buf = await xg.reportToXlsx(r);
    assert(Buffer.isBuffer(buf), 'Buffer 반환');
    assert(buf.length > 1000, `buf size=${buf.length}`);
    // ZIP 매직 바이트 (50 4B) 검증
    assert(buf[0] === 0x50 && buf[1] === 0x4B, 'xlsx ZIP magic');
  });
  await test('HTML — 에이전트 종합 판단 H2 포함', async () => {
    const tpl = await imp('server/reportTemplate.js');
    const r = makeReport();
    r.agentResults = ag.runAgents(r);
    const html = tpl.renderReportHtml(r);
    assert(html.includes('에이전트 종합 판단'), 'H2 표시');
    assert(html.includes('규칙 기반'), 'LLM 비활성 표기');
  });

  // ────────────────────────────────────────────
  // 결과
  const pass = results.filter(r => r.passed).length;
  const fail = results.filter(r => !r.passed).length;
  console.log(`\n=== 결과: ${pass}건 성공 / ${fail}건 실패 ===`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
