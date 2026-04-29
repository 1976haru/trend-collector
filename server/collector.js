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
import { extractMany } from './articleExtractor.js';
import { suggestDepartments, countDepartments } from './departments.js';
import { fetchNaverNews, isNaverConfigured } from './sources/naver.js';
import { fetchTrendInterest, fetchRelatedQueries, isTrendsEnabled } from './trends/googleTrends.js';

const GOOGLE_NEWS = 'https://news.google.com/rss/search?hl=ko&gl=KR&ceid=KR:ko&q=';
const MAX_PER_KEYWORD = 30;

const AD_TERMS = [
  '광고', '협찬', '프로모션', '특가', '할인',
  '쿠폰', '체험단', '리뷰이벤트', '[ad]', '[pr]',
];

function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// 본문 추출 실패 기사를 RSS 메타데이터로 대체 본문 합성
function synthesizeFallback(a) {
  const lines = [];
  if (a.title)   lines.push(`■ 제목: ${a.title}`);
  if (a.source)  lines.push(`■ 매체: ${a.source}${a.date ? `  ·  ${a.date}` : ''}`);
  if (a.summary) lines.push('', '■ RSS 요약', a.summary);
  if (a.url)     lines.push('', '■ 원문 링크', a.url);
  lines.push('', '※ 자동 본문 추출에 실패하여 RSS 메타데이터로 대체된 항목입니다. 원문 페이지 스크린샷이 함께 제공되는 경우 PDF 의 해당 기사 섹션에서 확인할 수 있습니다.');
  return lines.join('\n');
}

async function fetchRss(keyword) {
  const url = GOOGLE_NEWS + encodeURIComponent(keyword);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 trend-collector' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = parseRss(xml, keyword).slice(0, MAX_PER_KEYWORD);
  // 출처 라벨 — 병합 후 분석/통계에서 사용
  for (const it of items) it.sourceProvider = 'google';
  return items;
}

/**
 * 테스트 검색용 — 한 키워드에 대해 raw 결과를 source 별로 따로 반환.
 * 필터/dedup 없이 원본 그대로.
 */
export async function fetchSourceRaw(keyword, { useGoogle = true, useNaver = true } = {}) {
  const out = { google: { articles: [], error: null }, naver: { articles: [], error: null } };
  const tasks = [];
  if (useGoogle) tasks.push(fetchRss(keyword).then(a => out.google.articles = a)
    .catch(e => out.google.error = e.message || String(e)));
  if (useNaver && isNaverConfigured()) {
    tasks.push(fetchNaverNews(keyword, { display: MAX_PER_KEYWORD }).then(a => out.naver.articles = a)
      .catch(e => out.naver.error = e.message || String(e)));
  } else if (useNaver) {
    out.naver.error = 'Naver API 미설정';
  }
  await Promise.all(tasks);
  return out;
}

/**
 * 검색 테스트 시뮬레이션 — 실 수집과 동일한 단계(키워드별 검색 → 기간 → 중복 → AND)를
 * 거치되 본문 추출/감정 분석은 생략한다. 관리자 화면 검색 테스트 패널에서 사용.
 */
export async function simulateSearch({
  keywords = [],
  useGoogle = true,
  useNaver = true,
  requireAll = false,
  period = '7d',
  fromDate = '',
  toDate = '',
} = {}) {
  const kws = (keywords || []).map(k => String(k).trim()).filter(Boolean);
  if (!kws.length) throw new Error('keyword 가 필요합니다.');

  const sourceCountsRaw = { google: 0, naver: 0 };
  const sourceErrors    = { google: null, naver: null };
  const all = [];
  for (const kw of kws) {
    const r = await fetchSourceRaw(kw, { useGoogle, useNaver });
    sourceCountsRaw.google += r.google.articles.length;
    sourceCountsRaw.naver  += r.naver.articles.length;
    if (r.google.error && !sourceErrors.google) sourceErrors.google = r.google.error;
    if (r.naver.error  && !sourceErrors.naver)  sourceErrors.naver  = r.naver.error;
    for (const a of r.google.articles) { a.sourceProvider = 'google'; all.push(a); }
    for (const a of r.naver.articles)  { a.sourceProvider = 'naver';  all.push(a); }
  }

  const periodResolved = resolvePeriod({ collectPeriod: period, collectFromDate: fromDate, collectToDate: toDate });
  const filtered  = applyPeriodFilter(all, periodResolved);
  let processed   = filtered.kept;
  const afterDate = processed.length;
  processed       = dedupe(processed);
  const afterDedupe = processed.length;

  let keywordsForAllMatch = kws.slice();
  let afterAllKw = processed.length;
  let allFilteredOut = 0;
  if (requireAll && kws.length > 1) {
    keywordsForAllMatch = collapseContainedKeywords(kws);
    const before = processed.length;
    processed    = applyRequireAllKeywords(processed, keywordsForAllMatch);
    afterAllKw   = processed.length;
    allFilteredOut = before - afterAllKw;
  }

  return {
    keywords:               kws,
    keywordsForAllMatch,
    requireAll:             !!requireAll && kws.length > 1,
    sourceCountsRaw,
    sourceErrors,
    afterDateFilter:        afterDate,
    afterDedupe,
    afterAllKeywordFilter:  afterAllKw,
    allKeywordFilteredOut:  allFilteredOut,
    period: { label: periodResolved.label, from: new Date(periodResolved.from).toISOString(), to: new Date(periodResolved.to).toISOString() },
    sample: processed.slice(0, 10).map(a => ({
      title: a.title, source: a.source, date: a.date, rawDate: a.rawDate, url: a.url,
      keyword: a.keyword, sourceProvider: a.sourceProvider,
    })),
  };
}

