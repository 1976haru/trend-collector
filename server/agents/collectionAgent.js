// ─────────────────────────────────────────────
// collectionAgent.js — 수집 단계 결과 정리 에이전트
//
// 역할:
//   - 수집된 기사를 소스별로 집계
//   - 실패한 소스를 식별
//   - 수집 결과 한 줄 요약을 만든다
//
// 입력:  report (collector.js 가 만든 객체)
// 출력:  { rawCount, sourceCounts, errors, collectionSummary }
// ─────────────────────────────────────────────

export function runCollectionAgent(report = {}) {
  const articles = Array.isArray(report.articles) ? report.articles : [];
  const rawCount = articles.length;

  // 소스 카운트 — report.sourceCounts 가 있으면 그것을, 아니면 직접 집계
  const sourceCounts = report.sourceCounts && Object.keys(report.sourceCounts).length
    ? { ...report.sourceCounts }
    : articles.reduce((m, a) => {
        const k = a.sourceProvider || 'unknown';
        m[k] = (m[k] || 0) + 1;
        return m;
      }, {});

  // 에러 / 실패 소스
  const errors = Array.isArray(report.errors) ? report.errors.slice() : [];
  const failedSources = errors.map(e => e.source).filter(Boolean);

  // 키워드 다양성
  const keywords = Array.isArray(report.keywords) ? report.keywords : [];
  const usedKeywordSet = new Set(articles.map(a => a.keyword).filter(Boolean));
  const unusedKeywords = keywords.filter(k => !usedKeywordSet.has(k));

  // 한 줄 요약
  const sourceLine = Object.entries(sourceCounts)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}건`)
    .join(' · ') || '소스 없음';
  const errLine = failedSources.length ? ` · 실패 소스 ${failedSources.length}종` : '';
  const unusedLine = unusedKeywords.length
    ? ` · 검색 누락 의심 키워드 ${unusedKeywords.length}개`
    : '';
  const collectionSummary = `총 ${rawCount}건 수집됨 (${sourceLine})${errLine}${unusedLine}.`;

  return {
    agent: 'collection',
    rawCount,
    sourceCounts,
    errors,
    failedSources,
    keywordsRequested: keywords,
    keywordsUsed: Array.from(usedKeywordSet),
    unusedKeywords,
    collectionSummary,
  };
}

export default runCollectionAgent;
