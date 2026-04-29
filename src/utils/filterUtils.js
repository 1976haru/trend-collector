// ─────────────────────────────────────────────
// filterUtils.js — 키워드 포함/제외 + 중복 제거 + 광고 필터
// ─────────────────────────────────────────────

import { DEFAULT_AD_KEYWORDS } from '../constants/config.js';

/**
 * 포함/제외 키워드로 기사 필터링
 * @param {Array} articles
 * @param {Object} opts { include?, exclude?, requireAllInclude? }
 *   - include: 이 중 하나라도 포함되어야 통과 (빈 배열이면 검사 건너뜀)
 *   - exclude: 이 중 하나라도 포함되면 제외
 *   - requireAllInclude: true 면 include 의 모든 키워드를 포함해야 함 (AND)
 */
export function applyKeywordFilter(articles, { include = [], exclude = [], requireAllInclude = false } = {}) {
  const inc = include.map(s => s.trim().toLowerCase()).filter(Boolean);
  const exc = exclude.map(s => s.trim().toLowerCase()).filter(Boolean);

  return articles.filter(a => {
    const haystack = `${a.title || ''} ${a.summary || ''}`.toLowerCase();

    if (inc.length) {
      const matchInc = requireAllInclude
        ? inc.every(k => haystack.includes(k))
        : inc.some(k  => haystack.includes(k));
      if (!matchInc) return false;
    }
    if (exc.length && exc.some(k => haystack.includes(k))) return false;

    return true;
  });
}

/**
 * 광고/홍보성 키워드가 포함된 기사 제거
 */
export function filterOutAds(articles, adKeywords = DEFAULT_AD_KEYWORDS) {
  return applyKeywordFilter(articles, { exclude: adKeywords });
}

/**
 * URL 기준 + 정규화된 제목 기준 중복 제거
 * - 같은 URL 은 무조건 중복
 * - 제목 정규화(공백/구두점 제거 + 소문자) 후 동일하면 중복
 */
export function dedupeArticles(articles) {
  const seenUrls   = new Set();
  const seenTitles = new Set();
  const out = [];

  for (const a of articles) {
    const url   = (a.url || '').trim();
    const title = normalizeTitle(a.title);
    if (url && seenUrls.has(url))     continue;
    if (title && seenTitles.has(title)) continue;
    if (url)   seenUrls.add(url);
    if (title) seenTitles.add(title);
    out.push(a);
  }
  return out;
}

function normalizeTitle(s = '') {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[“”"'‘’`,.\-()\[\]{}<>!?·…]/g, '')
    .trim();
}

/**
 * 두 시점의 기사 수를 비교해 키워드 급상승 감지
 * @param {Array} prev   이전 수집 기사
 * @param {Array} curr   현재 수집 기사
 * @param {number} threshold 비율 임계치 (기본 1.5 = 50% 증가)
 */
export function detectTrendingKeywords(prev = [], curr = [], threshold = 1.5) {
  const count = arr => arr.reduce((m, a) => {
    m[a.keyword] = (m[a.keyword] || 0) + 1;
    return m;
  }, {});

  const p = count(prev);
  const c = count(curr);
  const trending = [];

  for (const k of Object.keys(c)) {
    const pv = p[k] || 0;
    const cv = c[k];
    // 새로 등장 또는 일정 임계치 이상 증가
    if (pv === 0 && cv >= 3) {
      trending.push({ keyword: k, prev: 0, curr: cv, ratio: Infinity });
    } else if (pv > 0 && cv / pv >= threshold && cv >= 3) {
      trending.push({ keyword: k, prev: pv, curr: cv, ratio: cv / pv });
    }
  }
  return trending.sort((a, b) => b.ratio - a.ratio);
}
