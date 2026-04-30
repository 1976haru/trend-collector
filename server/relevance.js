// ─────────────────────────────────────────────
// relevance.js — 기사–키워드 관련성 점수 계산
//
// 점수 기준:
//   - 제목에 키워드 포함        : +5
//   - 설명/요약에 키워드 포함   : +3
//   - 본문에 키워드 포함        : +2
//   - 매체/기관/부서 키워드     : +1
//   - 어디에도 매칭 없음         : 0
//
// 등급:
//   relevanceScore >= 5  → 'high'
//   relevanceScore >= 2  → 'medium'
//   relevanceScore >= 1  → 'low'
//   else                  → 'none'
//
// 매칭은 normalizeKeyword (공백/특수문자 제거 + 소문자) 기반 substring.
// collector.js 의 normalizeKeyword 와 동일 정책으로 keep
// ─────────────────────────────────────────────

function normalize(s = '') {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .toLowerCase()
    .replace(/[\s ​]+/g, '')
    .replace(/[“”"'‘’`,.\-_()\[\]{}<>!?·…/\\|:;~+*%&^$#@=]/g, '');
}

const FIELD_WEIGHTS = {
  title:       5,
  summary:     3,
  contentText: 2,
  source:      1,
};

/**
 * 기사 한 건의 관련성 점수 계산.
 * @param {Object} article  { title, summary, contentText, source, departments[]? }
 * @param {string[]} keywords  사용자가 선택한 검색 키워드
 * @returns {Object} {
 *   relevanceScore: number,
 *   matchedKeywords: string[],
 *   unmatchedKeywords: string[],
 *   relevanceLevel: 'high'|'medium'|'low'|'none',
 *   relevanceReason: string,
 *   relevanceMatches: { [field]: string[] }
 * }
 */
export function scoreRelevance(article = {}, keywords = []) {
  const kws = (keywords || []).filter(Boolean);
  if (!kws.length) {
    return {
      relevanceScore: 0,
      matchedKeywords: [],
      unmatchedKeywords: [],
      relevanceLevel: 'none',
      relevanceReason: '검색 키워드가 비어 있어 관련성 평가 불가',
      relevanceMatches: {},
    };
  }
  const fields = {
    title:       normalize(article.title),
    summary:     normalize(article.summary),
    contentText: normalize(article.contentText),
    source:      normalize(article.source) + ' ' + (article.departments || []).map(d => normalize(d.name || d)).join(' '),
  };
  const matches = {};   // field → matched kw list
  const matchedSet = new Set();
  let score = 0;
  for (const kw of kws) {
    const nk = normalize(kw);
    if (!nk) continue;
    let matchedAnyField = false;
    for (const [field, w] of Object.entries(FIELD_WEIGHTS)) {
      if (fields[field] && fields[field].includes(nk)) {
        score += w;
        if (!matches[field]) matches[field] = [];
        matches[field].push(kw);
        matchedAnyField = true;
        // 한 키워드는 한 필드당 1회만 카운트 — 같은 키워드의 multi-occurrence 는 무시
        // (다른 필드에서는 가산)
      }
    }
    if (matchedAnyField) matchedSet.add(kw);
  }
  const matchedKeywords   = kws.filter(k => matchedSet.has(k));
  const unmatchedKeywords = kws.filter(k => !matchedSet.has(k));

  const level = score >= 5 ? 'high'
              : score >= 2 ? 'medium'
              : score >= 1 ? 'low'
              : 'none';

  const reason = matchedKeywords.length === 0
    ? `선택 키워드 ${kws.length}개 중 매칭 0건 — 본문/제목/요약에 모두 미발견`
    : `매칭 ${matchedKeywords.length}/${kws.length}: ${matchedKeywords.slice(0, 3).join(', ')}${matchedKeywords.length > 3 ? '…' : ''} (점수 ${score})`;

  return {
    relevanceScore: score,
    matchedKeywords,
    unmatchedKeywords,
    relevanceLevel: level,
    relevanceReason: reason,
    relevanceMatches: matches,
  };
}

/**
 * 제외 후보 — 자동 제안 (자동 삭제 X).
 * 기준: matchedKeywords.length === 0 OR relevanceScore <= 1
 * @returns {Array<articleId>}
 */
export function suggestExclusionCandidates(articles = [], keywords = []) {
  const out = [];
  for (const a of articles) {
    if (a.excluded) continue;
    if (!a.matchedKeywords || a.matchedKeywords.length === 0 || (a.relevanceScore || 0) <= 1) {
      out.push({
        id: a.id,
        title: a.title,
        source: a.source,
        score: a.relevanceScore || 0,
        reason: 'matchedKeywords 0건 또는 relevanceScore ≤ 1',
        url: a.url,
      });
    }
  }
  return out;
}

/**
 * 제외된 기사에서 자주 등장하는 단어를 모아 "제외 키워드 추천".
 * 단, 기존 검색 키워드와 너무 가까운 단어는 제외 (사건 관련 단어 보호).
 * 단순 빈도 기반 — 한국어 형태소 분석 없이 문자 길이 ≥ 2 토큰 카운트.
 *
 * @param {Array} excludedArticles  excluded=true 기사 배열
 * @param {string[]} searchKeywords  현재 검색 키워드 — 보호 대상
 * @returns {Array<{ word, count, reason }>}  최대 15건
 */
export function suggestExcludeWords(excludedArticles = [], searchKeywords = []) {
  const protect = new Set(searchKeywords.map(normalize));
  const STOP = new Set([
    '기자', '뉴스', '보도', '오늘', '어제', '내일', '발표', '말했다', '밝혔다',
    '있는', '있다', '하는', '한다', '이다', '없다', '에서', '으로', '에게',
    '대한', '대해', '관련', '대신', '통해', '위해', '대표', '관계자',
  ]);
  const counts = {};
  for (const a of excludedArticles) {
    const txt = `${a.title || ''} ${a.summary || ''}`.replace(/<[^>]*>/g, ' ');
    // 한글 2~6자 토큰 + 영숫자 3+ 토큰 추출
    const tokens = txt.match(/[가-힣]{2,6}|[A-Za-z]{3,}|[0-9]{3,}/g) || [];
    const seen = new Set();
    for (const t of tokens) {
      const nt = normalize(t);
      if (!nt || nt.length < 2) continue;
      if (STOP.has(nt)) continue;
      if (protect.has(nt)) continue;
      // 검색 키워드와 substring 관계인 것도 제외 (예: 검색 키워드가 '보호관찰' 인데 '관찰' 추천 X)
      let near = false;
      for (const p of protect) {
        if (p && (nt.includes(p) || p.includes(nt))) { near = true; break; }
      }
      if (near) continue;
      if (seen.has(nt)) continue;
      seen.add(nt);
      counts[nt] = (counts[nt] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word, count]) => ({
      word,
      count,
      reason: `제외된 ${count}건 기사에 반복 등장`,
    }));
}
