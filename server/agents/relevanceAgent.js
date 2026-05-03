// ─────────────────────────────────────────────
// relevanceAgent.js — 키워드 관련성 검증 에이전트
//
// 역할:
//   - 사용자 키워드와 기사 내용의 관련성 판단
//   - 법무·검찰·법원·공공기관 도메인 맥락 필터 적용
//   - 동음이의어/무관 기사 자동 제외 사유 부여
//
// 동작 방식:
//   collector.js 가 이미 scoreRelevance + rescoreReport 로
//   각 article 에 relevanceScore / relevanceLevel / relevancePassed 를
//   부여해 두었다. 이 에이전트는 그 결과를 검증·집계하고
//   "공공기관 도메인" 시그널을 추가 가산해 최종 판단을 내린다.
// ─────────────────────────────────────────────

const PUBLIC_DOMAIN_TERMS = [
  // 법무 / 사법
  '법무부', '검찰', '검사', '법원', '판사', '대법원', '헌법재판소',
  '교정', '교도소', '구치소', '보호관찰', '소년원', '출입국', '이민',
  '범죄', '수사', '기소', '형사', '민사', '판결', '재판',
  // 공공기관 일반
  '정부', '부처', '청와대', '대통령실', '국무총리', '국무회의',
  '국회', '의원', '입법', '국정감사', '예산', '정책',
  // 자치
  '시청', '도청', '광역시', '특별시', '구청', '군청', '시장', '도지사', '시의회',
];

function normalize(s = '') {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/["'`,.\-_()\[\]{}<>!?·…/\\|:;~+*%&^$#@=]/g, '');
}

function detectPublicDomain(article = {}) {
  const text = `${article.title || ''} ${article.summary || ''} ${article.contentText || ''}`;
  const norm = normalize(text);
  const matched = PUBLIC_DOMAIN_TERMS.filter(t => norm.includes(normalize(t)));
  return { isPublicDomain: matched.length > 0, matchedDomainTerms: matched.slice(0, 5) };
}

export function runRelevanceAgent(report = {}) {
  const articles = Array.isArray(report.articles) ? report.articles : [];
  const keywords = Array.isArray(report.keywords) ? report.keywords : [];
  const stats = report.relevanceQuality || {};

  let highCount = 0, mediumCount = 0, lowCount = 0, noneCount = 0;
  const autoExcluded = [];
  const ambiguousArticles = [];
  let publicDomainHits = 0;

  for (const a of articles) {
    const lvl = a.relevanceLevel || 'none';
    if      (lvl === 'high')   highCount++;
    else if (lvl === 'medium') mediumCount++;
    else if (lvl === 'low')    lowCount++;
    else                        noneCount++;

    // 공공기관 도메인 감지 — 동음이의어 자동 제외 보조
    const dom = detectPublicDomain(a);
    a.publicDomainHit = !!dom.isPublicDomain;
    a.publicDomainTerms = dom.matchedDomainTerms;
    if (dom.isPublicDomain) publicDomainHits++;

    // 자동 제외 사유 부여
    if (a.excluded && a.excludedBy === 'system-auto') {
      autoExcluded.push({
        id: a.id,
        title: a.title,
        source: a.source,
        reason: a.autoExcludeReason || a.excludedReason || '자동 판단 — 관련성 부족',
        score: a.relevanceScore || 0,
      });
    }

    // 모호한 기사 — 점수가 1~2 (low) 이고 공공기관 매칭도 없는 것
    if (!a.excluded && (a.relevanceLevel === 'low') && !dom.isPublicDomain) {
      ambiguousArticles.push({
        id: a.id, title: a.title, source: a.source,
        score: a.relevanceScore || 0,
        reason: '관련성 낮음 + 공공기관 맥락 매칭 없음',
      });
    }
  }

  const total = articles.length;
  const passRate = total ? Math.round(((highCount + mediumCount) / total) * 100) : 0;

  let verdict;
  if (total === 0)             verdict = '기사 없음';
  else if (passRate >= 70)     verdict = '관련성 양호';
  else if (passRate >= 40)     verdict = '관련성 보통';
  else                          verdict = '관련성 낮음 — 키워드 재검토 필요';

  const summary = `전체 ${total}건 중 관련성 양호 ${highCount + mediumCount}건 (${passRate}%) · ` +
    `자동 제외 ${autoExcluded.length}건 · 공공기관 도메인 매칭 ${publicDomainHits}건. 판단: ${verdict}.`;

  return {
    agent: 'relevance',
    keywordsRequested: keywords,
    distribution: { high: highCount, medium: mediumCount, low: lowCount, none: noneCount },
    passRate,
    autoExcludedCount: autoExcluded.length,
    autoExcluded:      autoExcluded.slice(0, 20),
    ambiguousCount:    ambiguousArticles.length,
    ambiguousArticles: ambiguousArticles.slice(0, 10),
    publicDomainHits,
    verdict,
    summary,
    relevanceStats: stats,
  };
}

export default runRelevanceAgent;
