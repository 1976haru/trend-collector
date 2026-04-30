// ─────────────────────────────────────────────
// sources/officialAgency.js — 법무부/소속기관 보도자료 직접 수집
//
// Google News RSS 의 site: 연산자로 정부/공공기관 도메인 한정 검색을 수행한다.
//   - moj.go.kr / korea.kr / corrections.go.kr / immigration.go.kr / spo.go.kr / hikorea.go.kr
//   - 외부 추가 도메인 — sourceSettings.officialAgencyDomains 로 확장 가능
//
// 모든 결과는 sourceProvider='officialAgency' 로 표시되어 collector 의 진단/통계에서 분리 집계.
// 한 도메인 실패가 전체 실패로 이어지지 않도록 Promise.allSettled 사용.
// ─────────────────────────────────────────────

const GOOGLE_NEWS = 'https://news.google.com/rss/search?hl=ko&gl=KR&ceid=KR:ko&q=';
const TIMEOUT_MS  = 8000;

// 기본 도메인 — 사용자 지정 추가 도메인은 settings 에서 받는다.
export const DEFAULT_AGENCY_DOMAINS = [
  'moj.go.kr',           // 법무부
  'korea.kr',            // 정책브리핑
  'corrections.go.kr',   // 교정본부
  'immigration.go.kr',   // 출입국
  'spo.go.kr',           // 대검찰청
  'hikorea.go.kr',       // 출입국 외국인 정보
];

function clean(s = '') {
  let v = String(s)
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  v = v.replace(/<[^>]*>/g, '');
  v = v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return v.replace(/<[^>]*>/g, '').trim();
}

function extract(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function safeDate(raw) {
  try {
    return new Date(raw).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return raw || ''; }
}

function parseRss(xml, keyword, domain) {
  const items = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m, i = 0;
  while ((m = re.exec(xml))) {
    const block   = m[1];
    const title   = clean(extract(block, 'title'));
    const url     = clean(extract(block, 'link'));
    const pubDate = extract(block, 'pubDate').trim();
    const source  = clean(extract(block, 'source'));
    const summary = clean(extract(block, 'description')).slice(0, 300);
    if (!title) continue;
    items.push({
      id: `${keyword}_oa_${domain}_${i++}_${Date.now()}`,
      keyword,
      title,
      url,
      source: source || domain,
      sourceDomain: domain,
      date:    pubDate ? safeDate(pubDate) : '',
      rawDate: pubDate,
      summary,
      sourceProvider: 'officialAgency',
    });
  }
  return items;
}

async function fetchOneDomain(keyword, domain) {
  // site: 연산자 — Google News 는 inurl/site 모두 지원하지만 정확도는 site: 가 더 높다.
  const q = `${keyword} site:${domain}`;
  const url = GOOGLE_NEWS + encodeURIComponent(q);
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 trend-collector/officialAgency' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseRss(xml, keyword, domain);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 키워드 한 개에 대해 활성화된 모든 정부 도메인을 site: 검색으로 병합 호출한다.
 *
 * @param {string} keyword
 * @param {Object} opts { domains?: string[], maxPerDomain?: number=8, enabled?: boolean=true }
 * @returns {Promise<{articles, errors}>}
 */
export async function fetchOfficialAgencyNews(keyword, opts = {}) {
  if (opts.enabled === false) return { articles: [], errors: [] };
  const domains = (opts.domains && opts.domains.length ? opts.domains : DEFAULT_AGENCY_DOMAINS).slice(0, 12);
  const max = opts.maxPerDomain ?? 8;
  const results = await Promise.allSettled(domains.map(d => fetchOneDomain(keyword, d)));
  const articles = [];
  const errors   = [];
  results.forEach((r, i) => {
    const d = domains[i];
    if (r.status === 'fulfilled') {
      articles.push(...(r.value || []).slice(0, max));
    } else {
      errors.push({ keyword, source: 'officialAgency', domain: d, error: r.reason?.message || String(r.reason) });
    }
  });
  return { articles, errors };
}

export function isOfficialAgencyEnabled(settings = {}) {
  // 기본 ON — 명시적 false 만 비활성
  return settings.officialAgencyEnabled !== false;
}
