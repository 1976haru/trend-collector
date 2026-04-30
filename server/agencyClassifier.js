// ─────────────────────────────────────────────
// agencyClassifier.js — 기관 배포자료 자동 식별 + 법무부 소속기관 분류
//
// 기존 collector.js 의 classifyArticleSource 는 단순 'agency'/'press' 만 구분했음.
// 본 모듈은 그 위에:
//   1) 도메인 / 매체명 / 제목 본문 3중 시그널로 isOfficialRelease 정확도 향상
//   2) 법무부 본부 / 보호직 / 교정 / 출입국 / 검찰 5 카테고리로 자동 분류
//   3) 자동 추적 기준 ON/OFF 와 결합해 trackingMode='auto' 등록 여부 판정
// ─────────────────────────────────────────────

// 카테고리 키 — 자동 추적 ON/OFF 토글과 1:1 매핑된다.
export const AGENCY_CATEGORIES = {
  moj:         { label: '법무부 본부' },
  probation:   { label: '보호직 (보호관찰·소년원)' },
  corrections: { label: '교정' },
  immigration: { label: '출입국' },
  prosecution: { label: '검찰' },
  policy:      { label: '정책브리핑/타 부처' },
  other:       { label: '기타 .go.kr' },
};

// 도메인 → 카테고리. 가장 길게 매칭되는 host 우선.
const DOMAIN_RULES = [
  // 법무부 본부
  { host: 'moj.go.kr',                 cat: 'moj',         agency: '법무부' },
  // 교정
  { host: 'corrections.go.kr',         cat: 'corrections', agency: '교정본부' },
  { host: 'correction.go.kr',          cat: 'corrections', agency: '교정본부' },
  // 출입국
  { host: 'immigration.go.kr',         cat: 'immigration', agency: '출입국외국인정책본부' },
  { host: 'hikorea.go.kr',             cat: 'immigration', agency: '출입국외국인정책본부' },
  // 검찰
  { host: 'spo.go.kr',                 cat: 'prosecution', agency: '대검찰청' },
  { host: 'prosecution.go.kr',         cat: 'prosecution', agency: '검찰청' },
  // 정책브리핑 (정부 통합 보도자료)
  { host: 'korea.kr',                  cat: 'policy',      agency: '대한민국 정책브리핑' },
  { host: 'mois.go.kr',                cat: 'policy',      agency: '행정안전부' },
];

// 매체명 (source) → 카테고리. 기관명을 source 로 받는 기사에 사용.
const SOURCE_RULES = [
  { match: /대한민국\s*정책브리핑|정책브리핑/, cat: 'policy',      agency: '대한민국 정책브리핑' },
  { match: /^법무부$|법무부\s*(대변인|기획조정|법무|인권국|검찰국|범죄예방)/, cat: 'moj', agency: '법무부' },
  { match: /교정본부/,                          cat: 'corrections', agency: '교정본부' },
  { match: /출입국외국인정책본부|출입국·?외국인청|출입국사무소/, cat: 'immigration', agency: '출입국외국인정책본부' },
  { match: /보호관찰소|준법지원센터/,           cat: 'probation',   agency: null /* 후처리 */ },
  { match: /소년원|소년분류심사원|청소년비행예방센터/, cat: 'probation',   agency: null },
  { match: /치료감호소/,                        cat: 'probation',   agency: '치료감호소' },
  { match: /범죄예방정책국/,                    cat: 'probation',   agency: '범죄예방정책국' },
  { match: /^대검찰청$|^검찰청$|지방검찰청/,    cat: 'prosecution', agency: null },
];

// 제목/본문 키워드 — DOMAIN/SOURCE 가 명확하지 않을 때만 사용 (false positive 방지).
const TITLE_RULES = [
  // 명시적 보도자료 / 정책브리핑 시그널
  { match: /\[?보도자료\]?|press\s*release/i, cat: 'policy',      agency: '대한민국 정책브리핑' },
  // 법무부 본부 부서명
  { match: /법무부\s*(대변인실|기획조정실|법무실|인권국|검찰국|범죄예방정책국)/, cat: 'moj', agency: '법무부' },
  // 보호직 — 지명 + 보호관찰소 패턴
  { match: /[가-힣]{2,}\s*보호관찰소|[가-힣]{2,}\s*준법지원센터/, cat: 'probation', agency: null },
  { match: /[가-힣]{2,}\s*소년원|소년분류심사원|청소년비행예방센터/, cat: 'probation', agency: null },
  // 교정
  { match: /[가-힣]{2,}\s*(교도소|구치소)|지방교정청/, cat: 'corrections', agency: null },
  { match: /교정본부\s*(보도자료|발표|브리핑)?/, cat: 'corrections', agency: '교정본부' },
  // 출입국
  { match: /[가-힣]{2,}\s*출입국[·\s]?외국인청|[가-힣]{2,}\s*출입국사무소|외국인보호소/, cat: 'immigration', agency: null },
  // 검찰
  { match: /[가-힣]{2,}\s*지방검찰청|대검찰청|검찰청\s*(보도자료|발표)/, cat: 'prosecution', agency: null },
];

