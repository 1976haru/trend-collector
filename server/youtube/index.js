// ─────────────────────────────────────────────
// youtube/index.js — YouTube 관심도 / 영상 반응 분석
//
// 두 종류의 데이터 소스를 조합:
//   1) YouTube Data API v3 — 키워드별 영상 검색 + 조회수/댓글/좋아요 (영상 반응)
//   2) Google Trends YouTube Search — 0~100 상대 관심도 (검색 관심도)
//
// 환경변수:
//   YOUTUBE_DATA_ENABLED=false
//   YOUTUBE_API_KEY=                      (Google Cloud Console — YouTube Data API v3)
//   YOUTUBE_TRENDS_ENABLED=false
//   YOUTUBE_TRENDS_PROVIDER=google_trends|manual|disabled
//
// 모든 함수는 미구성 / API 한도 초과 / 네트워크 실패 시 throw 하지 않고
// { error, items: [], ... } 형태로 안전 결과를 반환한다 — 리포트 전체 실패 방지.
// ─────────────────────────────────────────────

const YT_API     = 'https://www.googleapis.com/youtube/v3';
const TIMEOUT_MS = 10_000;

function envBool(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'on', 'enabled'].includes(s);
}

export function isYouTubeDataEnabled() {
  return envBool(process.env.YOUTUBE_DATA_ENABLED) && !!String(process.env.YOUTUBE_API_KEY || '').trim();
}

export function isYouTubeTrendsEnabled() {
  return envBool(process.env.YOUTUBE_TRENDS_ENABLED);
}

export function getYouTubeTrendsProvider() {
  const v = String(process.env.YOUTUBE_TRENDS_PROVIDER || 'manual').trim().toLowerCase();
  return ['google_trends', 'manual', 'disabled'].includes(v) ? v : 'manual';
}

/**
 * 환경변수 진단 — 값 자체는 노출하지 않고 boolean 만. UI 진단 카드용.
 * Client Secret 과 동일한 정책: API_KEY 평문 X, 앞 4자만 마스킹.
 */
export function getYouTubeDiagnostics() {
  const rawKey = String(process.env.YOUTUBE_API_KEY || '').trim();
  return {
    dataApi: {
      enabledFlag:           envBool(process.env.YOUTUBE_DATA_ENABLED),
      hasYOUTUBE_API_KEY:    !!rawKey,
      apiKeyMasked:          rawKey ? (rawKey.slice(0, 4) + '*'.repeat(Math.max(0, rawKey.length - 4))) : '',
      ready:                 isYouTubeDataEnabled(),
    },
    trends: {
      enabled:  isYouTubeTrendsEnabled(),
      provider: getYouTubeTrendsProvider(),
    },
  };
}

