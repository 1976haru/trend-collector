// ─────────────────────────────────────────────
// reportAgent.js — 보고서 작성 에이전트
//
// 역할:
//   - 일일 보고서 문장 (dailyBrief)
//   - 상급자 보고용 1페이지 요약 (executiveSummary)
//   - Word 보고서 기승전결 문장
//   - 모니터링 키워드 추천
//
// 문체: 공공기관 보고문 ('~임 / ~함 / ~판단됨 / ~필요함')
//
// LLM 비활성 시 규칙 기반 템플릿으로 동작.
// ─────────────────────────────────────────────

function fmtKstDate(iso) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, '0')}월 ${String(d.getDate()).padStart(2, '0')}일`;
  } catch { return ''; }
}

function topN(obj = {}, n = 3) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function pickMonitoringKeywords(report) {
  const keywords = Array.isArray(report.keywords) ? report.keywords : [];
  const trending = Array.isArray(report.trending) ? report.trending : [];
  const articles = (report.articles || []).filter(a => !a.excluded);

  // 부정 키워드 빈도 — 자주 등장하는 부정 키워드를 모니터링 후보로
  const negFreq = {};
  for (const a of articles) {
    for (const k of (a.sentiment?.matchedKeywords?.negative || [])) {
      negFreq[k] = (negFreq[k] || 0) + 1;
    }
  }
  const topNeg = Object.entries(negFreq)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);

  const trendKw = trending.slice(0, 3).map(t => t.keyword);

  // 중복 제거
  const out = [];
  const seen = new Set();
  for (const k of [...trendKw, ...topNeg, ...keywords]) {
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= 8) break;
  }
  return out;
}

export function runReportAgent(report = {}, opts = {}) {
  const articles = (report.articles || []).filter(a => !a.excluded && a.relevancePassed !== false);
  const total = articles.length;
  const sentiment = report.sentiment || {};
  const trending = Array.isArray(report.trending) ? report.trending : [];
  const ag = report.agencyStats || { agency: 0, press: 0 };
  const riskLevel = report.riskLevel || { level: '안정', reasons: [] };
  const dateStr = fmtKstDate(report.generatedAt);
  const keywords = (report.keywords || []).join(' · ') || '미지정';
  const mediaCounts = report.mediaCounts || {};
  const topMedia = topN(mediaCounts, 3).filter(([k]) => k !== '기타');

  // ── executiveSummary — 상급자용 1페이지 요약 (5~7줄)
  const execLines = [];
  execLines.push(`○ 일자: ${dateStr}`);
  execLines.push(`○ 키워드: ${keywords}`);
  execLines.push(`○ 보도 총량: ${total}건 (기관 배포자료 ${ag.agency || 0}건 / 일반 언론보도 ${ag.press || 0}건)`);
  execLines.push(`○ 보도 분위기: ${sentiment.overall || '중립'} (긍정 ${sentiment.positivePct || 0}% · 부정 ${sentiment.negativePct || 0}% · 중립 ${sentiment.neutralPct || 0}%)`);
  execLines.push(`○ 위험 수준: ${riskLevel.level || '안정'}${riskLevel.reasons?.length ? ` (${riskLevel.reasons.slice(0, 2).join(' · ')})` : ''}`);
  if (trending[0]) execLines.push(`○ 급상승: ${trending[0].keyword} (${trending[0].prev}→${trending[0].curr})`);
  if (topMedia.length) execLines.push(`○ 주요 매체: ${topMedia.map(([k, v]) => `${k}(${v})`).join(', ')}`);

  // ── dailyBrief — 한 단락
  const moodWord = sentiment.overall === '부정 우세' ? '부정 분위기'
    : sentiment.overall === '긍정 우세' ? '긍정 분위기' : '중립 기조';
  const briefParts = [
    `금일 ${keywords} 관련 언론보도는 총 ${total}건이 수집됨.`,
    `전반 보도 분위기는 ${moodWord} 으로 판단됨 (긍정 ${sentiment.positive || 0}건 / 부정 ${sentiment.negative || 0}건 / 중립 ${sentiment.neutral || 0}건).`,
  ];
  if (riskLevel.level !== '안정') {
    briefParts.push(`위험 수준은 '${riskLevel.level}' 로 분류되며, ${riskLevel.reasons?.[0] || '주요 부정 이슈 확인'} 으로 인한 모니터링 강화가 필요함.`);
  } else {
    briefParts.push('특별한 위험 이슈는 식별되지 않았으며, 일상 모니터링으로 충분한 것으로 판단됨.');
  }
  if (trending[0]) {
    briefParts.push(`급상승 키워드 '${trending[0].keyword}' 가 확인됨 (${trending[0].prev}→${trending[0].curr}건).`);
  }
  const dailyBrief = briefParts.join(' ');

  // ── 기승전결 (Word 본문용)
  const introduction = `${dateStr} 기준 ${keywords} 관련 언론보도는 총 ${total}건이 수집됨. 본 보고서는 수집·관련성·위험·홍보·품질 6개 에이전트가 자동 산출한 결과를 정리한 것임.`;
  const development = total
    ? `보도 분포는 ${topMedia.map(([k, v]) => `${k} ${v}건`).join(', ') || '매체 분포 식별 불가'} 이며, ` +
      `발행 주체는 기관 ${ag.agency || 0}건 · 언론 ${ag.press || 0}건으로 구성됨.`
    : '수집된 기사가 없어 보도 분포 분석이 불가함.';
  const turn = riskLevel.level !== '안정'
    ? `다만, ${riskLevel.reasons?.join(' · ') || '부정 이슈 다수'} 등의 사유로 위험 수준이 '${riskLevel.level}' 로 평가됨. 관계 부서의 신속한 검토가 요구됨.`
    : '특별히 우려되는 동향은 없으며, 정책 추진에 대한 부정 여론 확산은 관측되지 않음.';
  const conclusion = total
    ? `종합 판단: '${riskLevel.level}'. ${riskLevel.level === '긴급' ? '즉시 대응이 필요함.' : riskLevel.level === '주의' ? '모니터링 강화가 필요함.' : '현 수준 유지가 적절함.'}`
    : '추가 키워드 보강 또는 수집 기간 확대 검토가 필요함.';

  // ── 대응 권고
  const responseLines = [];
  if (riskLevel.level === '긴급') {
    responseLines.push('① 대변인실 / 정책 부서 합동 검토를 즉시 실시함.');
    responseLines.push('② 부정 보도 발생 매체에 대한 사실관계 확인 및 필요 시 공식 입장 검토함.');
    responseLines.push('③ 기관 배포자료 추가 작성으로 균형 보도 유도가 필요함.');
  } else if (riskLevel.level === '주의') {
    responseLines.push('① 관련 부서 모니터링을 강화하고, 부정 키워드 추이를 시간대별로 점검함.');
    responseLines.push('② 동일 이슈 반복 보도 여부를 확인하고 필요 시 사전 대응 자료를 준비함.');
  } else {
    responseLines.push('① 일상 모니터링 유지, 별도 대응 불필요함.');
  }
  if (sentiment.negative >= 5) {
    responseLines.push('④ 부정 키워드 분석 결과를 부서별 회람하여 사전 대응 자료 작성에 반영함.');
  }
  const responseRecommendation = responseLines.join('\n');

  // ── 모니터링 키워드 추천
  const monitoringKeywords = pickMonitoringKeywords(report);

  // ── LLM 자리표시자 (비활성 시 비워둠)
  const llmEnabled = !!opts.llmEnabled;

  return {
    agent: 'report',
    executiveSummary: execLines.join('\n'),
    dailyBrief,
    storyArc: { introduction, development, turn, conclusion },
    responseRecommendation,
    monitoringKeywords,
    style: 'gov-report',
    llmEnabled,
    llmPolished: false,                 // LLM 통합 시 true 로 바뀜
    summary: dailyBrief,
  };
}

export default runReportAgent;
