// ─────────────────────────────────────────────
// articleExtractor.js — URL 에서 본문 추출
// 공공기관 내부 업무용. cheerio + 휴리스틱.
// Google News 의 인코딩된 URL 은 Puppeteer 로 실제 기사 URL 로 해석한 뒤 cheerio 로 본문 추출.
// ─────────────────────────────────────────────

import * as cheerio from 'cheerio';
import { ensureBrowser } from './pdfGenerator.js';

const TIMEOUT_MS  = 8000;
const MAX_BYTES   = 2_000_000;        // 2MB 이상 페이지는 잘라냄
const USER_AGENT  = 'Mozilla/5.0 (compatible; TrendCollector/1.0; +internal-use)';
const MAX_BODY_LEN = 12_000;          // PDF 부담을 덜기 위한 본문 글자수 상한

// 본문 후보 셀렉터 — 우선순위 순.
const CONTENT_SELECTORS = [
  'article[itemprop="articleBody"]',
  '[itemprop="articleBody"]',
  'article#articleBody',
  '#articleBody',
  '#articleBodyContents',
  '#dic_area',                  // naver
  '#newsct_article',            // naver newer layout
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

// 제거할 노이즈 셀렉터.
const NOISE_SELECTORS = [
  'script', 'style', 'noscript', 'iframe',
  'nav', 'footer', 'aside',
  '.ad', '.ads', '.advertisement', '[class*="advert"]', '[id*="advert"]',
  '[class*="promotion"]',
  '[class*="related"]', '[class*="recommend"]', '[class*="popular"]',
  '[class*="newsletter"]', '[class*="subscribe"]',
  '[class*="reporter"]', '[class*="byline"]', '[class*="profile"]',
  '[class*="comment"]', '[id*="comment"]',
  '[class*="share"]', '[class*="sns"]',
  'figure[role="figure"]',
  '.copyright', '[class*="copyright"]',
  // GDPR / 쿠키 배너
  '[class*="cookie"]', '[id*="cookie"]',
];

const FOLLOW_REDIRECT_MAX = 4;

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

    // 안전 차단: 너무 큰 페이지는 자르기
    const reader = res.body?.getReader?.();
    if (!reader) {
      const text = await res.text();
      return { url: res.url, html: text.slice(0, MAX_BYTES) };
    }
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      chunks.push(value);
      if (total >= MAX_BYTES) { try { await reader.cancel(); } catch {} break; }
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    return { url: res.url, html: new TextDecoder().decode(buf) };
  } finally {
    clearTimeout(timer);
  }
}

function cleanText(s = '') {
  return String(s).replace(/\s+/g, ' ').trim();
}

// 절대 URL 변환
function absUrl(u, base) {
  if (!u) return '';
  try { return new URL(u, base).toString(); } catch { return u; }
}

// 메타 / 추가 메타데이터 추출 (제거 전에 수집)
function extractMeta($, base) {
  const meta = (sel) => $(sel).attr('content') || '';
  const ogImage  = meta('meta[property="og:image"]')        || meta('meta[name="og:image"]')        || meta('meta[property="og:image:url"]');
  const ogTitle  = meta('meta[property="og:title"]');
  const ogDesc   = meta('meta[property="og:description"]')  || meta('meta[name="description"]');
  const author   = meta('meta[name="author"]')              || meta('meta[property="article:author"]');
  const published = meta('meta[property="article:published_time"]') || meta('meta[name="pubdate"]');

  // 기자명 휴리스틱 (한국 매체 흔한 패턴)
  let reporter = author;
  if (!reporter) {
    const candidates = [
      '.byline', '.reporter', '[class*="reporter"]', '[class*="byline"]',
      '.author', '[class*="author"]',
    ];
    for (const sel of candidates) {
      const t = $(sel).first().text().trim();
      if (t && t.length < 60) { reporter = t; break; }
    }
  }

  return {
    leadImage: absUrl(ogImage, base),
    metaTitle: ogTitle,
    metaDesc:  ogDesc,
    reporter:  reporter ? reporter.replace(/\s+/g, ' ').replace(/^by\s+/i, '').trim() : '',
    publishedMeta: published,
  };
}

