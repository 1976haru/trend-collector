// ─────────────────────────────────────────────
// searchIntent.js — 검색 의도 분류기
//
// 사용자가 입력한 키워드 + 빠른 키워드 카테고리 (selectedQuickCategory) 를
// 결합해 "어느 도메인의 어느 카테고리 모니터링인지" 식별.
// 같은 단어라도 카테고리에 따라 다르게 해석한다.
//   예) '감독' — probation 카테고리 → 전자감독으로 해석
//                stadium 카테고리 → 스포츠 감독 (이 도구는 처리 X)
// ─────────────────────────────────────────────

import { getDomainTerms, getStrongDomainSignals, CATEGORY_TERMS } from './domainDictionaries/justice.js';
import { getNoiseTerms, getStrongNoiseTerms } from './domainDictionaries/noise.js';

// 사용자 키워드 → 카테고리 자동 추정 (selectedQuickCategory 미지정 시).
// 단순 substring 매칭으로 가장 강한 카테고리 선택. 매칭 없으면 'general'.
function inferCategory(userKeywords = []) {
  const counts = {};
  for (const cat of Object.keys(CATEGORY_TERMS)) counts[cat] = 0;
  const haystack = userKeywords.join(' ');
  for (const [cat, terms] of Object.entries(CATEGORY_TERMS)) {
    for (const t of terms) {
      if (haystack.includes(t)) counts[cat] += t.length;   // 긴 단어가 더 큰 신호
    }
  }
  const sorted = Object.entries(counts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'general';
}

const CATEGORY_LABEL = {
  moj:         '법무부 본부',
  probation:   '보호직 (보호관찰·소년보호)',
  corrections: '교정',
  immigration: '출입국',
  prosecution: '검찰',
  court:       '법원',
  juvenile:    '소년',
  general:     '일반 공공기관 모니터링',
};

/**
 * @param {string[]} userKeywords — 사용자가 선택한 검색 키워드
 * @param {string|null} selectedQuickCategory — UI 의 빠른 키워드 카테고리 ('probation' 등)
 * @param {Object} opts — { domain?: 'justice'|'general_public', searchMode?: 'strict'|'wide'|'raw' }
 */
export function detectSearchIntent(userKeywords = [], selectedQuickCategory = null, opts = {}) {
  const domain = opts.domain || 'justice';   // 본 도구는 법무 모니터링 기본
  const category = selectedQuickCategory && CATEGORY_TERMS[selectedQuickCategory]
    ? selectedQuickCategory
    : inferCategory(userKeywords);
  const searchMode = ['strict', 'wide', 'raw'].includes(opts.searchMode)
    ? opts.searchMode
    : 'strict';   // 기본 정확 모드

  const requiredContextTerms = getDomainTerms(category);
  const positiveContextTerms = getStrongDomainSignals(category);
  const negativeContextTerms = getNoiseTerms();
  const strongNegativeTerms  = getStrongNoiseTerms();
  const ambiguousTerms = ['감독', '교정', '법원', '검찰', '출입국', '보호'];

  return {
    domain,
    category,
    intentName:  CATEGORY_LABEL[category] || category,
    strictMode:  searchMode === 'strict',
    searchMode,
    userKeywords:        userKeywords.slice(),
    expandedKeywords:    [],   // collector 의 확장 검색 결과로 채워짐
    requiredContextTerms,
    positiveContextTerms,
    negativeContextTerms,
    strongNegativeTerms,
    ambiguousTerms,
  };
}