// 후처리: 제목/본문에서 첫 매칭된 기관명을 추출 (예: "서울보호관찰소", "수원지방검찰청")
const NAME_EXTRACTORS = {
  probation: [
    /([가-힣]{2,}\s*보호관찰소)/,
    /([가-힣]{2,}\s*준법지원센터)/,
    /([가-힣]{2,}\s*소년원)/,
    /(소년분류심사원)/,
    /(청소년비행예방센터)/,
    /(치료감호소)/,
    /(범죄예방정책국)/,
  ],
  corrections: [
    /([가-힣]{2,}\s*교도소)/,
    /([가-힣]{2,}\s*구치소)/,
    /([가-힣]{2,}지방교정청)/,
    /(교정본부)/,
  ],
  immigration: [
    /([가-힣]{2,}\s*출입국[·\s]?외국인청)/,
    /([가-힣]{2,}\s*출입국사무소)/,
    /(외국인보호소)/,
    /(출입국외국인정책본부)/,
  ],
  prosecution: [
    /([가-힣]{2,}\s*지방검찰청)/,
    /(대검찰청)/,
    /(검찰청)/,
  ],
  moj: [
    /(법무부\s*(?:대변인실|기획조정실|법무실|인권국|검찰국|범죄예방정책국))/,
    /(법무부)/,
  ],
};

function safeHost(url = '') {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch { return ''; }
}

function matchByDomain(host) {
  if (!host) return null;
  // 정확 일치 → suffix 일치 순으로 검사
  for (const r of DOMAIN_RULES) {
    if (host === r.host || host.endsWith('.' + r.host)) return r;
  }
  // 그 외 *.go.kr → other (사용자 토글로 제어)
  if (host.endsWith('.go.kr')) return { host, cat: 'other', agency: host };
  return null;
}

function matchBySource(source) {
  const s = String(source || '').trim();
  if (!s) return null;
  for (const r of SOURCE_RULES) {
    if (r.match.test(s)) return r;
  }
  return null;
}

function matchByTitle(article) {
  const hay = `${article.title || ''}\n${article.summary || ''}`;
  for (const r of TITLE_RULES) {
    if (r.match.test(hay)) return r;
  }
  return null;
}

function extractAgencyName(cat, article, fallback) {
  const hay = `${article.source || ''}\n${article.title || ''}\n${article.summary || ''}`;
  const list = NAME_EXTRACTORS[cat] || [];
  for (const re of list) {
    const m = hay.match(re);
    if (m) return m[1].replace(/\s+/g, '');
  }
  return fallback || article.source || null;
}

/**
 * 기사 한 건을 분류한다.
 * @param {Object} article — { url, source, mediaType, title, summary, contentText }
 * @returns {Object} {
 *   articleSource: 'agency'|'press',
 *   isOfficialRelease: boolean,
 *   agencyName: string|null,        // 예: '서울보호관찰소' / '대한민국 정책브리핑'
 *   agencyCategory: string|null,    // 예: '보호직'
 *   officialReleaseType: 'moj'|'probation'|'corrections'|'immigration'|'prosecution'|'policy'|'other'|null
 * }
 */
export function classifyAgencyArticle(article = {}) {
  // Google News RSS 는 news.google.com 으로 redirect 됨 — resolvedUrl 이 진짜 도메인을 가리킨다.
  // 두 후보를 모두 검사하고 더 명확한 매칭을 우선한다.
  const hosts = [
    safeHost(article.resolvedUrl),
    safeHost(article.originalUrl),
    safeHost(article.url),
  ].filter(h => h && h !== 'news.google.com');
  let dom = null;
  for (const h of hosts) {
    const m = matchByDomain(h);
    if (m) { dom = m; break; }
  }
  const src = matchBySource(article.source);
  const tit = matchByTitle(article);

  // 우선순위: 도메인 > 매체명 > 제목 시그널.
  const hit = dom || src || tit;

  if (!hit) {
    return {
      articleSource:       'press',
      isOfficialRelease:   false,
      agencyName:          null,
      agencyCategory:      null,
      officialReleaseType: null,
    };
  }

  const cat   = hit.cat;
  const label = AGENCY_CATEGORIES[cat]?.label || '기타 기관';
  const name  = extractAgencyName(cat, article, hit.agency);

  return {
    articleSource:       'agency',
    isOfficialRelease:   true,
    agencyName:          name,
    agencyCategory:      label,
    officialReleaseType: cat,
  };
}

// ── 자동 추적 기준 ─────────────────────────────────────
export const DEFAULT_AUTO_TRACKING = {
  moj:         true,
  probation:   true,
  corrections: true,
  immigration: true,
  prosecution: true,
  policy:      true,    // 정책브리핑
  other:       true,    // 기타 .go.kr
};

/**
 * 자동 추적 대상 여부 — 분류 결과 + 사용자 ON/OFF 설정으로 결정.
 * @param {Object} cls — classifyAgencyArticle 결과
 * @param {Object} settings — { moj, probation, corrections, immigration, prosecution, policy, other } boolean 맵
 */
export function shouldAutoTrack(cls, settings = {}) {
  if (!cls?.isOfficialRelease || !cls.officialReleaseType) return false;
  const merged = { ...DEFAULT_AUTO_TRACKING, ...(settings || {}) };
  return merged[cls.officialReleaseType] !== false;
}
