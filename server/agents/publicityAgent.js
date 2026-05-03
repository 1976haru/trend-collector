// ─────────────────────────────────────────────
// publicityAgent.js — 홍보성과 분석 에이전트
//
// 역할:
//   - 기관 배포자료 식별 (articleSource === 'agency')
//   - 언론 재인용 수 (reCiteCount 합계)
//   - 추적 링크 클릭 수 (ctx.tracking 으로 주입)
//   - 홍보 효과 등급 산정 + 인사이트 한 줄
//
// 등급 기준:
//   '대응 필요'      — 부정 3건 이상 + (중앙언론 보도 OR 재인용 3+)
//   '관심 매우 높음' — 클릭 100+ + 중앙언론 보도
//   '확산 양호'      — 클릭 100+ OR 재인용 5+
//   '파급 가능'      — 중앙언론 보도 1+
//   '일반'           — 위 조건 외
//
// ─────────────────────────────────────────────

export function runPublicityAgent(report = {}, ctx = {}) {
  const articles = (report.articles || []).filter(a => !a.excluded && a.relevancePassed !== false);
  const tracking = ctx.tracking || { totalClicks: 0, totalLinks: 0 };

  // 기관 배포자료
  const agencyArticles = articles.filter(a => a.articleSource === 'agency');
  const officialReleaseCount = agencyArticles.length;

  // 언론 재인용 (collector.js 가 reCiteCount 를 부여함)
  const recitationCount = agencyArticles.reduce((s, a) => s + (a.reCiteCount || 0), 0);

  // 중앙언론 + 방송사 노출 수
  const centralCoverage = agencyArticles.filter(a => a.centralCoverage).length;

  // 클릭 수 — 추적 링크에서 가져옴 (cumulative)
  const clickCount = tracking.totalClicks || 0;
  const trackingLinkCount = tracking.totalLinks || tracking.count || 0;

  // 부정 보도 수 — 등급 산정 입력
  const negCount = articles.filter(a => a.sentiment?.label === '부정').length;

  // 홍보 효과 등급
  let publicityRating, ratingColor;
  if (negCount >= 3 && (centralCoverage > 0 || recitationCount >= 3)) {
    publicityRating = '대응 필요'; ratingColor = '#dc2626';
  } else if (clickCount >= 100 && centralCoverage > 0) {
    publicityRating = '관심 매우 높음'; ratingColor = '#16a34a';
  } else if (clickCount >= 100 || recitationCount >= 5) {
    publicityRating = '확산 양호'; ratingColor = '#16a34a';
  } else if (centralCoverage > 0) {
    publicityRating = '파급 가능'; ratingColor = '#f59e0b';
  } else {
    publicityRating = '일반'; ratingColor = '#475569';
  }

  // 평가 TOP 5
  const topItems = agencyArticles
    .slice()
    .sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0))
    .slice(0, 5)
    .map(a => ({
      id: a.id, title: a.title, source: a.source,
      reCiteCount: a.reCiteCount || 0,
      centralCoverage: !!a.centralCoverage,
      rating: a.publicityRating || '일반',
      score: a.importanceScore || 0,
    }));

  // 인사이트 한 줄 — 강한 패턴 우선
  const insightParts = [];
  if (publicityRating === '대응 필요') {
    insightParts.push(`부정 보도 ${negCount}건 + 재인용/중앙 노출 동반 — 위기 대응 우선순위로 검토함.`);
  } else if (publicityRating === '관심 매우 높음') {
    insightParts.push(`클릭 ${clickCount}회 + 중앙언론 ${centralCoverage}건 노출 — 홍보 효과가 매우 높음.`);
  } else if (publicityRating === '확산 양호') {
    insightParts.push(`재인용 ${recitationCount}건/클릭 ${clickCount}회 — 자료 확산이 양호함.`);
  } else if (publicityRating === '파급 가능') {
    insightParts.push(`중앙·방송사 ${centralCoverage}건 노출 — 추가 후속 자료 검토가 권장됨.`);
  } else {
    insightParts.push(`기관 배포자료 ${officialReleaseCount}건 · 재인용 ${recitationCount}건 — 추가 홍보 채널 활용을 검토함.`);
  }
  if (officialReleaseCount === 0) {
    insightParts.push('기관 배포자료가 식별되지 않아 도메인 등록/매체 정의 보강이 필요함.');
  }
  const publicityInsight = insightParts.join(' ');

  return {
    agent: 'publicity',
    officialReleaseCount,
    recitationCount,
    clickCount,
    trackingLinkCount,
    centralCoverage,
    publicityRating,
    ratingColor,
    topItems,
    publicityInsight,
    summary: `배포 ${officialReleaseCount}건 · 재인용 ${recitationCount}건 · 중앙 ${centralCoverage}건 · 클릭 ${clickCount}회 → 등급 '${publicityRating}'.`,
  };
}

export default runPublicityAgent;