/**
 * 단일 키워드에 대해 활성화된 모든 소스를 병렬 호출.
 * 한 소스가 실패해도 다른 소스는 계속 진행한다.
 * @param {string} keyword
 * @param {Object} cfg loadConfig() 결과
 * @returns {Promise<{articles:Array, errors:Array<{keyword,source,error}>}>}
 */
async function fetchAllSources(keyword, cfg) {
  const tasks = [];
  if (cfg.useGoogleNews !== false) {
    tasks.push({ name: 'google', p: fetchRss(keyword) });
  }
  if (cfg.useNaverNews && isNaverConfigured()) {
    tasks.push({ name: 'naver', p: fetchNaverNews(keyword, { display: MAX_PER_KEYWORD }) });
  }
  if (!tasks.length) return { articles: [], errors: [] };

  const results = await Promise.allSettled(tasks.map(t => t.p));
  const articles = [];
  const errors   = [];
  results.forEach((r, i) => {
    const t = tasks[i];
    if (r.status === 'fulfilled') {
      articles.push(...(r.value || []));
    } else {
      const msg = r.reason?.message || String(r.reason);
      errors.push({ keyword, source: t.name, error: msg });
    }
  });
  return { articles, errors };
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
  // 1) entity 먼저 decode → 2) raw 태그 strip → 3) 다시 한 번 (이중 인코딩 방어)
  let v = String(s)
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  v = v.replace(/<[^>]*>/g, '');
  v = v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return v.replace(/<[^>]*>/g, '').trim();
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

// 수집 기간 계산
function resolvePeriod(cfg) {
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  if (cfg.collectPeriod === 'custom' && cfg.collectFromDate) {
    const fromTs = new Date(cfg.collectFromDate + 'T00:00:00').getTime();
    const toTs   = cfg.collectToDate
      ? new Date(cfg.collectToDate + 'T23:59:59').getTime()
      : now;
    return { from: fromTs, to: toTs, label: 'custom' };
  }
  const map = { '24h': 1, '3d': 3, '7d': 7, '14d': 14, '30d': 30 };
  const days = map[cfg.collectPeriod] ?? 7;
  return { from: now - days * day, to: now, label: cfg.collectPeriod || '7d' };
}

// pubDate 파싱 시도 (기사의 rawDate)
function parsePubDate(raw) {
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

// 기간 필터 (수집 후 적용)
// 변경: 날짜 파싱 실패 기사는 즉시 제외하지 않고 dateUnknown 으로 표시 후 보존.
// 기간 외 기사만 실제로 제외.
function applyPeriodFilter(articles, period) {
  let kept = [], outOfRange = 0, parseFailed = 0;
  for (const a of articles) {
    const t = parsePubDate(a.rawDate);
    if (t === null) {
      a.dateUnknown = true;
      kept.push(a);                  // 보존 (기본 포함)
      parseFailed++;
      continue;
    }
    if (t < period.from || t > period.to) { outOfRange++; continue; }
    kept.push(a);
  }
  return { kept, outOfRange, parseFailed };
}

// 정규화: 공백·특수문자·HTML 제거 + 소문자
// 한국어는 stem 이 어렵기 때문에 “정규화 후 substring” 방식으로 형태소 차이를 흡수.
export function normalizeKeyword(s = '') {
  return String(s)
    .replace(/<[^>]*>/g, ' ')          // HTML 태그
    .replace(/&[a-z#0-9]+;/gi, ' ')    // HTML 엔티티
    .toLowerCase()
    .replace(/[\s ​]+/g, '') // 모든 공백 제거
    .replace(/[“”"'‘’`,.\-_()\[\]{}<>!?·…/\\|:;~+*%&^$#@=]/g, ''); // 흔한 특수문자
}

/**
 * 포함 관계 키워드 축약:
 *   ["보호관찰", "보호관찰소"] → ["보호관찰소"]
 *   ["보호관찰", "출입국"]   → ["보호관찰", "출입국"]
 * 더 긴 키워드(상위 키워드)에 정규화된 짧은 키워드가 substring 으로 포함되면
 * 짧은 키워드는 제거 — 더 긴 쪽이 매칭되면 짧은 쪽도 자동 만족이기 때문.
 */
export function collapseContainedKeywords(keywords = []) {
  const norm = keywords.map(k => ({ raw: k, n: normalizeKeyword(k) })).filter(x => x.n);
  if (norm.length < 2) return keywords.slice();
  // 긴 것부터 정렬 — 짧은 키워드가 긴 것에 포함되는지 검사
  norm.sort((a, b) => b.n.length - a.n.length);
  const kept = [];
  for (const cand of norm) {
    const isContained = kept.some(k => k.n !== cand.n && k.n.includes(cand.n));
    if (!isContained) kept.push(cand);
  }
  // 원본 순서 유지하며 결과 재구성
  const keptSet = new Set(kept.map(k => k.raw));
  return keywords.filter(k => keptSet.has(k));
}

// 모든 키워드를 포함하는 기사만 (requireAllInclude=true 일 때만 적용)
// title + summary + contentText + source 를 합쳐 정규화된 substring 매칭.
// ※ a.keyword 는 “검색에 사용된 키워드”(search query) 이므로 haystack 에 포함시키면
//    AND 필터가 자명하게 통과하여 무의미해진다 — 일부러 제외한다.
// collapsed 결과가 1개여도 그대로 적용 — 그 단일 키워드를 반드시 포함해야 함.
function applyRequireAllKeywords(articles, keywords = []) {
  const normKws = (keywords || []).map(normalizeKeyword).filter(Boolean);
  if (!normKws.length) return articles;
  return articles.filter(a => {
    const hayRaw = [
      a.title || '',
      a.summary || '',
      a.contentText || '',
      a.source || '',
    ].join(' ');
    const hay = normalizeKeyword(hayRaw);
    return normKws.every(k => hay.includes(k));
  });
}

// 키워드/소스별 카운트 헬퍼
function countByKeySrc(articles) {
  const m = {};
  for (const a of articles) {
    const k = `${a.keyword}//${a.sourceProvider || 'unknown'}`;
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

// 보고용 한 줄 요약 — 매체·감정·부서를 합쳐 1문장.
function buildBriefLine(a) {
  const sLbl  = a.sentiment?.label || '중립';
  const issue = a.sentiment?.issueType ? ` (${a.sentiment.issueType})` : '';
  const dept  = a.departments?.[0]?.name || '';
  const need  = a.priority === '긴급'
    ? '대응 즉시 검토 필요'
    : a.priority === '주의'
    ? '대응 검토 권장'
    : '참고';

  // title 의 첫 절 사용 (괄호 등 제거)
  const titleClean = String(a.title || '').replace(/\s*[\[(].*?[\])]\s*/g, ' ').replace(/\s+-\s+[^-]+$/, '').trim();
  const head = titleClean.length > 50 ? titleClean.slice(0, 48) + '…' : titleClean;

  return `${head} — [${a.source || '미상'}] ${sLbl}${issue}${dept ? `, ${dept}` : ''} · ${need}`;
}

// 기사 발행 주체 — 기관 배포(agency) vs 일반 언론(press)
// 기준: mediaType==='정부/공공기관' OR url 도메인 .go.kr/.korea.kr/.or.kr OR 제목/요약에 '보도자료'.
function classifyArticleSource(a = {}) {
  if (a.mediaType === '정부/공공기관') return 'agency';
  let host = '';
  try { host = new URL(a.url || '').hostname.toLowerCase().replace(/^www\./, ''); } catch {}
  if (host.endsWith('.go.kr') || host === 'korea.kr' || host.endsWith('.korea.kr')) return 'agency';
  const hay = `${a.title || ''} ${a.summary || ''}`;
  if (/\b보도자료\b|press release/i.test(hay)) return 'agency';
  return 'press';
}

// 기관별 카운트 — agency 로 분류된 기사를 source(매체명) 기준으로 집계
function countAgencies(articles = []) {
  const out = {};
  for (const a of articles) {
    if (a.articleSource !== 'agency') continue;
    const k = a.source || '미상';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

// 우선순위 계산 — 부서 / 매체 / 감정 / 부정 키워드로 라벨링
function computePriority(article) {
  const sent = article.sentiment?.label;
  const isCentral = article.mediaType === '중앙언론' || article.mediaType === '방송사';
  const isGov     = article.mediaType === '정부/공공기관';
  const negCount  = article.sentiment?.matchedKeywords?.negative?.length || 0;

  // 긴급: 중앙·방송 + 부정 키워드 다수
  if ((isCentral && sent === '부정' && negCount >= 2) || negCount >= 4) return '긴급';
  // 주의: 부정 또는 중앙·방송 보도
  if (sent === '부정' || isCentral || isGov) return '주의';
  return '참고';
}

function normalize(s = '') {
  return s.toLowerCase().replace(/\s+/g, ' ')
    .replace(/[“”"'‘’`,.\-()\[\]{}<>!?·…]/g, '').trim();
}

// URL 기준 중복 제거 (제목 기준은 너무 공격적이라 제외)
// + 같은 source 내에서만 정규화된 제목으로 중복 제거 (한 소스가 동일 기사를 여러 키워드로 반환하는 경우)
function dedupe(articles) {
  const urls = new Map();              // url → article
  const titlesBySrc = new Map();       // `${title}__${source}` → article
  const out = [];
  for (const a of articles) {
    const u  = (a.url || '').trim();
    const t  = normalize(a.title || '');
    const sp = a.sourceProvider || 'unknown';
    if (u && urls.has(u)) {
      // 같은 URL — flags 만 병합
      const existing = urls.get(u);
      existing.sourceFlags = { ...(existing.sourceFlags || {}), [existing.sourceProvider]: true, [sp]: true };
      continue;
    }
    if (t && sp) {
      const k = `${t}__${sp}`;
      if (titlesBySrc.has(k)) continue;       // 같은 소스에서만 제목 기반 dedup
      titlesBySrc.set(k, a);
    }
    a.sourceFlags = { [sp]: true };
    if (u) urls.set(u, a);
    out.push(a);
  }
  return out;
}

// 병합 후 동일/유사 제목이 여러 소스에 있는 경우 sourceFlags 추가 표시 (정보용, 제거 X)
function markCrossSourceFlags(articles) {
  const byTitle = new Map();           // normalized title → article[]
  for (const a of articles) {
    const t = normalize(a.title || '');
    if (!t) continue;
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(a);
  }
  for (const arts of byTitle.values()) {
    if (arts.length < 2) continue;
    const flags = {};
    for (const a of arts) {
      const sp = a.sourceProvider || 'unknown';
      flags[sp] = true;
      Object.assign(flags, a.sourceFlags || {});
    }
    for (const a of arts) a.sourceFlags = flags;
  }
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
  // 키워드별 raw 진단
  const rawByKeySrc = {};        // { '보호관찰//google': 25, '보호관찰//naver': 100 }
  const errByKeySrc = {};        // { '보호관찰//naver': 'HTTP 500' }
  for (const kw of cfg.keywords) {
    const r = await fetchAllSources(kw, cfg);
    for (const a of (r.articles || [])) {
      const k = `${kw}//${a.sourceProvider || 'unknown'}`;
      rawByKeySrc[k] = (rawByKeySrc[k] || 0) + 1;
    }
    for (const e of (r.errors || [])) {
      errByKeySrc[`${kw}//${e.source}`] = e.error;
    }
    all.push(...r.articles);
    errors.push(...r.errors);
  }
  if (all.length === 0 && errors.length === 0) {
    throw new Error('활성화된 뉴스 소스가 없습니다. Google News / Naver News 둘 중 하나는 켜야 합니다.');
  }

  // 단계별 카운트를 위한 스냅샷
  const cRaw   = { ...rawByKeySrc };
  // 1) 기간 필터 — dateUnknown 은 보존
  const period = resolvePeriod(cfg);
  const filtered = applyPeriodFilter(all, period);
  let processed  = filtered.kept;
  const cAfterDate = countByKeySrc(processed);

  // 2) 중복 제거 (URL 기준 + 같은 소스 내 제목 정규화)
  processed = dedupe(processed);
  markCrossSourceFlags(processed);
  const cAfterDedupe = countByKeySrc(processed);

  // 3) 광고 / 제외 키워드
  if (cfg.filterAds) processed = applyAdFilter(processed);
  processed = applyExcludes(processed, cfg.excludes);
  const cAfterExclude = countByKeySrc(processed);

  // 4) 사용자가 명시적으로 켰을 때만 모든 키워드 포함 필터
  //    포함 관계 키워드를 collapse 한 뒤 정규화 substring 으로 검사.
  const beforeAllKw = processed.length;
  let keywordsForAllMatch = cfg.keywords.slice();
  if (cfg.requireAllInclude === true && cfg.keywords?.length > 1) {
    keywordsForAllMatch = collapseContainedKeywords(cfg.keywords);
    processed = applyRequireAllKeywords(processed, keywordsForAllMatch);
  }
  const afterAllKw = processed.length;

  // 5) 최대 30건
  if (processed.length > 30) processed = processed.slice(0, 30);
  const cFinal = countByKeySrc(processed);

  // 진단 데이터 빌드 — 키워드 × 소스 매트릭스
  const collectionDiagnostics = [];
  const sources = ['google', 'naver'];
  for (const kw of cfg.keywords) {
    for (const sp of sources) {
      const k = `${kw}//${sp}`;
      const raw = rawByKeySrc[k] || 0;
      const err = errByKeySrc[k] || null;
      if (raw === 0 && !err) continue;        // 활성 안 된 소스 제외
      const dateK   = cAfterDate[k]    || 0;
      const dedupeK = cAfterDedupe[k]  || 0;
      const excK    = cAfterExclude[k] || 0;
      const finalK  = cFinal[k]        || 0;
      collectionDiagnostics.push({
        keyword: kw, source: sp, raw,
        afterDate:    dateK,    dateOut:    raw - dateK,
        afterDedupe:  dedupeK,  dedupeOut:  dateK - dedupeK,
        afterExclude: excK,     excludeOut: dedupeK - excK,
        final:        finalK,
        error:        err,
      });
    }
  }
  // dateUnknown 카운트
  const dateUnknownCount = processed.filter(a => a.dateUnknown).length;

  // 단계별 진단 — debugInfo (검색 키워드 처리 / 단계별 수치)
  const sourceCountsRaw = Object.entries(rawByKeySrc).reduce((m, [k, v]) => {
    const sp = k.split('//')[1] || 'unknown';
    m[sp] = (m[sp] || 0) + v;
    return m;
  }, {});
  const totalRaw = Object.values(sourceCountsRaw).reduce((s, v) => s + v, 0);
  const afterDateFilterCount   = filtered.kept.length;
  const afterDedupeCount       = (function () {
    // 중복 제거 직후 시점은 이미 processed 변수가 진행됐기 때문에
    // cAfterDedupe 합으로 계산
    return Object.values(cAfterDedupe).reduce((s, v) => s + v, 0);
  })();
  const debugInfo = {
    keywordsOriginal:    cfg.keywords.slice(),
    keywordsNormalized:  cfg.keywords.map(normalizeKeyword),
    keywordsForAllMatch,
    requireAllKeywords:  cfg.requireAllInclude === true && cfg.keywords?.length > 1,
    sourceCountsRaw,
    totalRaw,
    afterDateFilter:        afterDateFilterCount,
    afterDedupe:            afterDedupeCount,
    afterAllKeywordFilter:  afterAllKw,
    allKeywordFilteredOut:  Math.max(0, beforeAllKw - afterAllKw),
    period: { label: period.label, from: new Date(period.from).toISOString(), to: new Date(period.to).toISOString() },
  };
  console.log('[collector] debugInfo', JSON.stringify(debugInfo));

  // 2) 각 기사에 mediaType + 기관/언론 구분 부여
  for (const a of processed) {
    a.mediaType   = classifyMedia(a.source);
    a.articleSource = classifyArticleSource(a);   // 'agency' | 'press'
  }

  // 3) 본문 추출 (병렬 5)  — 공공기관 내부 업무용으로만 사용.
  if (cfg.extractContent !== false) {
    processed = await extractMany(processed, { limit: 5 });
    // 실패 기사 → RSS 메타데이터로 대체 본문 + (스크린샷 있으면 보존)
    for (const a of processed) {
      if (!a.extracted) {
        a.synthesizedFallback = synthesizeFallback(a);
        a.extractionQuality = a.fallbackScreenshot ? 'fallback' : 'failed';
      }
    }
  }

  // 4) 감정 분석 — 본문이 추출된 기사는 본문도 분석에 사용
  for (const a of processed) {
    if (a.contentText && !a.sentimentSource) {
      // sentiment.js 의 scoreSentiment 가 title/summary 만 사용하므로
      // contentText 일부를 summary 에 합쳐 정확도 향상
      a._enrichedSummary = `${a.summary || ''} ${a.contentText.slice(0, 600)}`;
    }
  }
  // 임시 필드를 sentiment 분석 입력으로 활용
  const sentInput = processed.map(a => ({ ...a, summary: a._enrichedSummary || a.summary }));
  const sentiment = analyzeSentiments(sentInput);
  // 결과 라벨을 원본 객체에 복사
  sentInput.forEach((a, i) => { processed[i].sentiment = a.sentiment; });
  // 임시 필드 제거
  for (const a of processed) delete a._enrichedSummary;

  const mediaCounts   = countByMediaType(processed);
  const keywordCounts = countByKeyword(processed);

  // 5) 그룹 / 트렌드 / 요약문
  const groups   = groupByTitle(processed);
  const trending = await detectTrending(keywordCounts);
  const summaryText = buildSummaryText({
    articles: processed, keywords: cfg.keywords,
    mediaCounts, sentiment, trending,
  });

  // 6) 위험 등급 — 부정 비율과 급상승 유무로 결정
  const riskLevel = computeRiskLevel(sentiment, trending);

  // 7) 부서 추천 + 우선순위 + 보고용 한 줄 (각 기사)
  for (const a of processed) {
    a.departments = suggestDepartments(a);
    a.priority    = computePriority(a);
    a.briefLine   = buildBriefLine(a);
  }

  // 7.3) 소스별 통계 (병합 후 dedupe·필터 통과 기준)
  const sourceCounts = processed.reduce((m, a) => {
    const k = a.sourceProvider || 'unknown';
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});

  // 7.4) 기관 배포 vs 언론 보도 — 홍보 실적 집계
  const agencyArticles = processed.filter(a => a.articleSource === 'agency');
  const pressArticles  = processed.filter(a => a.articleSource !== 'agency');
  const agencyStats = {
    agency: agencyArticles.length,
    press:  pressArticles.length,
    byAgency: countAgencies(processed),
  };

  // 7.4.1) 홍보 효과 지표 (publicityStats)
  // 외부 조회수는 확보 어려우므로 대체 지표:
  //   - 언론 재인용 수: groups.count - 1 (그룹의 다른 보도)
  //   - 매체 다양성: group.sources.length
  //   - 중앙언론 보도 여부: 그룹의 sources 에 중앙/방송 매체 포함
  //   - 중요도 점수: 매체 수 × 1 + 부정 키워드 × -1.5 + 중앙 × 3 + 긍정 × 1
  const groupBySig = new Map(groups.map(g => [g.signature, g]));
  for (const a of processed) {
    const sig = normalize(a.title || '').slice(0, 12) || normalize(a.title || '');
    const g   = groupBySig.get(sig);
    a.reCiteCount  = g ? Math.max(0, (g.count || 1) - 1) : 0;
    a.mediaSpread  = g ? (g.sources || []).length : (a.source ? 1 : 0);
    const sources  = g ? (g.sources || []) : [a.source];
    a.centralCoverage = sources.some(src => {
      const t = classifyMedia(src);
      return t === '중앙언론' || t === '방송사';
    });
    const negCount = a.sentiment?.matchedKeywords?.negative?.length || 0;
    const posCount = a.sentiment?.matchedKeywords?.positive?.length || 0;
    const score    = a.mediaSpread * 1 + (a.centralCoverage ? 3 : 0) + posCount * 1 - negCount * 1.5;
    a.importanceScore = Number(score.toFixed(2));
    // 평가 등급 (관심 높음/확산 양호/일반/대응 필요)
    let rating;
    if (negCount >= 3 && (a.centralCoverage || a.reCiteCount >= 3)) rating = '대응 필요';
    else if (a.centralCoverage && a.reCiteCount >= 4)               rating = '관심 높음';
    else if (a.reCiteCount >= 5)                                     rating = '확산 양호';
    else if (a.centralCoverage)                                      rating = '파급 가능';
    else                                                              rating = '일반';
    a.publicityRating = rating;
  }
  const publicityStats = {
    agencyDistributed: agencyArticles.length,
    totalReCites:      agencyArticles.reduce((s, a) => s + (a.reCiteCount || 0), 0),
    centralCoverage:   agencyArticles.filter(a => a.centralCoverage).length,
    averageImportance: agencyArticles.length
      ? Number((agencyArticles.reduce((s, a) => s + (a.importanceScore || 0), 0) / agencyArticles.length).toFixed(2))
      : 0,
    topAgencyItems: agencyArticles
      .slice()
      .sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0))
      .slice(0, 10)
      .map(a => ({
        id: a.id, title: a.title, source: a.source, agency: a.source,
        reCiteCount: a.reCiteCount, mediaSpread: a.mediaSpread,
        centralCoverage: a.centralCoverage, sentiment: a.sentiment?.label,
        rating: a.publicityRating, score: a.importanceScore,
      })),
  };

  // 7.5) 본문 추출 통계
  const extractedCount = processed.filter(a => a.extracted).length;
  const extractionFailed = processed
    .filter(a => !a.extracted)
    .map(a => ({ id: a.id, title: a.title, url: a.url, error: a.extractionError, source: a.source }));

  // 7.6) 본문/이미지 품질 통계
  const qualityCounts = processed.reduce((m, a) => {
    const q = a.extractionQuality || (a.extracted ? 'success' : 'failed');
    m[q] = (m[q] || 0) + 1;
    return m;
  }, { success: 0, partial: 0, fallback: 0, failed: 0 });
  const imageCount = processed.filter(a => (a.images?.length || 0) > 0).length;
  const extractionStats = {
    total:      processed.length,
    extracted:  extractedCount,
    failed:     processed.length - extractedCount,
    quality:    qualityCounts,
    withImage:  imageCount,
    withoutImage: processed.length - imageCount,
  };

  // 7.7) 부서별 집계 + TOP 부정 / 긍정 / 중립 이슈
  const departmentCounts = countDepartments(processed);
  const sortByPriority = (arr) => arr.sort((a, b) => {
    const order = { 긴급: 0, 주의: 1, 참고: 2 };
    return (order[a.priority] || 3) - (order[b.priority] || 3);
  });
  const negativeIssues = sortByPriority(processed.filter(a => a.sentiment?.label === '부정')).slice(0, 5);
  const positiveIssues = processed.filter(a => a.sentiment?.label === '긍정').slice(0, 5);
  const neutralIssues  = processed.filter(a => a.sentiment?.label === '중립').slice(0, 5);
  const actionRequired = processed.filter(a => a.priority === '긴급' || a.priority === '주의');

  // 자동 보고서 제목
  const today = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' });
  const reportTitle = `${today} 법무부 언론보도 모니터링 일일보고`;

  // 보고서 문장 (총평 / 주요 동향 / 대응)
  const briefingText = buildBriefing({
    articles: processed, keywords: cfg.keywords,
    sentiment, mediaCounts, departmentCounts, trending, actionRequired,
  });

  // Google Trends — 활성 시에만 호출, 실패해도 보고서는 정상 생성
  let trendsInsight = null;
  if (isTrendsEnabled() && cfg.googleTrendsEnabled !== false) {
    try {
      const interest = await fetchTrendInterest({
        keywords: cfg.keywords.slice(0, 5),
        timeframe: cfg.trendsTimeframe || '7d',
        geo: cfg.trendsGeo || 'KR',
      });
      const related = cfg.keywords[0]
        ? await fetchRelatedQueries({ keyword: cfg.keywords[0], timeframe: cfg.trendsTimeframe || '7d', geo: cfg.trendsGeo || 'KR' })
        : null;
      trendsInsight = { interest, related };
    } catch (e) {
      trendsInsight = { error: e.message || String(e) };
    }
  }

  const report = {
    id:          newId(),
    title:       reportTitle,
    generatedAt: new Date().toISOString(),
    keywords:    cfg.keywords,
    excludes:    cfg.excludes || [],
    reportType:  cfg.reportType || 'daily',
    trigger,
    articles:    processed,
    errors,

    // 수집 기간
    period: {
      label:      period.label,
      from:       new Date(period.from).toISOString(),
      to:         new Date(period.to).toISOString(),
      outOfRange: filtered.outOfRange,
      parseFailed: filtered.parseFailed,        // 이제는 '제외' 가 아니라 '날짜 미확인 보존' 카운트
    },

    // 단계별 수집 진단 (키워드 × 소스)
    collectionDiagnostics,
    dateUnknownCount,
    debugInfo,

    // 분석
    mediaTypes:    MEDIA_TYPES,
    mediaCounts,
    keywordCounts,
    departmentCounts,
    sourceCounts,
    agencyStats,
    publicityStats,
    sentiment,
    trending,
    groups,
    summaryText,
    briefingText,
    trendsInsight,                         // Google Trends 결과 (비활성 시 null)
    riskLevel,
    extractedCount,
    extractionFailed,
    extractionStats,                       // 추출 품질/이미지 통계
    includeImages: cfg.includeImages !== false,

    // 분류된 이슈
    negativeIssues, positiveIssues, neutralIssues, actionRequired,
  };

  await saveReport(report);
  return report;
}

/**
 * 기존 리포트의 본문/이미지를 다시 추출한다.
 * @param {string} id  리포트 ID
 * @param {Object} opts { failedOnly?: boolean, articleId?: string }
 */
export async function reextractReport(id, opts = {}) {
  const report = await loadReport(id);
  const articles = report.articles || [];
  const cfg = await loadConfig();

  let targets;
  if (opts.articleId) {
    targets = articles.filter(a => a.id === opts.articleId);
  } else if (opts.failedOnly) {
    targets = articles.filter(a => !a.extracted);
  } else {
    targets = articles.slice();
  }
  if (!targets.length) return { report, reextracted: 0 };

  const refreshed = await extractMany(targets, { limit: 5 });

  // 원본 articles 와 머지 (id 기준)
  const map = new Map(articles.map(a => [a.id, a]));
  for (const r of refreshed) {
    const prev = map.get(r.id) || {};
    map.set(r.id, { ...prev, ...r });
  }
  report.articles = Array.from(map.values());

  // 통계 갱신
  const extractedCount = report.articles.filter(a => a.extracted).length;
  const failed = report.articles
    .filter(a => !a.extracted)
    .map(a => ({ id: a.id, title: a.title, url: a.url, error: a.extractionError, source: a.source }));
  const qualityCounts = report.articles.reduce((m, a) => {
    const q = a.extractionQuality || (a.extracted ? 'success' : 'failed');
    m[q] = (m[q] || 0) + 1;
    return m;
  }, { success: 0, partial: 0, fallback: 0, failed: 0 });
  const imageCount = report.articles.filter(a => (a.images?.length || 0) > 0).length;

  report.extractedCount   = extractedCount;
  report.extractionFailed = failed;
  report.extractionStats  = {
    total: report.articles.length,
    extracted: extractedCount,
    failed: report.articles.length - extractedCount,
    quality: qualityCounts,
    withImage: imageCount,
    withoutImage: report.articles.length - imageCount,
  };
  report.lastReextractAt = new Date().toISOString();

  await saveReport(report);
  return { report, reextracted: targets.length };
}

// ── 법무부 업무용 보고서 문장 (총평 / 주요 동향 / 대응) ─────
function buildBriefing({ articles, keywords, sentiment, mediaCounts, departmentCounts, trending, actionRequired }) {
  const total = articles.length;
  if (!total) return { 총평: '오늘은 수집된 보도가 없습니다.', 주요보도동향: '', 대응필요이슈: '', 관련부서참고사항: '' };

  const topKw     = topN(countByKeyword(articles), 3);
  const topDept   = topN(departmentCounts, 3);
  const topMedia  = topN(mediaCounts, 3).filter(([k]) => k !== '기타');
  const topIssues = topN(articles.reduce((m, a) => {
    const t = a.sentiment?.issueType;
    if (t) m[t] = (m[t] || 0) + 1;
    return m;
  }, {}), 3);

  const 총평 = `금일 ${keywords.join('·')} 관련 언론보도는 총 ${total}건으로 확인되었습니다. ` +
    `긍정 ${sentiment.positive}건(${sentiment.positivePct}%) / 부정 ${sentiment.negative}건(${sentiment.negativePct}%) / 중립 ${sentiment.neutral}건(${sentiment.neutralPct}%) 으로 집계되었으며, 전반 분위기는 ${sentiment.overall} 입니다.`;

  const issuesPart = topIssues.length
    ? `주요 보도 분야는 ${topIssues.map(([k, v]) => `${k}(${v}건)`).join(', ')} 사안입니다.`
    : '특별한 분야 집중도는 관측되지 않았습니다.';
  const mediaPart = topMedia.length
    ? `주된 보도 매체는 ${topMedia.map(([k, v]) => `${k}(${v})`).join(', ')} 입니다.`
    : '';
  const trendPart = trending.length
    ? `급상승 키워드: ${trending.slice(0, 3).map(t => `${t.keyword}(${t.prev}→${t.curr})`).join(', ')}.`
    : '';
  const 주요보도동향 = [issuesPart, mediaPart, trendPart].filter(Boolean).join(' ');

  let 대응필요이슈 = '';
  if (actionRequired.length === 0) {
    대응필요이슈 = '대응이 필요한 이슈는 식별되지 않았습니다. 일상 모니터링으로 충분합니다.';
  } else {
    const urgent = actionRequired.filter(a => a.priority === '긴급').length;
    const watch  = actionRequired.filter(a => a.priority === '주의').length;
    const negKw = [...new Set(actionRequired.flatMap(a => a.sentiment?.matchedKeywords?.negative || []))].slice(0, 6);
    대응필요이슈 = `대응 필요 이슈 ${actionRequired.length}건이 식별되었습니다 (긴급 ${urgent}건 / 주의 ${watch}건). ` +
      (negKw.length ? `반복 확인된 부정 키워드: ${negKw.join(', ')}. 관계 부서의 모니터링이 필요합니다.` : '');
  }

  const 관련부서참고사항 = topDept.length
    ? `관련 부서별 보도량: ${topDept.map(([k, v]) => `${k} ${v}건`).join(', ')}.`
    : '부서 추천 결과 없음.';

  return { 총평, 주요보도동향, 대응필요이슈, 관련부서참고사항 };
}

// ── 위험 등급 산출 ──────────────────────────────
function computeRiskLevel(sentiment = {}, trending = []) {
  const reasons = [];
  let level = '안정';

  const negPct = sentiment.negativePct || 0;
  if (negPct >= 50)      { level = '긴급'; reasons.push(`부정 비율 ${negPct}% (50% 이상)`); }
  else if (negPct >= 30) { level = '주의'; reasons.push(`부정 비율 ${negPct}% (30% 이상)`); }

  if (trending.length >= 3) {
    if (level === '안정') level = '주의';
    reasons.push(`급상승 키워드 ${trending.length}개`);
  } else if (trending.length >= 1 && level === '안정') {
    reasons.push(`급상승 키워드 ${trending.length}개`);
  }

  return { level, reasons };
}
