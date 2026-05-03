// ─────────────────────────────────────────────
// riskAgent.js — 위험 이슈 감지 에이전트
//
// 역할:
//   - 부정 이슈 비율을 본다
//   - 긴급 대응 필요 기사를 식별한다
//   - 동일 이슈 5건 이상 반복 (groups.count >= 5) 시 주의
//   - 중앙언론 + 부정 키워드는 우선순위 상승
//
// 입력:  report
// 출력:  { level, reasons, urgentArticles, repeatedIssues, mediaSpread, summary }
// ─────────────────────────────────────────────

const CENTRAL_MEDIA = ['조선일보', '중앙일보', '동아일보', '한겨레', '경향신문', '한국일보',
  'KBS', 'MBC', 'SBS', 'JTBC', 'YTN', '연합뉴스', '뉴시스'];

function isCentralMedia(name = '') {
  if (!name) return false;
  return CENTRAL_MEDIA.some(m => String(name).includes(m));
}

export function runRiskAgent(report = {}) {
  const articles = (report.articles || []).filter(a => !a.excluded && a.relevancePassed !== false);
  const sentiment = report.sentiment || {};
  const groups = Array.isArray(report.groups) ? report.groups : [];
  const trending = Array.isArray(report.trending) ? report.trending : [];

  const negPct = sentiment.negativePct || 0;
  const reasons = [];

  // 기준 1) 부정 비율
  let level = '안정';
  if (negPct >= 50) {
    level = '긴급';
    reasons.push(`부정 비율 ${negPct}% (50% 이상)`);
  } else if (negPct >= 30) {
    level = '주의';
    reasons.push(`부정 비율 ${negPct}% (30% 이상)`);
  }

  // 기준 2) 급상승 이슈
  if (trending.length > 0) {
    const top = trending[0];
    if (level === '안정') level = '주의';
    reasons.push(`'${top.keyword}' 급상승 (${top.prev}→${top.curr})`);
  }

  // 기준 3) 동일 이슈 5건 이상 반복
  const repeatedIssues = groups
    .filter(g => (g.count || 0) >= 5)
    .map(g => ({
      signature: g.signature,
      count: g.count,
      titles: (g.titles || []).slice(0, 3),
      sources: g.sources || [],
      priority: g.priority,
    }));
  if (repeatedIssues.length > 0) {
    if (level === '안정') level = '주의';
    reasons.push(`동일 이슈 ${repeatedIssues[0].count}회 반복 ("${repeatedIssues[0].titles[0] || ''}")`);
  }

  // 기준 4) 중앙언론 + 부정 키워드 → 우선순위 상승
  const centralNegative = articles.filter(a =>
    a.sentiment?.label === '부정' && isCentralMedia(a.source)
  );
  if (centralNegative.length > 0) {
    if (level === '안정') level = '주의';
    if (centralNegative.length >= 3 && level === '주의') level = '긴급';
    reasons.push(`중앙·방송사 부정 보도 ${centralNegative.length}건`);
  }

  // 긴급 대응 필요 기사 — 우선순위 긴급/주의
  const urgentArticles = articles
    .filter(a => a.priority === '긴급' || a.priority === '주의')
    .map(a => ({
      id: a.id, title: a.title, source: a.source, url: a.url,
      priority: a.priority,
      sentiment: a.sentiment?.label,
      central: isCentralMedia(a.source),
      negKeywords: (a.sentiment?.matchedKeywords?.negative || []).slice(0, 5),
    }));

  // 매체 다양성 — 같은 이슈가 많은 매체에서 다뤄지면 위험도 상승
  const mediaSpread = groups.length
    ? Math.max(...groups.map(g => (g.sources || []).length))
    : 0;
  if (mediaSpread >= 5) {
    reasons.push(`주요 이슈 매체 확산 ${mediaSpread}곳`);
    if (level === '안정') level = '주의';
  }

  const summary =
    level === '긴급'
      ? `🚨 긴급 — ${reasons[0] || '부정 보도 다수'}. 즉시 대응 검토가 필요함.`
      : level === '주의'
      ? `⚠️ 주의 — ${reasons.join(' · ') || '부정 비율 또는 매체 확산'}. 모니터링 강화 필요함.`
      : `✅ 안정 — 부정 ${negPct}%, 대응 필요 이슈 미식별.`;

  return {
    agent: 'risk',
    level,
    reasons,
    urgentCount: urgentArticles.length,
    urgentArticles: urgentArticles.slice(0, 10),
    repeatedIssues: repeatedIssues.slice(0, 5),
    centralNegativeCount: centralNegative.length,
    mediaSpread,
    summary,
  };
}

export default runRiskAgent;
