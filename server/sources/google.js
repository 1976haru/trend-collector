// ─────────────────────────────────────────────
// sources/google.js — Google 다층 수집 (RSS + News HTML fallback + Web HTML fallback)
//
// 배경: Google News RSS 만으로는 실제 검색 페이지에 보이는 모든 결과를 가져오지 못한다.
// 특히 국내 인터넷 / 지방언론 / 최신 기사가 누락되는 경우가 많다.
//
// 다층 구조:
//   1) fetchGoogleNewsRss        — RSS 피드 (가장 안정적, 기본 ON)
//   2) fetchGoogleNewsHtmlFallback — Google News 검색 페이지 HTML 파싱 (?tbm=nws)
//   3) fetchGoogleWebHtmlFallback  — Google Web 검색 페이지 HTML 파싱 (일반 검색)
//
// 정책:
//   - HTML fallback 은 차단 / 변형 가능성이 있으므로 실패해도 throw 하지 않는다.
//   - 한 소스 실패가 전체 fetchGoogleAll 실패로 이어지지 않는다.
//   - sourceProvider 는 'google-rss' / 'google-news-html' / 'google-web-html' 로 분리.
//   - 결과는 collector 의 dedup 단계에서 url 기반으로 합쳐진다.
// ─────────────────────────────────────────────

