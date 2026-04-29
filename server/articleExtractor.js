// ─────────────────────────────────────────────
// articleExtractor.js — URL 에서 본문 + 이미지 추출
// 공공기관 내부 업무용. 도메인별 어댑터 + 휴리스틱 폴백.
// Google News / Naver redirect 는 Puppeteer 로 실제 URL 해석.
// ─────────────────────────────────────────────

import * as cheerio from 'cheerio';
import { ensureBrowser } from './pdfGenerator.js';
import { decodeHtmlBuffer } from './encodingDetect.js';

const TIMEOUT_MS   = 9000;
const MAX_BYTES    = 2_500_000;
const USER_AGENT   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_BODY_LEN = 12_000;

// ── 도메인별 본문 셀렉터 (우선순위 1) ──────────
const DOMAIN_ADAPTERS = {
  // Naver 뉴스
  'n.news.naver.com':   { selectors: ['#dic_area', '#newsct_article', '#articeBody', '#articleBodyContents'], leadImg: ['meta[property="og:image"]'] },
  'news.naver.com':     { selectors: ['#dic_area', '#newsct_article', '#articleBody'], leadImg: ['meta[property="og:image"]'] },
  // Daum 뉴스
  'v.daum.net':         { selectors: ['[data-cloud-area="article"]', '#harmonyContainer', '.article_view'], leadImg: ['meta[property="og:image"]'] },
  'm.daum.net':         { selectors: ['[data-cloud-area="article"]', '.article_view'], leadImg: ['meta[property="og:image"]'] },
  // 정부 정책브리핑
  'www.korea.kr':       { selectors: ['#contents .articles_content', '.article_content', '#txt', '.cont_left'], leadImg: ['meta[property="og:image"]', '.thumbnail img'] },
  'm.korea.kr':         { selectors: ['.article_content', '#txt'], leadImg: ['meta[property="og:image"]'] },
  // 통신사
  'yna.co.kr':          { selectors: ['#articleWrap', '.story-news', '[itemprop="articleBody"]', '.article'] },
  'yonhapnews.co.kr':   { selectors: ['#articleWrap', '.story-news'] },
  'newsis.com':         { selectors: ['.viewer', '#content article', '.cnt_view'] },
  'news1.kr':           { selectors: ['.detail.read', '.article-body', '#articleBody'] },
  // 중앙 일간지
  'chosun.com':         { selectors: ['section[class*="article-body"]', '#news_body_id', '.par'] },
  'biz.chosun.com':     { selectors: ['section[class*="article-body"]'] },
  'joongang.co.kr':     { selectors: ['#article_body', '[data-id="article-body"]', '.article_body'] },
  'donga.com':          { selectors: ['.article_body', '#article_txt', '[itemprop="articleBody"]'] },
  'hani.co.kr':         { selectors: ['.article-text', '#contents-text', '[class*="article-body"]'] },
  'khan.co.kr':         { selectors: ['.art_body', '#articleBody', '.art_cont'] },
  'hankookilbo.com':    { selectors: ['.article-body', '#article-view-content'] },
  'kmib.co.kr':         { selectors: ['#articleBody'] },
  'munhwa.com':         { selectors: ['#News_content', '.news_content'] },
  'segye.com':          { selectors: ['#article_txt', '.viewBox2'] },
  'seoul.co.kr':        { selectors: ['.viewContent', '#atic_txt1'] },
  // 방송
  'ytn.co.kr':          { selectors: ['#CmAdContent', '.paragraph', '.article'] },
  'kbs.co.kr':          { selectors: ['.detail-body', '#cont_newstext', '.kbsArticleView'] },
  'imbc.com':           { selectors: ['#content .news_txt', '.news-content', '#news_txt'] },
  'sbs.co.kr':          { selectors: ['.text_area', '.main_text', '#mainTextSection'] },
  'jtbc.co.kr':         { selectors: ['.article_content', '#articlebody'] },
  // 경제
  'mk.co.kr':           { selectors: ['#article_body', '.news_cnt_detail_wrap'] },
  'hankyung.com':       { selectors: ['#articletxt', '.article-body'] },
  'mt.co.kr':           { selectors: ['#textBody', '.view_text'] },
  'edaily.co.kr':       { selectors: ['.news_body'] },
  'sedaily.com':        { selectors: ['.article_view', '.view_con'] },
  'fnnews.com':         { selectors: ['#article_content', '.cont'] },
  'asiae.co.kr':        { selectors: ['.view_txt', '#txt_area'] },
  'ajunews.com':        { selectors: ['.article_view', '#articleBody'] },
  'heraldcorp.com':     { selectors: ['#articleText', '.article_view_section'] },
  // 인터넷
  'ohmynews.com':       { selectors: ['.art_body', '#articleView'] },
  'pressian.com':       { selectors: ['.article-body', '#article_body'] },
  'mediatoday.co.kr':   { selectors: ['#article-view-content-div', '.article-body'] },
  'dailian.co.kr':      { selectors: ['#article-text', '.article_body'] },
  'kukinews.com':       { selectors: ['.article_view', '#article-view-content-div'] },
  'nocutnews.co.kr':    { selectors: ['#pnlContent', '.viewContent'] },
  'inews24.com':        { selectors: ['.article-text', '#articleBody'] },
};

