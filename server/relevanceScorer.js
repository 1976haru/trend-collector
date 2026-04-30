// ─────────────────────────────────────────────
// relevanceScorer.js — 도메인 맥락 통과 + 노이즈 차단 점수 엔진
//
// 입력: article (title/summary/contentText/source/url/userKeywords/...) + intent
// 출력: {
//   score, level, passed, autoExcluded, excludeReason,
//   matchedUserKeywords, matchedExpandedKeywords,
//   matchedDomainTerms, matchedNoiseTerms, matchedStrongNoise,
//   domainScore, noiseScore, evidence
// }
//
// 점수 정책 (사용자 spec):
//   - 제목 사용자 키워드 정확 매칭: +8
//   - 제목 확장 키워드 매칭: +5
//   - 요약/snippet 사용자 키워드: +4
//   - 본문 첫 1000자 사용자 키워드: +4
//   - 도메인 맥락어 (강신호): +3 (최대 3개까지 가산)
//   - 공식기관 도메인 / agency: +5
//   - 무관 분야 강한 매칭 (STRONG_NOISE): -8 each (최대 -30)
//   - 무관 분야 일반 매칭: -3 each (최대 -15)
//   - 추천기사 / 인기기사 잡텍스트 비율 높음: -10
//
// 자동 제외 (autoExcluded=true):
//   - 사용자 키워드 매칭 0건 + 도메인 강신호 매칭 0건
//   - noiseScore >= 8 (강한 노이즈 신호 다수)
//   - 동음이의어 함정 (예: '감독' 만 있고 도메인 맥락 없음)
// ─────────────────────────────────────────────

import { checkAmbiguous } from './domainDictionaries/noise.js';