const RSS_URL  = 'https://news.google.com/rss/search';
const NEWS_URL = 'https://www.google.com/search';
const WEB_URL  = 'https://www.google.com/search';
const TIMEOUT_MS = 10_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// ── 공통 유틸 ─────────────────────────────────────
function clean(s = '') {
  let v = String(s)
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  v = v.replace(/<[^>]*>/g, '');
  v = v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return v.replace(/<[^>]*>/g, '').trim();
}
function extractTag(block, tag) {
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
function extractSourceFromTitle(t) {
  const m = String(t).match(/-\s*([^-]+)$/);
  return m ? m[1].trim() : '미상';
}
async function fetchWithTimeout(url, opts = {}) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

// Google redirect URL → 실제 URL 추출
//   /url?q=https://example.com/article&...
function resolveGoogleRedirect(url) {
  try {
    const u = new URL(url);
    if (u.pathname === '/url' || u.pathname === '/imgres') {
      const real = u.searchParams.get('q') || u.searchParams.get('url');
      if (real && /^https?:/i.test(real)) return real;
    }
    return url;
  } catch { return url; }
}

// 최근 N일 / N시간 문자열을 ISO 추정 (HTML fallback 결과의 relativeTime 처리용)
//   '17시간 전' / '2일 전' / 'Yesterday' / 'X시간 전'
function relativeToIso(rel) {
  if (!rel) return '';
  const s = String(rel).trim();
  const now = Date.now();
  let m;
  if ((m = s.match(/(\d+)\s*분/)))    return new Date(now - +m[1] * 60_000).toISOString();
  if ((m = s.match(/(\d+)\s*시간/)))  return new Date(now - +m[1] * 3_600_000).toISOString();
  if ((m = s.match(/(\d+)\s*일/)))    return new Date(now - +m[1] * 86_400_000).toISOString();
  if ((m = s.match(/(\d+)\s*주/)))    return new Date(now - +m[1] * 7 * 86_400_000).toISOString();
  // 그 외는 원본 문자열을 Date 가 해석할 수 있게 그대로 반환
  const t = Date.parse(s);
  if (Number.isFinite(t)) return new Date(t).toISOString();
  return '';
}

// ── 1) Google News RSS ─────────────────────────────
export async function fetchGoogleNewsRss(keyword, { limit = 30 } = {}) {
  const url = `${RSS_URL}?q=${encodeURIComponent(keyword)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'trend-collector/1.0' } });
  if (!res.ok) throw new Error(`Google News RSS HTTP ${res.status}`);
  const xml = await res.text();
  const items = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m, i = 0;
  while ((m = re.exec(xml)) && items.length < limit) {
    const block   = m[1];
    const title   = clean(extractTag(block, 'title'));
    const url2    = clean(extractTag(block, 'link'));
    const pubDate = extractTag(block, 'pubDate').trim();
    const source  = clean(extractTag(block, 'source')) || extractSourceFromTitle(title);
    const summary = clean(extractTag(block, 'description')).slice(0, 300);
    if (!title) continue;
    items.push({
      id: `${keyword}_grss_${i++}_${Date.now()}`,
      keyword, title, url: url2, source,
      date:    pubDate ? safeDate(pubDate) : '',
      rawDate: pubDate,
      summary,
      sourceProvider: 'google-rss',
    });
  }
  return items;
}

// ── 2) Google News HTML fallback (?tbm=nws&gbv=1) ───────────
//   Google 검색 페이지는 JS 활성화를 요구하므로 gbv=1 (basic HTML mode) 사용.
//   이는 차단되지 않으면서도 결과 카드가 평문 HTML 로 반환되어 파싱 가능.
//   차단/empty 응답에 대해 graceful (throw 시 collector 가 errors 로 흘림).
export async function fetchGoogleNewsHtmlFallback(keyword, { limit = 20 } = {}) {
  const q = `${keyword} 뉴스`;
  // gbv=1 = basic HTML mode (JS 불필요), num=20 = 결과 수
  const url = `${NEWS_URL}?q=${encodeURIComponent(q)}&tbm=nws&hl=ko&gl=KR&gbv=1&num=20`;
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ko-KR,ko;q=0.9' },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 429 || /captcha|sorry/i.test(txt)) {
      throw new Error(`Google News HTML 차단 의심 (HTTP ${res.status}) — UA / robots / 자동화 감지에 의해 응답이 제한될 수 있습니다.`);
    }
    throw new Error(`Google News HTML HTTP ${res.status}`);
  }
  const html = await res.text();
  // JS 활성화 요구 응답 감지 — basic HTML 도 거부된 경우
  if (/enablejs|enable JavaScript|JavaScript이?\s*(을|를)?\s*사용/i.test(html.slice(0, 1500))) {
    throw new Error('Google News HTML — JavaScript 활성화 요구 응답 (basic HTML 모드 거부됨).');
  }
  return parseGoogleHtml(html, keyword, 'google-news-html', limit);
}

// ── 3) Google Web HTML fallback (?gbv=1) ────────────────
export async function fetchGoogleWebHtmlFallback(keyword, { limit = 15 } = {}) {
  const q = `${keyword} 언론 보도`;
  const url = `${WEB_URL}?q=${encodeURIComponent(q)}&hl=ko&gl=KR&gbv=1&num=20`;
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ko-KR,ko;q=0.9' },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 429 || /captcha|sorry/i.test(txt)) {
      throw new Error(`Google Web HTML 차단 의심 (HTTP ${res.status}).`);
    }
    throw new Error(`Google Web HTML HTTP ${res.status}`);
  }
  const html = await res.text();
  if (/enablejs|enable JavaScript|JavaScript이?\s*(을|를)?\s*사용/i.test(html.slice(0, 1500))) {
    throw new Error('Google Web HTML — JavaScript 활성화 요구 응답 (basic HTML 모드 거부됨).');
  }
  return parseGoogleHtml(html, keyword, 'google-web-html', limit);
}

// Google 검색 결과 HTML 에서 결과 카드 추출 — 두 가지 패턴 모두 시도.
//   패턴 A: <a href="/url?q=URL&..."> ... <h3>TITLE</h3>
//   패턴 B: <a href="https://..."> ... 직접 링크
// 검색 결과 div 셀렉터는 자주 바뀌므로 a[href*="/url?q="] / h3 / cite 조합으로 휴리스틱.
function parseGoogleHtml(html, keyword, provider, limit) {
  const items = [];
  const seenUrls = new Set();
  // 1) /url?q= 형식 redirect 링크 추출
  const reA = /<a\s+href="\/url\?q=([^"&]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m, i = 0;
  while ((m = reA.exec(html)) && items.length < limit) {
    const realUrl = decodeURIComponent(m[1]);
    if (seenUrls.has(realUrl)) continue;
    if (!/^https?:\/\//i.test(realUrl)) continue;
    if (/^https?:\/\/(?:www\.|webcache\.|policies\.)?google\./i.test(realUrl)) continue;
    if (/youtube\.com|google\.com\/search/i.test(realUrl)) continue;
    const inner = m[2];
    // 제목: <h3> 우선, 없으면 inner 첫 텍스트
    const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const title = clean(h3 ? h3[1] : inner).slice(0, 200);
    if (!title || title.length < 4) continue;

    // 인접 영역에서 source / 시간 / snippet 추출 (대략 600자 윈도우)
    const ctxStart = Math.max(0, m.index - 50);
    const ctxEnd   = Math.min(html.length, m.index + m[0].length + 600);
    const ctx      = html.slice(ctxStart, ctxEnd);
    let source = '', relTime = '', snippet = '';
    const cite = ctx.match(/<cite[^>]*>([\s\S]*?)<\/cite>/i);
    if (cite) {
      const host = clean(cite[1]).split(/[›\s/]/).filter(Boolean)[0];
      try { source = new URL(realUrl).hostname.replace(/^www\./, ''); }
      catch { source = host || ''; }
    } else {
      try { source = new URL(realUrl).hostname.replace(/^www\./, ''); } catch {}
    }
    // 시간 표현 (분/시간/일 전)
    const tm = ctx.match(/(\d+\s*(?:분|시간|일|주)\s*전)/);
    if (tm) relTime = tm[1];
    // snippet — span 또는 div 내 단문
    const sp = ctx.match(/<span[^>]*>([^<]{20,200})<\/span>/i) || ctx.match(/<div[^>]*>([^<]{20,200})<\/div>/i);
    if (sp) snippet = clean(sp[1]).slice(0, 240);

    seenUrls.add(realUrl);
    items.push({
      id: `${keyword}_${provider}_${i++}_${Date.now()}`,
      keyword,
      title,
      url:           realUrl,
      resolvedUrl:   realUrl,
      source:        source || '미상',
      date:          relTime ? safeDate(relativeToIso(relTime) || Date.now()) : '',
      rawDate:       relativeToIso(relTime) || '',
      relativeTime:  relTime,
      summary:       snippet,
      sourceProvider: provider,
    });
  }

  // 2) 직접 링크 패턴 — 최신 Google 응답에서 일부 결과는 /url 래핑이 없을 수 있음
  if (items.length < limit) {
    const reB = /<a\s+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?<h3[\s\S]*?<\/h3>[\s\S]*?)<\/a>/gi;
    while ((m = reB.exec(html)) && items.length < limit) {
      const realUrl = m[1];
      if (seenUrls.has(realUrl)) continue;
      if (/google\.com|youtube\.com/i.test(realUrl)) continue;
      const inner = m[2];
      const h3 = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const title = clean(h3 ? h3[1] : inner).slice(0, 200);
      if (!title || title.length < 4) continue;
      let source = '';
      try { source = new URL(realUrl).hostname.replace(/^www\./, ''); } catch {}
      seenUrls.add(realUrl);
      items.push({
        id: `${keyword}_${provider}_${i++}_${Date.now()}`,
        keyword,
        title,
        url:           realUrl,
        resolvedUrl:   realUrl,
        source:        source || '미상',
        date:          '',
        rawDate:       '',
        summary:       '',
        sourceProvider: provider,
      });
    }
  }
  return items;
}

/**
 * Google 다층 수집 — RSS + (선택) HTML fallback.
 *
 * @param {string} keyword
 * @param {Object} opts
 *   - rssLimit: 30
 *   - newsHtmlLimit: 20 (fallback 활성 시)
 *   - webHtmlLimit: 15 (fallback 활성 시)
 *   - fallbackEnabled: false   // googleFallbackEnabled — RSS 결과와 무관하게 항상 추가 호출
 *   - fallbackOnLowResult: 5   // RSS 결과가 이 수보다 적으면 자동 fallback
 * @returns {Promise<{ articles: [], errors: [], counts: { rss, newsHtml, webHtml } }>}
 */
export async function fetchGoogleAll(keyword, opts = {}) {
  const rssLimit       = opts.rssLimit       ?? 30;
  const newsHtmlLimit  = opts.newsHtmlLimit  ?? 20;
  const webHtmlLimit   = opts.webHtmlLimit   ?? 15;
  const forceFallback  = !!opts.fallbackEnabled;
  const lowThreshold   = opts.fallbackOnLowResult ?? 5;

  const result = { articles: [], errors: [], counts: { rss: 0, newsHtml: 0, webHtml: 0 } };

  // 1) RSS — 항상 호출
  let rssItems = [];
  try {
    rssItems = await fetchGoogleNewsRss(keyword, { limit: rssLimit });
    result.counts.rss = rssItems.length;
  } catch (e) {
    result.errors.push({ keyword, source: 'google-rss', error: e.message || String(e) });
  }
  result.articles.push(...rssItems);

  // 2) HTML fallback — 강제 ON 또는 RSS 결과 부족 시 자동
  const triggerFallback = forceFallback || (result.counts.rss < lowThreshold);
  if (triggerFallback) {
    const tasks = [
      fetchGoogleNewsHtmlFallback(keyword, { limit: newsHtmlLimit }).then(arr => ({ name: 'google-news-html', arr }))
        .catch(e => ({ name: 'google-news-html', err: e.message || String(e) })),
      fetchGoogleWebHtmlFallback(keyword,  { limit: webHtmlLimit }).then(arr => ({ name: 'google-web-html', arr }))
        .catch(e => ({ name: 'google-web-html', err: e.message || String(e) })),
    ];
    const out = await Promise.all(tasks);
    for (const o of out) {
      if (o.err) {
        result.errors.push({ keyword, source: o.name, error: o.err });
      } else {
        const arr = o.arr || [];
        if (o.name === 'google-news-html') result.counts.newsHtml = arr.length;
        else                                result.counts.webHtml  = arr.length;
        result.articles.push(...arr);
      }
    }
  }

  return result;
}