// 노이즈 셀렉터.
const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe', 'svg',
  'nav', 'footer', 'aside', 'header',
  '.ad', '.ads', '.advertisement', '[class*="advert"]', '[id*="advert"]',
  '[class*="promotion"]', '[class*="banner"]',
  '[class*="related"]', '[class*="recommend"]', '[class*="popular"]',
  '[class*="newsletter"]', '[class*="subscribe"]',
  '[class*="reporter"]', '[class*="byline"]', '[class*="profile"]',
  '[class*="comment"]', '[id*="comment"]',
  '[class*="share"]', '[class*="sns"]',
  '.copyright', '[class*="copyright"]',
  '[class*="cookie"]', '[id*="cookie"]',
];

const FALLBACK_SELECTORS = [
  'article[itemprop="articleBody"]',
  '[itemprop="articleBody"]',
  'article#articleBody',
  '#articleBody',
  '#articleBodyContents',
  '#dic_area',
  '#newsct_article',
  '#contents',
  '#content',
  '.article-body',
  '.article_body',
  '.news-article-body',
  '.article-view-content-div',
  '.entry-content',
  '.post-content',
  'article',
];

function getHost(u = '') {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

function findAdapter(url) {
  const host = getHost(url);
  if (!host) return null;
  if (DOMAIN_ADAPTERS[host]) return DOMAIN_ADAPTERS[host];
  if (DOMAIN_ADAPTERS[`www.${host}`]) return DOMAIN_ADAPTERS[`www.${host}`];
  // 서브도메인 매칭: news.kbs.co.kr → kbs.co.kr
  for (const key of Object.keys(DOMAIN_ADAPTERS)) {
    if (host === key || host.endsWith('.' + key)) return DOMAIN_ADAPTERS[key];
  }
  return null;
}

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':      USER_AGENT,
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7',
      },
      redirect: 'follow',
      signal:   ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(ct)) throw new Error(`unsupported ${ct || 'no content-type'}`);

    // 바이트로 받은 뒤 charset 자동 감지 디코딩 (EUC-KR / CP949 안전)
    const reader = res.body?.getReader?.();
    let buf;
    if (!reader) {
      const ab = await res.arrayBuffer();
      buf = Buffer.from(ab).slice(0, MAX_BYTES);
    } else {
      const chunks = []; let total = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        chunks.push(value);
        if (total >= MAX_BYTES) { try { await reader.cancel(); } catch {} break; }
      }
      const u8 = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { u8.set(c, off); off += c.byteLength; }
      buf = Buffer.from(u8);
    }
    const dec = decodeHtmlBuffer(buf, ct);
    return { url: res.url, html: dec.text, encoding: dec.encoding, garbledRatio: dec.ratio };
  } finally {
    clearTimeout(timer);
  }
}

function cleanText(s = '') {
  let v = String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  v = v.replace(/<[^>]+>/g, ' ');
  return v.replace(/\s+/g, ' ').trim();
}

function absUrl(u, base) {
  if (!u) return '';
  try { return new URL(u, base).toString(); } catch { return u; }
}

// lazy-load 속성까지 모두 시도
function pickImgSrc($, el) {
  const $img = $(el);
  const candidates = [
    $img.attr('src'),
    $img.attr('data-src'),
    $img.attr('data-original'),
    $img.attr('data-lazy-src'),
    $img.attr('data-lazy'),
    $img.attr('data-actualsrc'),
    $img.attr('data-srcset')?.split(/\s*,\s*/)[0]?.split(/\s+/)[0],
    $img.attr('srcset')?.split(/\s*,\s*/)[0]?.split(/\s+/)[0],
  ];
  for (const c of candidates) if (c && !/^data:/i.test(c)) return c;
  return '';
}

