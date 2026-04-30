// ─────────────────────────────────────────────
// sources/customSources.js — 사용자 지정 뉴스 소스 (RSS / 검색 URL 템플릿)
//
// 운영자가 관리자 화면에서 추가한 사용자 지정 소스를 키워드별로 호출한다.
//
// 지원 유형:
//   1) 'rss'    — 정적 RSS URL (키워드 무시, 전체 RSS 피드 → 키워드 매칭으로 후필터)
//   2) 'search' — 검색 URL 템플릿. {{keyword}} 또는 %s 자리표시자 위치에 키워드 삽입.
//                 응답이 RSS/Atom XML 이면 자동 파싱, HTML 이면 무시 (안전성 우선)
//
// 모든 결과는 sourceProvider='custom' + customSourceId 부착.
// 한 소스 실패가 전체 실패로 이어지지 않는다.
// ─────────────────────────────────────────────

const TIMEOUT_MS = 8000;

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
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return raw || ''; }
}

function parseFeed(xml, keyword, src) {
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml.slice(0, 800));
  if (isAtom) {
    const re = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
    let m, i = 0;
    while ((m = re.exec(xml))) {
      const block = m[1];
      const title   = clean(extract(block, 'title'));
      const url     = (block.match(/<link[^>]+href="([^"]+)"/i) || [])[1] || '';
      const pubDate = extract(block, 'updated') || extract(block, 'published');
      const summary = clean(extract(block, 'summary') || extract(block, 'content')).slice(0, 300);
      if (!title) continue;
      items.push(_make(keyword, src, title, url, pubDate, summary, i++));
    }
    return items;
  }
  // RSS 2.0
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m, i = 0;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const title   = clean(extract(block, 'title'));
    const url     = clean(extract(block, 'link'));
    const pubDate = extract(block, 'pubDate').trim();
    const source  = clean(extract(block, 'source'));
    const summary = clean(extract(block, 'description')).slice(0, 300);
    if (!title) continue;
    items.push(_make(keyword, src, title, url, pubDate, summary, i++, source));
  }
  return items;
}

function _make(keyword, src, title, url, pubDate, summary, idx, sourceLabel) {
  return {
    id: `${keyword}_cs_${src.id}_${idx}_${Date.now()}`,
    keyword,
    title,
    url,
    source:       sourceLabel || src.name || src.id || '사용자 지정',
    date:         pubDate ? safeDate(pubDate) : '',
    rawDate:      pubDate,
    summary,
    sourceProvider:  'custom',
    customSourceId:  src.id,
    customSourceName: src.name || '',
    agencyCategory:  src.agencyCategory || '',
  };
}

// 키워드 매칭 (정적 RSS 후필터용)
function matchesKeyword(article, keyword) {
  const k = String(keyword || '').toLowerCase();
  if (!k) return true;
  const hay = `${article.title || ''} ${article.summary || ''}`.toLowerCase();
  return hay.includes(k);
}

async function fetchOne(src, keyword, maxPerSource) {
  if (src.enabled === false) return [];
  let url = String(src.url || '').trim();
  if (!url) return [];

  if (src.type === 'search') {
    // 검색 템플릿 — {{keyword}} 또는 %s 치환
    if (url.includes('{{keyword}}'))      url = url.replaceAll('{{keyword}}', encodeURIComponent(keyword));
    else if (url.includes('%s'))           url = url.replaceAll('%s', encodeURIComponent(keyword));
    else                                    url = url + (url.includes('?') ? '&' : '?') + 'q=' + encodeURIComponent(keyword);
  }

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 trend-collector/customSource', 'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const text = await res.text();
    // RSS/Atom 만 신뢰 — HTML 응답은 안전상 무시
    const looksXml = /xml|rss|atom/.test(ct) || /^<\?xml|<rss\b|<feed\b/i.test(text.slice(0, 200));
    if (!looksXml) {
      throw new Error(`RSS/Atom XML 이 아닌 응답입니다 (${ct || '알 수 없음'}). URL 이 RSS 피드인지 확인하세요.`);
    }
    let items = parseFeed(text, keyword, src);
    // 정적 RSS (type=rss) 는 키워드 후필터, 검색형 (type=search) 은 그대로
    if (src.type === 'rss') items = items.filter(a => matchesKeyword(a, keyword));
    return items.slice(0, maxPerSource);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 키워드 한 개에 대해 활성화된 사용자 지정 소스를 모두 호출.
 * @param {string} keyword
 * @param {Object} opts { sources: CustomSource[], maxPerSource?: number=8 }
 * @returns {Promise<{articles, errors}>}
 */
export async function fetchCustomSourceNews(keyword, opts = {}) {
  const sources = (opts.sources || []).filter(s => s && s.enabled !== false);
  if (!sources.length) return { articles: [], errors: [] };
  const max = opts.maxPerSource ?? 8;
  const results = await Promise.allSettled(sources.map(s => fetchOne(s, keyword, max)));
  const articles = [];
  const errors   = [];
  results.forEach((r, i) => {
    const s = sources[i];
    if (r.status === 'fulfilled') articles.push(...(r.value || []));
    else errors.push({ keyword, source: 'custom', customSourceId: s.id, customSourceName: s.name, error: r.reason?.message || String(r.reason) });
  });
  return { articles, errors };
}

/**
 * 사용자 지정 소스 1개 검증 — UI 의 "테스트" 버튼용.
 * @returns {Promise<{ ok, count, sample, error? }>}
 */
export async function testCustomSource(src, keyword = '보호관찰') {
  try {
    const items = await fetchOne({ ...src, enabled: true }, keyword, 5);
    return { ok: true, count: items.length, sample: items.slice(0, 3).map(a => ({ title: a.title, source: a.source, url: a.url })) };
  } catch (e) {
    return { ok: false, count: 0, error: e.message || String(e) };
  }
}
