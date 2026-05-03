// ─────────────────────────────────────────────
// suggestionAgent.js — 운영 개선 제안 에이전트
//
// 역할:
//   - 자주 제외되는 기사 패턴 → 제외 키워드 추천
//   - 자주 실패하는 도메인 → 도메인 룰 제안
//   - 검색 누락 의심 키워드 → 키워드 보강 제안
//   - 사용자 기능개선 제안 (저장된 feedback) 요약 시도 (있을 때만)
//
// 출력:
//   {
//     suggestedExcludeKeywords[],
//     suggestedDomainRules[],
//     suggestedFeatureImprovements[],
//   }
// ─────────────────────────────────────────────

import { suggestExcludeWords } from '../relevance.js';

function safeHostname(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

export function runSuggestionAgent(report = {}, ctx = {}) {
  const articles = Array.isArray(report.articles) ? report.articles : [];
  const keywords = Array.isArray(report.keywords) ? report.keywords : [];

  // ── 1) 제외 키워드 추천 — 제외된 기사에서 빈출 단어
  const excluded = articles.filter(a => a.excluded);
  const suggestedExcludeKeywords = suggestExcludeWords(excluded, keywords)
    .slice(0, 10)
    .map(w => ({
      word: w.word,
      count: w.count,
      reason: w.reason,
    }));

  // ── 2) 도메인 룰 제안 — 실패 도메인 / 자주 제외되는 매체
  const failByHost = {};
  for (const a of articles) {
    if (a.extracted) continue;
    const h = safeHostname(a.url);
    if (!h) continue;
    failByHost[h] = (failByHost[h] || 0) + 1;
  }
  const suggestedDomainRules = Object.entries(failByHost)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([host, count]) => ({
      domain: host,
      failCount: count,
      ruleType: 'extractor-tweak',
      reason: `본문 추출 실패 ${count}건 — 도메인 별 추출 규칙 추가 검토 필요함.`,
    }));

  // 자주 제외되는 매체 — 별도 항목으로 추가
  const exclByMedia = {};
  for (const a of excluded) {
    if (!a.source) continue;
    exclByMedia[a.source] = (exclByMedia[a.source] || 0) + 1;
  }
  for (const [media, count] of Object.entries(exclByMedia)) {
    if (count >= 3) {
      suggestedDomainRules.push({
        domain: media,
        failCount: count,
        ruleType: 'auto-exclude-media',
        reason: `매체 '${media}' 기사가 ${count}건 제외됨 — 매체 차단 키워드 등록 검토.`,
      });
    }
  }

  // ── 3) 검색 누락 의심 키워드 — 사용자가 등록했으나 결과 0건
  const usedKeywordSet = new Set(articles.filter(a => !a.excluded).map(a => a.keyword));
  const unused = keywords.filter(k => !usedKeywordSet.has(k));
  const suggestedKeywordCheck = unused.map(k => ({
    keyword: k,
    reason: '활성 기사 0건 — 표기/공백/공식 명칭을 점검함.',
    action: '관리 → 검색 테스트에서 raw 결과 확인',
  }));

  // ── 4) 사용자 기능개선 제안 (feedback 가 있다면 빈출 키워드)
  const feedback = Array.isArray(ctx.feedback) ? ctx.feedback : [];
  const suggestedFeatureImprovements = [];
  if (feedback.length > 0) {
    // 최근 미읽음 또는 높은 중요도부터 5건
    const recent = feedback
      .filter(f => f.severity === '긴급' || f.severity === '높음' || !f.read)
      .slice(0, 5);
    for (const f of recent) {
      suggestedFeatureImprovements.push({
        title: f.title,
        severity: f.severity || '보통',
        receivedAt: f.receivedAt,
        excerpt: String(f.content || '').slice(0, 100),
      });
    }
  }

  // 운영 자동 제안 — 부정 비율 패턴이 높으면 사전 대응 자료 제안
  const negPct = report.sentiment?.negativePct || 0;
  if (negPct >= 30) {
    suggestedFeatureImprovements.push({
      title: '부정 보도 사전 대응 자료 자동 작성',
      severity: '보통',
      receivedAt: new Date().toISOString(),
      excerpt: `최근 부정 비율 ${negPct}% — 부정 키워드 기반 대응 멘트 템플릿 자동 생성을 검토.`,
    });
  }
  if (suggestedDomainRules.length >= 3) {
    suggestedFeatureImprovements.push({
      title: '추출 실패 도메인 자동 학습 추가',
      severity: '보통',
      receivedAt: new Date().toISOString(),
      excerpt: `${suggestedDomainRules.length}개 도메인에서 본문 추출이 반복 실패함. 자동 룰 학습 기능 검토.`,
    });
  }

  const summaryLines = [];
  if (suggestedExcludeKeywords.length) summaryLines.push(`제외 키워드 ${suggestedExcludeKeywords.length}개 제안`);
  if (suggestedDomainRules.length)     summaryLines.push(`도메인 룰 ${suggestedDomainRules.length}건 제안`);
  if (suggestedKeywordCheck.length)    summaryLines.push(`검색 누락 의심 키워드 ${suggestedKeywordCheck.length}개`);
  if (suggestedFeatureImprovements.length) summaryLines.push(`기능 개선 ${suggestedFeatureImprovements.length}건`);
  const summary = summaryLines.length
    ? summaryLines.join(' · ') + '.'
    : '추가 개선 제안 없음 — 현 운영 상태 양호함.';

  return {
    agent: 'suggestion',
    suggestedExcludeKeywords,
    suggestedDomainRules,
    suggestedKeywordCheck,
    suggestedFeatureImprovements,
    summary,
  };
}

export default runSuggestionAgent;