// 기간 → publishedAfter ISO 변환
function periodToPublishedAfter(period) {
  const days = ({ '7d': 7, '30d': 30, '90d': 90, '12m': 365 })[period] || 30;
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

// fetch + abort timeout 헬퍼
async function fetchWithTimeout(url, opts = {}, ms = TIMEOUT_MS) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function classifyInterest(totalViews) {
  if (totalViews >= 1_000_000) return '높음';
  if (totalViews >= 100_000)   return '보통';
  if (totalViews >= 10_000)    return '낮음';
  return '미미';
}

function buildInsightText({ keyword, period, videoCount, totalViews, totalComments, interestLevel, prevDelta }) {
  const parts = [];
  const periodLabel = ({ '7d': '최근 7일', '30d': '최근 30일', '90d': '최근 90일', '12m': '최근 12개월' })[period] || period;
  if (videoCount > 0) {
    parts.push(`${periodLabel} '${keyword}' 관련 YouTube 영상은 ${videoCount}건 확인되었으며, 상위 영상 누적 조회수는 ${totalViews.toLocaleString('ko-KR')}회 수준임.`);
    if (totalComments > 0) parts.push(`댓글 반응은 총 ${totalComments.toLocaleString('ko-KR')}건으로 집계됨.`);
    if (prevDelta !== null && prevDelta !== undefined) {
      if (prevDelta > 20)      parts.push(`전주 대비 검색 관심도 상승 (+${prevDelta}).`);
      else if (prevDelta < -20) parts.push(`전주 대비 검색 관심도 하락 (${prevDelta}).`);
    }
    parts.push(`종합 관심도 등급: ${interestLevel}.`);
  } else {
    parts.push(`${periodLabel} '${keyword}' 관련 YouTube 영상이 식별되지 않음.`);
  }
  return parts.join(' ');
}

/**
 * YouTube Data API — 키워드별 영상 검색 + 통계.
 * @returns {Promise<{ items, totalViews, totalComments, totalLikes, error? }>}
 */
async function fetchVideosByKeyword(keyword, { period = '30d', maxResults = 25 } = {}) {
  const apiKey = String(process.env.YOUTUBE_API_KEY || '').trim();
  if (!apiKey) return { items: [], totalViews: 0, totalComments: 0, totalLikes: 0, error: 'YOUTUBE_API_KEY 가 설정되지 않았습니다.' };

  const publishedAfter = periodToPublishedAfter(period);
  // 1) search.list — id 만
  const searchUrl = `${YT_API}/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&order=relevance&publishedAfter=${encodeURIComponent(publishedAfter)}&regionCode=KR&relevanceLanguage=ko&maxResults=${Math.min(maxResults, 50)}&key=${apiKey}`;
  let searchData;
  try {
    const r = await fetchWithTimeout(searchUrl);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { items: [], totalViews: 0, totalComments: 0, totalLikes: 0,
        error: `YouTube search.list HTTP ${r.status}: ${body.slice(0, 160)}` };
    }
    searchData = await r.json();
  } catch (e) {
    return { items: [], totalViews: 0, totalComments: 0, totalLikes: 0, error: `YouTube search 호출 실패: ${e.message || String(e)}` };
  }

  const ids = (searchData.items || []).map(it => it.id?.videoId).filter(Boolean);
  if (!ids.length) return { items: [], totalViews: 0, totalComments: 0, totalLikes: 0 };

  // 2) videos.list — 통계
  const videosUrl = `${YT_API}/videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}&key=${apiKey}`;
  let videosData;
  try {
    const r = await fetchWithTimeout(videosUrl);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      return { items: [], totalViews: 0, totalComments: 0, totalLikes: 0,
        error: `YouTube videos.list HTTP ${r.status}: ${body.slice(0, 160)}` };
    }
    videosData = await r.json();
  } catch (e) {
    return { items: [], totalViews: 0, totalComments: 0, totalLikes: 0, error: `YouTube videos 호출 실패: ${e.message || String(e)}` };
  }

  const items = (videosData.items || []).map(v => {
    const sn = v.snippet || {}; const st = v.statistics || {};
    const dur = v.contentDetails?.duration || ''; // ISO8601 PT#M#S
    const isShort = /^PT(\d+S)?$|^PT([0-5]?\d)S$/.test(dur);  // 거친 추정 — 1분 미만
    return {
      videoId:      v.id,
      title:        sn.title || '',
      channelTitle: sn.channelTitle || '',
      channelId:    sn.channelId || '',
      publishedAt:  sn.publishedAt || '',
      thumbnail:    sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || '',
      url:          v.id ? `https://www.youtube.com/watch?v=${v.id}` : '',
      viewCount:    Number(st.viewCount    || 0),
      commentCount: Number(st.commentCount || 0),
      likeCount:    Number(st.likeCount    || 0),
      duration:     dur,
      shortform:    isShort,
    };
  });
  // 조회수 내림차순
  items.sort((a, b) => b.viewCount - a.viewCount);

  const totalViews    = items.reduce((s, x) => s + x.viewCount, 0);
  const totalComments = items.reduce((s, x) => s + x.commentCount, 0);
  const totalLikes    = items.reduce((s, x) => s + x.likeCount, 0);
  return { items, totalViews, totalComments, totalLikes };
}

/**
 * 메인 — 키워드 한 개의 YouTube 인사이트.
 * 절대 throw 하지 않는다 (운영 안정성). 비활성/실패 시에도 정상 반환.
 *
 * @param {string} keyword
 * @param {Object} opts { period: '7d'|'30d'|'90d'|'12m', maxResults: number }
 */
