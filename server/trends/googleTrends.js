// ─────────────────────────────────────────────
// trends/googleTrends.js — Google Trends 연동 모듈 (스텁)
// 2025년 alpha API 가 공개되었으나 일반 운영 API 가 아직 제한적이므로,
// 이 파일은 provider 선택형 구조만 제공한다. 실 호출은 ROADMAP 단계에서 활성화.
//
// 환경변수:
//   GOOGLE_TRENDS_ENABLED=false
//   GOOGLE_TRENDS_PROVIDER=alpha | pytrends | serpapi | manual
//   GOOGLE_TRENDS_API_KEY=
//
// 모든 함수는 미구현/실패 상황에서도 throw 하지 않고 { error } 또는 빈 배열을 반환한다.
// ─────────────────────────────────────────────

export function isTrendsEnabled() {
  return process.env.GOOGLE_TRENDS_ENABLED === 'true';
}

export function getProvider() {
  return process.env.GOOGLE_TRENDS_PROVIDER || 'manual';
}

/**
 * 지정 키워드의 검색 관심도 시계열을 반환한다.
 * @param {Object} opts { keywords:string[], timeframe:'7d'|'30d'|'90d'|'12m', geo?:'KR'|시도 }
 * @returns {Promise<{ enabled, provider, error?, series? }>}
 */
export async function fetchTrendInterest({ keywords = [], timeframe = '7d', geo = 'KR' } = {}) {
  if (!isTrendsEnabled()) {
    return { enabled: false, provider: getProvider(), error: 'Google Trends 연동이 비활성화되어 있습니다 (GOOGLE_TRENDS_ENABLED=false).', series: [] };
  }
  const provider = getProvider();
  // 향후 provider 분기 — 현재는 모든 provider 가 미구현
  return {
    enabled: true,
    provider,
    error: `${provider} provider 는 아직 구현되어 있지 않습니다. 정식 API 또는 대체 라이브러리 연동은 ROADMAP 참고.`,
    series: [],
    keywords, timeframe, geo,
  };
}

/**
 * 관련 / 급상승 검색어를 반환한다.
 */
export async function fetchRelatedQueries({ keyword = '', timeframe = '7d', geo = 'KR' } = {}) {
  if (!isTrendsEnabled()) {
    return { enabled: false, provider: getProvider(), top: [], rising: [] };
  }
  const provider = getProvider();
  return { enabled: true, provider, top: [], rising: [], keyword, timeframe, geo };
}

/**
 * 보도량과 검색 관심도 비교 인사이트 (Trends 활성 시).
 * 입력: report.keywordCounts (현재 보도량) + 외부 trends.series
 * 출력: 라벨 ('언론 중심 이슈' / '국민 관심 대비 보도 부족' / '대응 우선' / '긴급 모니터링')
 */
export function buildInsight({ keywordCounts = {}, trendSeries = [], sentiment = {} } = {}) {
  // 현재는 trendSeries 가 비어있으므로 항상 'unknown' 반환
  if (!trendSeries.length) return { label: 'unknown', message: 'Google Trends 데이터가 없어 비교 분석을 건너뜁니다.' };
  // ROADMAP — Trends 활성 후 정식 분석
  return { label: 'pending', message: '검색 관심도 비교 분석은 다음 라운드에서 활성화됩니다.' };
}
