// ─────────────────────────────────────────────
// rssService.js — Google News RSS 뉴스 수집
// API 키 불필요, 완전 무료
// ─────────────────────────────────────────────

import { RSS_PROXY, GOOGLE_NEWS_BASE, MAX_ARTICLES_PER_KEYWORD } from '../constants/config.js';

/**
 * 특정 키워드의 뉴스를 Google News RSS에서 수집
 */
export async function fetchNewsByKeyword(keyword, maxResults = MAX_ARTICLES_PER_KEYWORD) {
  const rssUrl = `${GOOGLE_NEWS_BASE}${encodeURIComponent(keyword)}`;
  const proxyUrl = `${RSS_PROXY}${encodeURIComponent(rssUrl)}`;

  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`RSS 수집 실패: ${keyword}`);

  const data = await res.json();
  if (!data.contents) throw new Error(`내용 없음: ${keyword}`);

  const parser = new DOMParser();
  const xml = parser.parseFromString(data.contents, 'text/xml');
  const items = Array.from(xml.querySelectorAll('item')).slice(0, maxResults);

  return items.map(item => parseRssItem(item, keyword));
}

/**
 * 여러 키워드 동시 수집 (Promise.allSettled로 일부 실패 허용)
 */
export async function fetchAllKeywords(keywords) {
  const results = await Promise.allSettled(
    keywords.map(kw => fetchNewsByKeyword(kw))
  );

  const articles = [];
  const errors = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      articles.push(...r.value);
    } else {
      errors.push({ keyword: keywords[i], error: r.reason?.message });
    }
  });

  return { articles, errors };
}

// ── 내부 유틸 ──────────────────────────────

function parseRssItem(item, keyword) {
  const title   = clean(item.querySelector('title')?.textContent || '제목 없음');
  const url     = item.querySelector('link')?.nextSibling?.textContent?.trim()
                || item.querySelector('link')?.textContent?.trim() || '';
  const pubDate = item.querySelector('pubDate')?.textContent || '';
  const source  = item.querySelector('source')?.textContent
                || extractSource(title) || '미상';
  const desc    = clean(item.querySelector('description')?.textContent || '');

  return {
    id: `${keyword}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    keyword,
    title,
    url,
    source,
    date: formatPubDate(pubDate),
    rawDate: pubDate,
    summary: desc.slice(0, 250),
    collectedAt: new Date().toISOString(),
    bookmarked: false,
  };
}

function clean(str) {
  return str
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractSource(title) {
  // Google News 제목 끝 '- 언론사명' 패턴 추출
  const match = title.match(/-\s*([^-]+)$/);
  return match ? match[1].trim() : null;
}

function formatPubDate(pubDate) {
  if (!pubDate) return '';
  try {
    const d = new Date(pubDate);
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return pubDate;
  }
}