// 메타 추출 (제거 전에)
function extractMeta($, base) {
  const meta = (sel) => $(sel).attr('content') || '';
  const ogImage    = meta('meta[property="og:image"]')      || meta('meta[name="og:image"]')      || meta('meta[property="og:image:url"]');
  const twImage    = meta('meta[name="twitter:image"]')     || meta('meta[name="twitter:image:src"]');
  const ogTitle    = meta('meta[property="og:title"]');
  const ogDesc     = meta('meta[property="og:description"]')|| meta('meta[name="description"]');
  const author     = meta('meta[name="author"]')            || meta('meta[property="article:author"]');
  const published  = meta('meta[property="article:published_time"]') || meta('meta[name="pubdate"]');

  let reporter = author;
  if (!reporter) {
    for (const sel of ['.byline', '.reporter', '[class*="reporter"]', '[class*="byline"]', '.author', '[class*="author"]']) {
      const t = $(sel).first().text().trim();
      if (t && t.length < 60) { reporter = t; break; }
    }
  }
  return {
    leadImage:     absUrl(ogImage || twImage, base),
    metaTitle:     ogTitle,
    metaDesc:      ogDesc,
    reporter:      reporter ? reporter.replace(/\s+/g, ' ').replace(/^by\s+/i, '').trim() : '',
    publishedMeta: published,
  };
}