export async function fetchYouTubeInsights(keyword, opts = {}) {
  const period     = opts.period    || '30d';
  const maxResults = opts.maxResults || 25;
  const result = {
    keyword, period,
    videoCount:    0,
    totalViews:    0,
    totalComments: 0,
    totalLikes:    0,
    topVideos:     [],
    interestLevel: '미미',
    insightText:   '',
    trendsScore:   null,        // Google Trends YouTube Search 0~100 (활성 시)
    prevDelta:     null,
    enabled:       false,
    provider:      'disabled',
    error:         null,
    diagnostics:   getYouTubeDiagnostics(),
  };

  // YouTube Data API
  if (isYouTubeDataEnabled()) {
    const r = await fetchVideosByKeyword(keyword, { period, maxResults });
    if (r.error) {
      result.error = r.error;
    } else {
      result.videoCount    = r.items.length;
      result.totalViews    = r.totalViews;
      result.totalComments = r.totalComments;
      result.totalLikes    = r.totalLikes;
      result.topVideos     = r.items.slice(0, 10);
      result.interestLevel = classifyInterest(r.totalViews);
      result.enabled       = true;
      result.provider      = 'youtube_data_api';
    }
  } else {
    const d = getYouTubeDiagnostics().dataApi;
    if (!d.enabledFlag)            result.error = 'YouTube Data API 가 비활성화되어 있습니다 (YOUTUBE_DATA_ENABLED=false).';
    else if (!d.hasYOUTUBE_API_KEY) result.error = 'YOUTUBE_API_KEY 가 설정되지 않았습니다. Google Cloud Console 에서 발급받은 후 환경변수에 등록하세요.';
  }

  // Google Trends YouTube Search (스텁 — provider 가 google_trends 일 때만)
  if (isYouTubeTrendsEnabled()) {
    const provider = getYouTubeTrendsProvider();
    if (provider === 'manual' || provider === 'disabled') {
      // 향후 정식 API 활성 시 fetch 추가
    }
    // google_trends provider 도 현재는 미구현 — ROADMAP 항목
  }

  result.insightText = buildInsightText({
    keyword, period,
    videoCount:    result.videoCount,
    totalViews:    result.totalViews,
    totalComments: result.totalComments,
    interestLevel: result.interestLevel,
    prevDelta:     result.prevDelta,
  });
  return result;
}

/**
 * 여러 키워드 — 병렬 호출, 한 키워드 실패해도 다른 키워드는 계속.
 */
export async function fetchYouTubeInsightsForKeywords(keywords = [], opts = {}) {
  if (!keywords || !keywords.length) return { items: [], enabled: isYouTubeDataEnabled() || isYouTubeTrendsEnabled(), diagnostics: getYouTubeDiagnostics() };
  // API 한도 보호 — 최대 5 키워드만 병렬, 나머지는 빈 결과로 채움
  const slice = keywords.slice(0, 5);
  const items = await Promise.all(slice.map(k => fetchYouTubeInsights(k, opts).catch(e => ({
    keyword: k, period: opts.period || '30d',
    videoCount: 0, totalViews: 0, totalComments: 0, totalLikes: 0, topVideos: [],
    interestLevel: '미미', insightText: '', enabled: false, provider: 'error',
    error: e.message || String(e),
  }))));
  // 처리 안 된 키워드도 결과에 placeholder 포함
  for (const k of keywords.slice(5)) {
    items.push({
      keyword: k, period: opts.period || '30d',
      videoCount: 0, totalViews: 0, totalComments: 0, totalLikes: 0, topVideos: [],
      interestLevel: '미미', insightText: '', enabled: false, provider: 'skipped',
      error: 'API 한도 보호 — 최대 5 키워드만 호출됩니다.',
    });
  }
  return {
    items,
    enabled: isYouTubeDataEnabled() || isYouTubeTrendsEnabled(),
    diagnostics: getYouTubeDiagnostics(),
  };
}