function normalize(s = '') {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .toLowerCase()
    .replace(/[\s ​]+/g, '')
    .replace(/[“”"'‘’`,.\-_()\[\]{}<>!?·…/\\|:;~+*%&^$#@=]/g, '');
}

// 단어 매칭 — 정규화 후 substring (한국어는 형태소 변형 적어 substring 충분)
function includesAny(haystack, terms = []) {
  const out = [];
  for (const t of terms) {
    const nt = normalize(t);
    if (nt && haystack.includes(nt)) out.push(t);
  }
  return out;
}

/**
 * @param {Object} article — collector 가 만든 article 객체.
 *   title, summary, contentText, source, url, mediaName, sourceProvider,
 *   articleSource ('agency' = 기관 배포자료),
 *   matchedKeywords (relevance.js 가 이미 채웠을 수 있음),
 *   bodyQualityScore (articleCleaner 가 채움)
 * @param {Object} intent — detectSearchIntent 결과
 */
export function scoreArticleRelevance(article = {}, intent = {}) {
  const userKw    = (intent.userKeywords || []).filter(Boolean);
  const expanded  = (intent.expandedKeywords || []).filter(Boolean);
  const domain    = intent.requiredContextTerms || [];
  const strongDom = intent.positiveContextTerms || [];
  const noise     = intent.negativeContextTerms || [];
  const strongNz  = intent.strongNegativeTerms  || [];

  const title    = normalize(article.title);
  const summary  = normalize(article.summary);
  // 본문 첫 1000자 — 추천기사/인기기사 잡텍스트가 뒤에 붙은 경우 제거
  const body1k   = normalize((article.cleanText || article.contentText || '').slice(0, 1000));
  const fullBody = normalize(article.cleanText || article.contentText || '');
  const sourceTx = normalize((article.source || '') + ' ' + (article.mediaName || ''));

  // 사용자 키워드 매칭
  const titleHits   = includesAny(title,   userKw);
  const summaryHits = includesAny(summary, userKw);
  const bodyHits    = includesAny(body1k,  userKw);
  const matchedUserKeywords = [...new Set([...titleHits, ...summaryHits, ...bodyHits])];

  // 확장 키워드 매칭
  const expandedTitle   = includesAny(title,   expanded);
  const expandedSummary = includesAny(summary, expanded);
  const expandedBody    = includesAny(body1k,  expanded);
  const matchedExpandedKeywords = [...new Set([...expandedTitle, ...expandedSummary, ...expandedBody])];

  // 도메인 맥락 (강신호)
  const matchedDomainTerms = includesAny(`${title}${summary}${fullBody}${sourceTx}`, strongDom);

  // 노이즈
  const matchedNoiseTerms  = includesAny(`${title}${summary}${fullBody}`, noise);
  const matchedStrongNoise = includesAny(`${title}${summary}${fullBody}`, strongNz);

  // 동음이의어 함정 — 사용자 키워드/도메인 맥락이 없는데 ambiguous 단어만 있으면
  const ambiguousIssues = (matchedUserKeywords.length === 0 && matchedDomainTerms.length === 0)
    ? checkAmbiguous(title + ' ' + summary)
    : [];

  // 점수 산정
  let score = 0;
  const evidence = [];
  if (titleHits.length)    { score += 8; evidence.push(`title +8 (${titleHits.join(',')})`); }
  if (expandedTitle.length){ score += 5; evidence.push(`titleExpanded +5 (${expandedTitle.join(',')})`); }
  if (summaryHits.length)  { score += 4; evidence.push(`summary +4 (${summaryHits.join(',')})`); }
  if (bodyHits.length)     { score += 4; evidence.push(`body +4 (${bodyHits.join(',')})`); }
  // 도메인 맥락어 — 최대 3개까지만 가산 (인플레 방지)
  const domainGain = Math.min(matchedDomainTerms.length, 3) * 3;
  if (domainGain) { score += domainGain; evidence.push(`domain +${domainGain} (${matchedDomainTerms.slice(0, 3).join(',')})`); }
  // 공식기관 보너스
  const agencyBonus = article.articleSource === 'agency' || article.isOfficialRelease ? 5 : 0;
  if (agencyBonus) { score += agencyBonus; evidence.push(`agency +5`); }

  // 노이즈 페널티
  const noiseStrong = Math.min(matchedStrongNoise.length, 4) * 8;
  const noiseRegular = Math.min(matchedNoiseTerms.length, 5) * 3;
  if (noiseStrong)  { score -= noiseStrong;  evidence.push(`strongNoise -${noiseStrong} (${matchedStrongNoise.join(',')})`); }
  if (noiseRegular) { score -= noiseRegular; evidence.push(`noise -${noiseRegular} (${matchedNoiseTerms.slice(0, 3).join(',')})`); }

  // 본문 잡텍스트 비율 — articleCleaner 가 채워줌
  const boilerplateRatio = article.boilerplateRatio ?? 0;
  if (boilerplateRatio > 0.5) { score -= 10; evidence.push(`boilerplate -10 (${(boilerplateRatio * 100 | 0)}%)`); }
  else if (boilerplateRatio > 0.3) { score -= 5; evidence.push(`boilerplate -5 (${(boilerplateRatio * 100 | 0)}%)`); }

  // 동음이의어 함정 페널티
  if (ambiguousIssues.length) {
    score -= 6;
    evidence.push(`ambiguous -6 (${ambiguousIssues.map(a => a.word).join(',')})`);
  }

  // 도메인 / 노이즈 합산 점수 (UI 표시용)
  const domainScore = (titleHits.length * 8) + (expandedTitle.length * 5) +
                      (summaryHits.length * 4) + (bodyHits.length * 4) +
                      domainGain + agencyBonus;
  const noiseScore  = noiseStrong + noiseRegular;

  // 등급
  const level = score >= 8 ? 'high'
              : score >= 4 ? 'medium'
              : score >= 1 ? 'low'
              : 'none';

  // 자동 제외 판정 — strict 모드 기본
  let autoExcluded = false;
  let excludeReason = null;

  if (matchedUserKeywords.length === 0 && matchedDomainTerms.length === 0 && agencyBonus === 0) {
    autoExcluded = true;
    excludeReason = '사용자 키워드 / 도메인 맥락어 모두 매칭 0건';
  } else if (noiseStrong >= 16) {
    autoExcluded = true;
    excludeReason = `강한 노이즈 매칭 다수 (${matchedStrongNoise.slice(0, 3).join(', ')})`;
  } else if (score <= 0) {
    autoExcluded = true;
    excludeReason = `종합 점수 ${score} — 노이즈가 도메인 신호를 압도`;
  } else if (ambiguousIssues.length && score <= 2) {
    autoExcluded = true;
    excludeReason = `동음이의어 함정 (${ambiguousIssues.map(a => a.word).join(', ')}) — 도메인 맥락 부재`;
  }

  // strict 모드: medium 이하 + autoExcluded 자동 제외
  // wide 모드:   low 이상은 후보로 남김 (사용자 검토)
  // raw 모드:    원본 그대로 (모든 기사 활성)
  let passed;
  if (intent.searchMode === 'raw') {
    passed = true;
    autoExcluded = false;
    excludeReason = null;
  } else if (intent.searchMode === 'wide') {
    passed = !autoExcluded;
  } else {
    // strict
    passed = !autoExcluded && level !== 'none';
  }

  return {
    score,
    level,
    passed,
    autoExcluded,
    excludeReason,
    matchedUserKeywords,
    matchedExpandedKeywords,
    matchedDomainTerms,
    matchedNoiseTerms,
    matchedStrongNoise,
    domainScore,
    noiseScore,
    ambiguousIssues: ambiguousIssues.map(a => a.word),
    evidence,
  };
}

/**
 * 보고서 단위 — 새 점수 엔진을 일괄 적용 후 통계 반환.
 * 기존 article 객체에 다음 필드를 set:
 *   - relevanceScore / relevanceLevel
 *   - matchedUserKeywords / matchedDomainTerms / matchedNoiseTerms
 *   - relevancePassed / autoExcluded / autoExcludeReason / relevanceEvidence
 *   - excluded (autoExcluded=true && 사용자가 수동 복원하지 않은 경우)
 */
export function rescoreReport(report, intent) {
  const articles = report.articles || [];
  const stats = {
    total: articles.length,
    pass: 0, autoExcluded: 0, manualExcluded: 0,
    byLevel: { high: 0, medium: 0, low: 0, none: 0 },
    byNoiseCategory: {},
    autoExcludeReasons: {},
  };
  for (const a of articles) {
    const r = scoreArticleRelevance(a, intent);
    a.relevanceScore        = r.score;
    a.relevanceLevel        = r.level;
    a.relevancePassed       = r.passed;
    a.autoExcluded          = r.autoExcluded;
    a.autoExcludeReason     = r.excludeReason;
    a.matchedUserKeywords   = r.matchedUserKeywords;
    a.matchedDomainTerms    = r.matchedDomainTerms;
    a.matchedNoiseTerms     = r.matchedNoiseTerms;
    a.matchedStrongNoise    = r.matchedStrongNoise;
    a.relevanceEvidence     = r.evidence;
    a.domainScore           = r.domainScore;
    a.noiseScore            = r.noiseScore;
    a.isIrrelevantCandidate = r.level === 'none' || r.level === 'low';
    // 자동 제외 — 사용자가 수동 복원하지 않았다면 excluded=true 강제
    //   사용자가 명시적으로 복원한 경우 (excludedBy='restored') 는 그대로 둠
    if (r.autoExcluded && a.excludedBy !== 'restored') {
      a.excluded         = true;
      a.excludedAt       = a.excludedAt || new Date().toISOString();
      a.excludedReason   = a.excludedReason || r.excludeReason;
      a.excludedBy       = 'system-auto';
    }

    stats.byLevel[r.level]++;
    if (r.passed)        stats.pass++;
    if (a.excluded)      a.excludedBy === 'system-auto' ? stats.autoExcluded++ : stats.manualExcluded++;
    if (r.excludeReason) stats.autoExcludeReasons[r.excludeReason] = (stats.autoExcludeReasons[r.excludeReason] || 0) + 1;
    for (const n of r.matchedStrongNoise) stats.byNoiseCategory[n] = (stats.byNoiseCategory[n] || 0) + 1;
  }
  return stats;
}
