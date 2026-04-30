// ─────────────────────────────────────────────
// reportAnalyzer.js — 보고서 재분석 (recompute)
//
// 사용자가 기사를 제외/복원한 후 호출되어 통계 전부를 다시 계산한다.
//   - sentiment / mediaCounts / keywordCounts / departmentCounts
//   - agencyStats / publicityStats
//   - groups / trending / summaryText / riskLevel
//   - negativeIssues / positiveIssues / neutralIssues / actionRequired
//   - extractionStats
//
// 입력은 report 의 articles 전체와 (옵션으로) excluded 필터를 결합한 활성 기사.
// 원본 articles 배열은 절대 변경하지 않는다.
// ─────────────────────────────────────────────

import { analyzeSentiments } from './sentiment.js';
import { classifyMedia, countByMediaType, MEDIA_TYPES } from './mediaList.js';
import { countDepartments } from './departments.js';

function normalize(s = '') {
  return String(s).toLowerCase().replace(/\s+/g, ' ')
    .replace(/[“”"'‘’`,.\-()\[\]{}<>!?·…]/g, '').trim();
}

function countByKeyword(articles) {
  const m = {};
  for (const a of articles) {
    const k = a.keyword;
    if (!k) continue;
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

function countAgencies(articles) {
  const out = {};
  for (const a of articles) {
    if (a.articleSource !== 'agency') continue;
    const k = a.source || '미상';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function groupByTitle(articles) {
  // 동일 / 유사 제목 그룹핑 — collector.js 의 정책과 동일
  const groups = new Map();
  for (const a of articles) {
    const sig = normalize(a.title || '').slice(0, 12) || normalize(a.title || '');
    if (!sig) continue;
    if (!groups.has(sig)) groups.set(sig, { signature: sig, leadKeyword: a.keyword, count: 0, sources: [], titles: [], priority: '참고' });
    const g = groups.get(sig);
    g.count++;
    if (a.source && !g.sources.includes(a.source)) g.sources.push(a.source);
    if (a.title  && !g.titles.includes(a.title))  g.titles.push(a.title);
    const order = { 긴급: 0, 주의: 1, 참고: 2 };
    if ((order[a.priority] ?? 3) < (order[g.priority] ?? 3)) g.priority = a.priority || g.priority;
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

function computeRiskLevel(sentiment, trending = []) {
  const negPct = sentiment.negativePct || 0;
  const reasons = [];
  let level = '안정';
  if (negPct >= 50) { level = '긴급'; reasons.push(`부정 비율 ${negPct}% (50% 이상)`); }
  else if (negPct >= 30) { level = '주의'; reasons.push(`부정 비율 ${negPct}% (30% 이상)`); }
  if ((trending || []).length >= 1) {
    const top = trending[0];
    if (level === '안정') level = '주의';
    reasons.push(`'${top.keyword}' 급상승 (${top.prev}→${top.curr})`);
  }
  return { level, reasons };
}

function buildSummaryText({ articles, keywords, mediaCounts, sentiment, trending }) {
  const total = articles.length;
  if (!total) return '수집된 기사가 없음.';
  const parts = [];
  parts.push(`키워드 ${(keywords || []).join('·') || '미지정'} 관련 ${total}건 수집.`);
  const overall = sentiment.overall || '중립';
  parts.push(`긍정 ${sentiment.positive || 0} · 부정 ${sentiment.negative || 0} · 중립 ${sentiment.neutral || 0} (${overall}).`);
  const topMedia = Object.entries(mediaCounts || {}).sort((a, b) => b[1] - a[1])[0];
  if (topMedia && topMedia[1] > 0) parts.push(`${topMedia[0]} 비중 최대 (${topMedia[1]}건).`);
  if ((trending || [])[0]) parts.push(`${trending[0].keyword} 급상승.`);
  return parts.join(' ');
}

/**
 * report 를 입력받아 active 기사 (excluded=false) 만으로 통계를 재계산한 새 객체를 반환한다.
 * 원본 report 객체는 변경하지 않는다.
 *
 * @param {Object} report
 * @returns {Object} 새 report (articles 전체 보존, 통계만 갱신)
 */
export function recomputeReport(report) {
  const allArticles    = report.articles || [];
  // active = excluded=false AND relevancePassed !== false
  // (relevancePassed 가 명시적으로 false 인 기사는 strict 모드 자동 제외 대상)
  const activeArticles = allArticles.filter(a => !a.excluded && a.relevancePassed !== false);
  const excludedCount  = allArticles.length - activeArticles.length;

  // 1) 감정 — 기사 객체에 기존 sentiment 가 있어도 재계산 (제외 후 일관성 보장)
  //    원본 article 의 sentiment 라벨은 유지하되, 합계 재집계만 수행.
  const sentiment = analyzeSentiments(activeArticles);

  // 2) 매체/키워드/부서 카운트
  const mediaCounts      = countByMediaType(activeArticles);
  const keywordCounts    = countByKeyword(activeArticles);
  const departmentCounts = countDepartments(activeArticles);

  // 3) 그룹 / 트렌드(trending 은 원본 보존 — 시계열 데이터 필요)
  const groups   = groupByTitle(activeArticles);
  const trending = report.trending || [];

  // 4) 요약/위험
  const summaryText = buildSummaryText({
    articles: activeArticles, keywords: report.keywords,
    mediaCounts, sentiment, trending,
  });
  const riskLevel = computeRiskLevel(sentiment, trending);

  // 5) 소스 카운트
  const sourceCounts = activeArticles.reduce((m, a) => {
    const k = a.sourceProvider || 'unknown';
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});

  // 6) 기관 / 홍보 실적
  const agencyArticles = activeArticles.filter(a => a.articleSource === 'agency');
  const agencyStats = {
    agency: agencyArticles.length,
    press:  activeArticles.length - agencyArticles.length,
    byAgency: countAgencies(activeArticles),
  };
  const groupBySig = new Map(groups.map(g => [g.signature, g]));
  // article 의 reCiteCount/centralCoverage/importanceScore/publicityRating 는 원본 그대로 사용 (수집 시 계산됨).
  // 단, group 변동에 따라 살짝 차이 날 수 있어 보정.
  for (const a of activeArticles) {
    const sig = normalize(a.title || '').slice(0, 12) || normalize(a.title || '');
    const g   = groupBySig.get(sig);
    if (g) {
      a.reCiteCount  = Math.max(0, (g.count || 1) - 1);
      a.mediaSpread  = (g.sources || []).length;
    }
  }
  const publicityStats = {
    agencyDistributed: agencyArticles.length,
    totalReCites:      agencyArticles.reduce((s, a) => s + (a.reCiteCount || 0), 0),
    centralCoverage:   agencyArticles.filter(a => a.centralCoverage).length,
    averageImportance: agencyArticles.length
      ? Number((agencyArticles.reduce((s, a) => s + (a.importanceScore || 0), 0) / agencyArticles.length).toFixed(2))
      : 0,
    topAgencyItems: agencyArticles
      .slice()
      .sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0))
      .slice(0, 10)
      .map(a => ({
        id: a.id, title: a.title, source: a.source, agency: a.source,
        reCiteCount: a.reCiteCount, mediaSpread: a.mediaSpread,
        centralCoverage: a.centralCoverage, sentiment: a.sentiment?.label,
        rating: a.publicityRating, score: a.importanceScore,
      })),
  };

  // 7) 추출 통계
  const extractedCount = activeArticles.filter(a => a.extracted).length;
  const qualityCounts = activeArticles.reduce((m, a) => {
    const q = a.extractionQuality || (a.extracted ? 'success' : 'failed');
    m[q] = (m[q] || 0) + 1;
    return m;
  }, { success: 0, partial: 0, fallback: 0, failed: 0 });
  const imageCount = activeArticles.filter(a => (a.images?.length || 0) > 0).length;
  const extractionStats = {
    total:      activeArticles.length,
    extracted:  extractedCount,
    failed:     activeArticles.length - extractedCount,
    quality:    qualityCounts,
    withImage:  imageCount,
    withoutImage: activeArticles.length - imageCount,
  };
  const extractionFailed = activeArticles
    .filter(a => !a.extracted)
    .map(a => ({ id: a.id, title: a.title, url: a.url, error: a.extractionError, source: a.source }));

  // 8) 부정/긍정/중립 TOP 5
  const sortByPriority = (arr) => arr.sort((a, b) => {
    const order = { 긴급: 0, 주의: 1, 참고: 2 };
    return (order[a.priority] || 3) - (order[b.priority] || 3);
  });
  const negativeIssues = sortByPriority(activeArticles.filter(a => a.sentiment?.label === '부정')).slice(0, 5);
  const positiveIssues = activeArticles.filter(a => a.sentiment?.label === '긍정').slice(0, 5);
  const neutralIssues  = activeArticles.filter(a => a.sentiment?.label === '중립').slice(0, 5);
  const actionRequired = activeArticles.filter(a => a.priority === '긴급' || a.priority === '주의');

  // 새 report 반환 — articles 원본 보존, 통계만 갱신
  return {
    ...report,
    mediaTypes: MEDIA_TYPES,
    mediaCounts,
    keywordCounts,
    departmentCounts,
    sourceCounts,
    agencyStats,
    publicityStats,
    sentiment,
    groups,
    summaryText,
    riskLevel,
    extractedCount,
    extractionFailed,
    extractionStats,
    negativeIssues,
    positiveIssues,
    neutralIssues,
    actionRequired,
    activeArticleCount: activeArticles.length,
    excludedCount,
    analysisUpdatedAt: new Date().toISOString(),
    needsReanalysis:   false,
  };
}