// 본문 영역에서 이미지 (lazy-load 포함)
function extractInlineImages(node, $, base, max = 3) {
  const imgs = [];
  const seen = new Set();
  node.find('img').each((_, el) => {
    if (imgs.length >= max) return false;
    const src = pickImgSrc($, el);
    if (!src) return;
    const url = absUrl(src, base);
    if (!/^https?:\/\//i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    const $img = $(el);
    const w = Number($img.attr('width') || 0);
    const h = Number($img.attr('height') || 0);
    if (w && w < 80) return;
    if (h && h < 60) return;

    let caption = '';
    const $fig = $img.closest('figure');
    if ($fig.length) caption = $fig.find('figcaption').first().text().trim();
    if (!caption) {
      const $next = $img.next();
      if ($next.length && /caption|cap|figcaption/i.test($next.attr('class') || '')) {
        caption = $next.text().trim();
      }
    }
    imgs.push({ url, caption: caption.slice(0, 200) });
  });
  return imgs;
}

function extractFromHtml(html, base = '', adapter = null) {
  const $ = cheerio.load(html, { decodeEntities: true });
  const meta = extractMeta($, base);

  for (const sel of NOISE_SELECTORS) $(sel).remove();
  $('[class]').each((_, el) => {
    const cls = ($(el).attr('class') || '').toLowerCase();
    if (/sns|share|recom|related|trend|ranking|copyright|reporter|byline|profile|sponsor/.test(cls)) {
      $(el).remove();
    }
  });

  // 1) 도메인별 어댑터
  let bestNode = null;
  let bestScore = 0;
  let method = 'fallback';

  if (adapter && Array.isArray(adapter.selectors)) {
    for (const sel of adapter.selectors) {
      const node = $(sel).first();
      if (!node.length) continue;
      const len = cleanText(node.text()).length;
      if (len > bestScore) { bestScore = len; bestNode = node; method = 'adapter'; }
    }
  }

  // 2) 일반 fallback 셀렉터
  if (!bestNode || bestScore < 200) {
    for (const sel of FALLBACK_SELECTORS) {
      const node = $(sel).first();
      if (!node.length) continue;
      const len = cleanText(node.text()).length;
      if (len > bestScore) { bestScore = len; bestNode = node; method = 'generic'; }
    }
  }

  // 3) <p> 밀도 휴리스틱
  if (!bestNode || bestScore < 200) {
    let bestP = null, bestPLen = 0;
    $('div, section, main').each((_, el) => {
      const node = $(el);
      const ps = node.find('p');
      if (ps.length < 2) return;
      const len = ps.toArray().reduce((s, p) => s + cleanText($(p).text()).length, 0);
      if (len > bestPLen) { bestPLen = len; bestP = node; }
    });
    if (bestP && bestPLen > bestScore) { bestNode = bestP; bestScore = bestPLen; method = 'heuristic'; }
  }

  if (!bestNode || bestScore < 100) {
    return {
      contentText: '', contentHtml: '', extracted: false, reason: 'no-body-candidate',
      extractionMethod: method, extractionQuality: 'failed',
      leadImage: meta.leadImage, reporter: meta.reporter, publishedMeta: meta.publishedMeta,
      images: meta.leadImage ? [{ url: meta.leadImage, caption: '' }] : [],
    };
  }

  // 본문 텍스트
  const paragraphs = [];
  bestNode.find('p, h2, h3, li').each((_, el) => {
    const t = cleanText($(el).text());
    if (t && t.length >= 4) paragraphs.push(t);
  });
  let text = paragraphs.join('\n');
  if (!text) text = cleanText(bestNode.text());
  text = text.slice(0, MAX_BODY_LEN);

  // 안전한 HTML
  bestNode.find('*').each((_, el) => {
    const $el = $(el);
    const tag = el.tagName?.toLowerCase();
    if (!['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'br', 'blockquote', 'figure', 'figcaption', 'img'].includes(tag)) {
      $el.replaceWith($el.text());
      return;
    }
    if (tag === 'a') {
      const href = $el.attr('href');
      for (const attr of Object.keys($el.attr() || {})) $el.removeAttr(attr);
      if (href && /^https?:\/\//i.test(href)) {
        $el.attr('href', href).attr('target', '_blank').attr('rel', 'noopener noreferrer');
      }
    } else if (tag === 'img') {
      // lazy 속성을 src 로 승격
      const src = pickImgSrc($, el);
      for (const attr of Object.keys($el.attr() || {})) $el.removeAttr(attr);
      if (src && /^https?:\/\//i.test(absUrl(src, base))) {
        $el.attr('src', absUrl(src, base)).attr('referrerpolicy', 'no-referrer').attr('loading', 'lazy');
      } else {
        $el.replaceWith('');
      }
    } else {
      for (const attr of Object.keys($el.attr() || {})) $el.removeAttr(attr);
    }
  });
  let html2 = bestNode.html() || '';
  if (html2.length > MAX_BODY_LEN * 1.5) html2 = html2.slice(0, MAX_BODY_LEN * 1.5) + '…';

  // 이미지 — 본문 영역 + meta 합치기
  const inlineImages = extractInlineImages(bestNode, $, base);
  const allImages = [];
  if (meta.leadImage) allImages.push({ url: meta.leadImage, caption: '' });
  for (const img of inlineImages) {
    if (!allImages.some(x => x.url === img.url)) allImages.push(img);
    if (allImages.length >= 4) break;
  }

  // 추출 품질 라벨
  const quality = bestScore >= 600 ? 'success'
                : bestScore >= 200 ? 'partial'
                : 'fallback';

  return {
    contentText: text, contentHtml: html2, extracted: true, reason: '',
    extractionMethod: method,
    extractionQuality: quality,
    leadImage: meta.leadImage, reporter: meta.reporter, publishedMeta: meta.publishedMeta,
    images: allImages,
  };
}

// Google News 의 인코딩된 URL 인지 여부
function isGoogleNewsUrl(u = '') {
  return /^https?:\/\/news\.google\.com\/(rss\/)?articles\//i.test(u);
}

async function resolveGoogleNewsUrl(url, { timeoutMs = 10_000 } = {}) {
  const browser = await ensureBrowser();
  const page    = await browser.newPage();
  try {
    await page.setUserAgent(USER_AGENT);
    await page.setJavaScriptEnabled(true);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    try {
      await page.waitForFunction(() => !location.hostname.includes('news.google.com'), { timeout: timeoutMs });
    } catch { /* redirect 가 늦으면 현재 URL 로 진행 */ }
    return page.url();
  } finally {
    try { await page.close(); } catch {}
  }
}

// ── Puppeteer 로 페이지 HTML 가져오기 (fetch 실패 / 자바스크립트 의존 페이지 fallback) ──
async function fetchHtmlViaPuppeteer(url, { timeoutMs = 15_000 } = {}) {
  const browser = await ensureBrowser();
  const page    = await browser.newPage();
  try {
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    // JS 가 본문을 그리는 데 걸리는 시간을 살짝 기다림
    await new Promise(r => setTimeout(r, 1500));
    const html = await page.content();
    return { html, url: page.url() };
  } finally {
    try { await page.close(); } catch {}
  }
}

// ── 본문 추출 모두 실패 시 원문 페이지 일부를 스크린샷 (data: URI) ──
async function screenshotPage(url, { timeoutMs = 15_000 } = {}) {
  const browser = await ensureBrowser();
  const page    = await browser.newPage();
  try {
    await page.setUserAgent(USER_AGENT);
    await page.setViewport({ width: 1024, height: 1500, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await new Promise(r => setTimeout(r, 1800));
    const buf = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: false });
    return `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
  } finally {
    try { await page.close(); } catch {}
  }
}

/**
 * 단일 URL 의 본문을 추출한다.
 * 폴백 체인:
 *   1) fetch + cheerio (도메인 어댑터 → generic → heuristic)
 *   2) Puppeteer page.content() + cheerio (JS 의존 페이지)
 *   3) 스크린샷 (data: URI 로 PDF 에 임베드 가능)
 *
 * 반환 필드:
 *   originalUrl, resolvedUrl, contentText, contentHtml,
 *   extracted, extractionMethod, extractionQuality, extractionError,
 *   leadImage, reporter, publishedMeta, images,
 *   fallbackScreenshot (data URI, 마지막 fallback 일 때만)
 */
export async function extractArticle(url, { allowPuppeteer = true, allowScreenshot = true } = {}) {
  const originalUrl = url || '';
  if (!/^https?:\/\//i.test(originalUrl)) {
    return { originalUrl, resolvedUrl: '', contentText: '', contentHtml: '', extracted: false,
             extractionMethod: 'none', extractionQuality: 'failed', extractionError: 'invalid-url' };
  }

  let target = originalUrl;
  let resolvedUrl;
  if (isGoogleNewsUrl(originalUrl)) {
    try {
      resolvedUrl = await resolveGoogleNewsUrl(originalUrl);
      if (resolvedUrl && !isGoogleNewsUrl(resolvedUrl)) target = resolvedUrl;
    } catch { /* resolve 실패 — 원본 시도 */ }
  }

  let lastError = '';
  let finalUrlGuess = target;

  // 1) 일반 fetch + cheerio
  let encodingUsed = '', garbledRatioVal = 0;
  try {
    const { html, url: finalUrl, encoding, garbledRatio } = await fetchHtml(target);
    finalUrlGuess = finalUrl;
    encodingUsed   = encoding || '';
    garbledRatioVal = garbledRatio || 0;
    const adapter = findAdapter(finalUrl) || findAdapter(target);
    const r = extractFromHtml(html, finalUrl, adapter);
    if (r.extracted) {
      return {
        originalUrl,
        resolvedUrl: resolvedUrl || finalUrl,
        ...r,
        encodingUsed,
        garbledRatio: garbledRatioVal,
        extractionError: '',
      };
    }
    lastError = r.reason || 'no-body-candidate';
  } catch (e) {
    lastError = e.message || String(e);
  }

  // 2) Puppeteer fallback (JavaScript 가 본문을 그리는 페이지)
  if (allowPuppeteer) {
    try {
      const { html, url: finalUrl } = await fetchHtmlViaPuppeteer(target);
      finalUrlGuess = finalUrl;
      const adapter = findAdapter(finalUrl) || findAdapter(target);
      const r = extractFromHtml(html, finalUrl, adapter);
      if (r.extracted) {
        return {
          originalUrl,
          resolvedUrl: resolvedUrl || finalUrl,
          ...r,
          encodingUsed: 'puppeteer-utf8',
          garbledRatio: 0,
          extractionMethod: `puppeteer:${r.extractionMethod}`,
          extractionError: '',
        };
      }
      lastError = `puppeteer-${r.reason || 'no-body-candidate'}`;
    } catch (e) {
      lastError = `puppeteer-${e.message || e}`;
    }
  }

  // 3) 스크린샷 fallback — PDF 에 시각적으로 들어가도록 dataURI 반환
  let fallbackScreenshot = '';
  if (allowScreenshot) {
    try {
      fallbackScreenshot = await screenshotPage(finalUrlGuess);
    } catch (e) {
      // 스크린샷도 실패 — 무시
    }
  }

  return {
    originalUrl,
    resolvedUrl: resolvedUrl || finalUrlGuess,
    contentText: '', contentHtml: '',
    extracted: false,
    extractionMethod: fallbackScreenshot ? 'screenshot' : 'fetch-error',
    extractionQuality: 'failed',
    extractionError: lastError,
    encodingUsed,
    garbledRatio: garbledRatioVal,
    fallbackScreenshot,
  };
}

/**
 * 병렬 제한 (limit) 으로 여러 기사 추출.
 */
export async function extractMany(articles, { limit = 5 } = {}) {
  const out = [];
  for (let i = 0; i < articles.length; i += limit) {
    const chunk = articles.slice(i, i + limit);
    const results = await Promise.all(chunk.map(a => extractArticle(a.url)));
    for (let k = 0; k < chunk.length; k++) {
      out.push({ ...chunk[k], ...results[k] });
    }
  }
  return out;
}