// 본문 영역 안의 이미지 추출 (최대 3개, 본문 외 광고는 제외)
function extractInlineImages(node, $, base, max = 3) {
  const imgs = [];
  node.find('img').each((_, el) => {
    if (imgs.length >= max) return false;
    const $img = $(el);
    const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-original') || $img.attr('data-lazy-src');
    if (!src) return;
    if (/^data:/i.test(src)) return;                       // 인라인 base64 제외
    const url = absUrl(src, base);
    if (!/^https?:\/\//i.test(url)) return;
    // 트래킹 픽셀 등 작은 이미지 제외
    const w = Number($img.attr('width') || 0);
    const h = Number($img.attr('height') || 0);
    if (w && w < 80) return;
    if (h && h < 60) return;

    let caption = '';
    const $fig = $img.closest('figure');
    if ($fig.length) {
      caption = $fig.find('figcaption').first().text().trim();
    }
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

function extractFromHtml(html, base = '') {
  const $ = cheerio.load(html, { decodeEntities: true });

  // 메타데이터 (노이즈 제거 전에 수집)
  const meta = extractMeta($, base);

  // 노이즈 제거
  for (const sel of NOISE_SELECTORS) $(sel).remove();
  // SNS / 추천 등 한글 라벨로만 잡히는 영역
  $('[class]').each((_, el) => {
    const cls = ($(el).attr('class') || '').toLowerCase();
    if (/sns|share|recom|related|trend|ranking|copyright|reporter|byline|profile|sponsor/.test(cls)) {
      $(el).remove();
    }
  });

  // 본문 후보 선정
  let bestNode = null;
  let bestScore = 0;
  for (const sel of CONTENT_SELECTORS) {
    const node = $(sel).first();
    if (!node.length) continue;
    const len = cleanText(node.text()).length;
    if (len > bestScore) { bestScore = len; bestNode = node; }
  }
  // 위 셀렉터로 못 찾으면 본문 후보를 <p> 길이 합으로 휴리스틱 평가
  if (!bestNode || bestScore < 200) {
    let bestP = null, bestPLen = 0;
    $('div, section, main').each((_, el) => {
      const node = $(el);
      const ps = node.find('p');
      if (ps.length < 2) return;
      const len = ps.toArray().reduce((s, p) => s + cleanText($(p).text()).length, 0);
      if (len > bestPLen) { bestPLen = len; bestP = node; }
    });
    if (bestP && bestPLen > bestScore) { bestNode = bestP; bestScore = bestPLen; }
  }

  if (!bestNode || bestScore < 100) {
    return {
      contentText: '', contentHtml: '', extracted: false, reason: 'no-body-candidate',
      leadImage: meta.leadImage, reporter: meta.reporter, publishedMeta: meta.publishedMeta,
      images: meta.leadImage ? [{ url: meta.leadImage, caption: '' }] : [],
    };
  }

  // 본문 영역 이미지 (최대 3개)
  const inlineImages = extractInlineImages(bestNode, $, base);
  const allImages = [];
  if (meta.leadImage) allImages.push({ url: meta.leadImage, caption: '' });
  for (const img of inlineImages) {
    if (!allImages.some(x => x.url === img.url)) allImages.push(img);
    if (allImages.length >= 3) break;
  }

  // 본문 텍스트 — <p>/<br> 줄바꿈 보존
  const paragraphs = [];
  bestNode.find('p, h2, h3, li').each((_, el) => {
    const t = cleanText($(el).text());
    if (t && t.length >= 4) paragraphs.push(t);
  });
  let text = paragraphs.join('\n');
  if (!text) text = cleanText(bestNode.text());
  text = text.slice(0, MAX_BODY_LEN);

  // 안전한 HTML — 인라인 스타일/이벤트 제거, <a> 만 남김
  bestNode.find('*').each((_, el) => {
    const $el = $(el);
    const tag = el.tagName?.toLowerCase();
    if (!['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'br', 'blockquote'].includes(tag)) {
      $el.replaceWith($el.text());
      return;
    }
    // 모든 속성 제거 후 a[href] 만 복원
    const href = tag === 'a' ? $el.attr('href') : null;
    for (const attr of Object.keys($el.attr() || {})) $el.removeAttr(attr);
    if (href && /^https?:\/\//i.test(href)) {
      $el.attr('href', href);
      $el.attr('target', '_blank');
      $el.attr('rel', 'noopener noreferrer');
    }
  });
  let html2 = bestNode.html() || '';
  if (html2.length > MAX_BODY_LEN * 1.5) html2 = html2.slice(0, MAX_BODY_LEN * 1.5) + '…';

  return {
    contentText: text, contentHtml: html2, extracted: true, reason: '',
    leadImage: meta.leadImage, reporter: meta.reporter, publishedMeta: meta.publishedMeta,
    images: allImages,
  };
}

// Google News 의 인코딩된 URL 인지 여부.
// 형태: https://news.google.com/(rss/)?articles/CBMi...
function isGoogleNewsUrl(u = '') {
  return /^https?:\/\/news\.google\.com\/(rss\/)?articles\//i.test(u);
}

/**
 * Google News URL 을 실제 기사 URL 로 해석한다.
 * Puppeteer 로 페이지를 열고 JavaScript redirect 가 일어날 때까지 대기.
 */
async function resolveGoogleNewsUrl(url, { timeoutMs = 10_000 } = {}) {
  const browser = await ensureBrowser();
  const page    = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36');
    await page.setJavaScriptEnabled(true);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    // JS redirect 발생 대기
    try {
      await page.waitForFunction(
        () => !location.hostname.includes('news.google.com'),
        { timeout: timeoutMs }
      );
    } catch {
      /* 일부 매체는 redirect 가 안 일어나거나 매우 늦음 — 현재 URL 로 진행 */
    }
    return page.url();
  } finally {
    try { await page.close(); } catch {}
  }
}

/**
 * 단일 URL 의 본문을 추출한다.
 */
export async function extractArticle(url) {
  if (!/^https?:\/\//i.test(url || '')) {
    return { contentText: '', contentHtml: '', extracted: false, extractionError: 'invalid-url' };
  }
  try {
    let target = url;
    let resolved;
    if (isGoogleNewsUrl(url)) {
      try {
        resolved = await resolveGoogleNewsUrl(url);
        if (resolved && !isGoogleNewsUrl(resolved)) target = resolved;
      } catch (e) {
        // resolve 실패 — 원래 URL 로 진행
      }
    }

    const { html, url: finalUrl } = await fetchHtml(target);
    const r = extractFromHtml(html, finalUrl);
    if (!r.extracted) {
      return { ...r, resolvedUrl: resolved || target, extractionError: r.reason };
    }
    return { ...r, resolvedUrl: resolved || target };
  } catch (e) {
    return { contentText: '', contentHtml: '', extracted: false, extractionError: e.message || String(e) };
  }
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
