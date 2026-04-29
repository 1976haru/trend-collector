// ─────────────────────────────────────────────
// collector.js — 서버사이드 RSS 수집
// Node fetch 로 Google News RSS 직접 호출 (프록시 불필요)
// ─────────────────────────────────────────────

import { loadConfig, saveReport } from './store.js';

const GOOGLE_NEWS = 'https://news.google.com/rss/search?hl=ko&gl=KR&ceid=KR:ko&q=';
const MAX_PER_KEYWORD = 30;

const AD_TERMS = [
  '광고', '협찬', '프로모션', '특가', '할인',
  '쿠폰', '체험단', '리뷰이벤트', '[ad]', '[pr]',
];

function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

async function fetchRss(keyword) {
  const url = GOOGLE_NEWS + encodeURIComponent(keyword);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 trend-collector' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseRss(xml, keyword).slice(0, MAX_PER_KEYWORD);
}

function parseRss(xml, keyword) {
  const items = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const title    = clean(extract(block, 'title'));
    const url      = clean(extract(block, 'link'));
    const pubDate  = extract(block, 'pubDate').trim();
    const source   = clean(extract(block, 'source')) || extractSourceFromTitle(title);
    const summary  = clean(extract(block, 'description')).slice(0, 300);
    if (!title) continue;
    items.push({
      id: `${keyword}_${i++}_${Date.now()}`,
      keyword, title, url, source,
      date: pubDate ? safeDate(pubDate) : '',
      rawDate: pubDate,
      summary,
    });
  }
  return items;
}

function extract(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function clean(s = '') {
  return String(s)
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function extractSourceFromTitle(t) {
  const m = t.match(/-\s*([^-]+)$/);
  return m ? m[1].trim() : '미상';
}

function safeDate(raw) {
  try {
    return new Date(raw).toLocaleString('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return raw; }
}

function normalize(s = '') {
  return s.toLowerCase().replace(/\s+/g, ' ')
    .replace(/[“”"'‘’`,.\-()\[\]{}<>!?·…]/g, '').trim();
}

function dedupe(articles) {
  const urls = new Set(), titles = new Set();
  const out  = [];
  for (const a of articles) {
    const u = (a.url || '').trim();
    const t = normalize(a.title || '');
    if (u && urls.has(u))   continue;
    if (t && titles.has(t)) continue;
    if (u) urls.add(u);
    if (t) titles.add(t);
    out.push(a);
  }
  return out;
}

function applyExcludes(articles, excludes = []) {
  if (!excludes.length) return articles;
  const exc = excludes.map(s => String(s).toLowerCase()).filter(Boolean);
  return articles.filter(a => {
    const hay = `${a.title || ''} ${a.summary || ''}`.toLowerCase();
    return !exc.some(k => hay.includes(k));
  });
}

function applyAdFilter(articles) {
  return articles.filter(a => {
    const hay = `${a.title || ''} ${a.summary || ''}`.toLowerCase();
    return !AD_TERMS.some(k => hay.includes(k));
  });
}

/**
 * 모든 키워드에 대해 RSS 수집 → 중복/광고/제외 필터 → 리포트 저장.
 * @param {Object} opts { trigger?: 'manual'|'scheduled' }
 * @returns {Object} 저장된 리포트
 */
export async function runCollection({ trigger = 'manual' } = {}) {
  const cfg = await loadConfig();
  if (!cfg.keywords?.length) {
    throw new Error('키워드가 등록되어 있지 않습니다. 먼저 키워드를 추가하세요.');
  }

  const all = [];
  const errors = [];
  for (const kw of cfg.keywords) {
    try {
      const items = await fetchRss(kw);
      all.push(...items);
    } catch (e) {
      errors.push({ keyword: kw, error: e.message });
    }
  }

  let processed = dedupe(all);
  if (cfg.filterAds) processed = applyAdFilter(processed);
  processed       = applyExcludes(processed, cfg.excludes);

  const report = {
    id:          newId(),
    generatedAt: new Date().toISOString(),
    keywords:    cfg.keywords,
    excludes:    cfg.excludes || [],
    reportType:  cfg.reportType || 'daily',
    trigger,
    articles:    processed,
    errors,
  };
  await saveReport(report);
  return report;
}
