// ─────────────────────────────────────────────
// collector.js — 서버사이드 RSS 수집 + 분석 통합
// 결과 리포트에 다음을 포함:
//   - articles[*].mediaType, sentiment
//   - mediaCounts, sentiment, trending, groups
//   - summaryText (자동 요약 문장)
// ─────────────────────────────────────────────

import { loadConfig, listReports, loadReport, saveReport } from './store.js';
import { classifyMedia, countByMediaType, MEDIA_TYPES } from './mediaList.js';
import { analyzeSentiments } from './sentiment.js';

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
  let m, i = 0;
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
      date:    pubDate ? safeDate(pubDate) : '',
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
    .replace(/<[^>]*>/g, '')        // 인라인 HTML 제거 — 링크/태그가 텍스트로 새는 문제 방지
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

function extractSourceFromTitle(t) {
  const m = t.match(/-\s*([^-]+)$/);
  return m ? m[1].trim() : '미상';
}

function safeDate(raw) {
  try {
    return new Date(raw).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
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

// ── 중복 기사 묶기 ──────────────────────────────
// 정규화된 제목의 첫 12자 prefix 가 같거나, 첫 단어 5개가 같으면 그룹.
function groupByTitle(articles) {
  const groups = [];
  const sigToIdx = new Map();
  for (const a of articles) {
    const norm = normalize(a.title || '');
    const sig  = norm.slice(0, 12) || norm;
    let idx = sigToIdx.get(sig);
    if (idx === undefined) {
      idx = groups.length;
      sigToIdx.set(sig, idx);
      groups.push({
        signature:    sig,
        leadTitle:    a.title,
        leadUrl:      a.url,
        leadSource:   a.source,
        leadKeyword:  a.keyword,
        sources:      new Set(),
        articleIds:   [],
        count:        0,
      });
    }
    const g = groups[idx];
    if (a.source) g.sources.add(a.source);
    g.articleIds.push(a.id);
    g.count++;
  }
  return groups
    .map(g => ({ ...g, sources: Array.from(g.sources) }))
    .filter(g => g.count >= 2)         // 2개 이상 모인 그룹만
    .sort((a, b) => b.count - a.count);
}

// ── 키워드별 보도 건수 집계 ─────────────────────
function countByKeyword(articles) {
  return articles.reduce((m, a) => {
    if (!a.keyword) return m;
    m[a.keyword] = (m[a.keyword] || 0) + 1;
    return m;
  }, {});
}

// ── 급상승 감지 ────────────────────────────────
async function detectTrending(currentCounts) {
  // 직전 리포트 1건과 비교
  const items = await listReports({ limit: 1 });
  if (!items.length) return [];
  let prev;
  try { prev = await loadReport(items[0].id); } catch { return []; }
  const prevCounts = countByKeyword(prev.articles || []);

  const out = [];
  for (const k of Object.keys(currentCounts)) {
    const curr = currentCounts[k];
    const pv   = prevCounts[k] || 0;
    let trending = false;
    let ratio    = pv === 0 ? Infinity : curr / pv;
    // 전회 5건 → 현재 15건 이상  또는  200% 이상 증가
    if (pv === 0 && curr >= 10)             trending = true;
    else if (pv >= 1 && ratio >= 3 && curr >= 5) trending = true;
    else if (pv >= 5 && curr >= 15)         trending = true;

    if (trending) out.push({ keyword: k, prev: pv, curr, ratio: Number((ratio === Infinity ? 999 : ratio).toFixed(2)) });
  }
  return out.sort((a, b) => b.curr - a.curr);
}

// ── 자동 요약 문장 ─────────────────────────────
function buildSummaryText({ articles, keywords, mediaCounts, sentiment, trending }) {
  const total = articles.length;
  if (!total) return '오늘은 수집된 보도가 없습니다.';

  const topKw  = topN(countByKeyword(articles), 1)[0];
  const topMedia = topN(mediaCounts, 3).filter(([k]) => k !== '기타');
  const trendStr = trending.length
    ? `급상승 키워드는 ${trending.slice(0, 3).map(t => `‘${t.keyword}’(${t.prev}→${t.curr})`).join(', ')} 입니다.`
    : '특별한 급상승 키워드는 관측되지 않았습니다.';

  const mood = sentiment.overall === '부정 우세'
    ? `전반적으로 부정 기조가 우세하여 부정 ${sentiment.negativePct}% / 긍정 ${sentiment.positivePct}% 로 집계되었습니다.`
    : sentiment.overall === '긍정 우세'
    ? `전반적으로 긍정 기조이며 긍정 ${sentiment.positivePct}% / 부정 ${sentiment.negativePct}% 로 집계되었습니다.`
    : `긍·부정이 비교적 균형(긍정 ${sentiment.positivePct}% / 부정 ${sentiment.negativePct}%)을 이루고 있습니다.`;

  const lead = topKw
    ? `오늘 ‘${topKw[0]}’ 관련 보도는 총 ${topKw[1]}건으로 비중이 가장 높았으며, 전체 수집 ${total}건 중 ${Math.round(topKw[1] / total * 100)}% 를 차지했습니다.`
    : `오늘 키워드(${keywords.join(', ')})에 대해 총 ${total}건이 수집되었습니다.`;

  const mediaStr = topMedia.length
    ? `주된 보도 매체 유형은 ${topMedia.map(([k, v]) => `${k}(${v})`).join(', ')} 입니다.`
    : '';

  const action = sentiment.overall === '부정 우세' || trending.length
    ? '⚠️ 대응 필요 — 부정 이슈 또는 급상승 키워드가 있어 모니터링이 권장됩니다.'
    : '✅ 특이 동향 없음 — 일상 모니터링 수준에서 충분합니다.';

  return [lead, mediaStr, trendStr, mood, action].filter(Boolean).join(' ');
}

function topN(obj, n) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
}

// ── 메인 ────────────────────────────────────────

/**
 * 모든 키워드 RSS 수집 + 필터 + 분석 → 리포트 저장.
 * @param {Object} opts { trigger?: 'manual'|'scheduled' }
 */
export async function runCollection({ trigger = 'manual' } = {}) {
  const cfg = await loadConfig();
  if (!cfg.keywords?.length) {
    throw new Error('키워드가 등록되어 있지 않습니다. 먼저 키워드를 추가하세요.');
  }

  const all    = [];
  const errors = [];
  for (const kw of cfg.keywords) {
    try {
      const items = await fetchRss(kw);
      all.push(...items);
    } catch (e) {
      errors.push({ keyword: kw, error: e.message });
    }
  }

  // 1) 중복 / 광고 / 제외
  let processed = dedupe(all);
  if (cfg.filterAds) processed = applyAdFilter(processed);
  processed = applyExcludes(processed, cfg.excludes);

  // 2) 각 기사에 mediaType + sentiment 부여
  for (const a of processed) {
    a.mediaType = classifyMedia(a.source);
  }
  const sentiment   = analyzeSentiments(processed);   // 내부에서 a.sentiment 부착
  const mediaCounts = countByMediaType(processed);
  const keywordCounts = countByKeyword(processed);

  // 3) 그룹 / 트렌드 / 요약문
  const groups   = groupByTitle(processed);
  const trending = await detectTrending(keywordCounts);
  const summaryText = buildSummaryText({
    articles: processed, keywords: cfg.keywords,
    mediaCounts, sentiment, trending,
  });

  const report = {
    id:          newId(),
    generatedAt: new Date().toISOString(),
    keywords:    cfg.keywords,
    excludes:    cfg.excludes || [],
    reportType:  cfg.reportType || 'daily',
    trigger,
    articles:    processed,
    errors,

    // 분석
    mediaTypes:    MEDIA_TYPES,
    mediaCounts,                           // { 중앙언론: n, ... }
    keywordCounts,                         // { 정책: n, ... }
    sentiment,                             // { positive, negative, neutral, percents, overall }
    trending,                              // [{keyword, prev, curr, ratio}]
    groups,                                // [{signature, leadTitle, leadUrl, sources, count}]
    summaryText,                           // 자동 요약 문장
  };

  await saveReport(report);
  return report;
}
