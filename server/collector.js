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
function applyPeriodFilter(articles, period) {
  let kept = [], outOfRange = 0, parseFailed = 0;
  for (const a of articles) {
    const t = parsePubDate(a.rawDate);
    if (t === null) { parseFailed++; continue; }
    if (t < period.from || t > period.to) { outOfRange++; continue; }
    kept.push(a);
  }
  return { kept, outOfRange, parseFailed };
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
    const r = await fetchAllSources(kw, cfg);
    all.push(...r.articles);
    errors.push(...r.errors);
  }
  if (all.length === 0 && errors.length === 0) {
    throw new Error('활성화된 뉴스 소스가 없습니다. Google News / Naver News 둘 중 하나는 켜야 합니다.');
  }

  // 0) 수집 기간 필터 (publishedAt 기준)
  const period = resolvePeriod(cfg);
  const filtered = applyPeriodFilter(all, period);
  let processed = filtered.kept;

  // 1) 중복 / 광고 / 제외
  processed = dedupe(processed);
  if (cfg.filterAds) processed = applyAdFilter(processed);
  processed = applyExcludes(processed, cfg.excludes);

  // 1.5) 최대 30건
  if (processed.length > 30) processed = processed.slice(0, 30);

  // 2) 각 기사에 mediaType 부여
  for (const a of processed) {
    a.mediaType = classifyMedia(a.source);
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
      parseFailed: filtered.parseFailed,
    },

    // 분석
    mediaTypes:    MEDIA_TYPES,
    mediaCounts,
    keywordCounts,
    departmentCounts,
    sourceCounts,
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
