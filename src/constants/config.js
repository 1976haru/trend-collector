// ─────────────────────────────────────────────
// config.js — 앱 전역 설정 (환경변수 우선)
// ─────────────────────────────────────────────

const env = import.meta.env || {};

export const RSS_PROXY        = env.VITE_RSS_PROXY        || 'https://api.allorigins.win/get?url=';
export const GOOGLE_NEWS_BASE = env.VITE_GOOGLE_NEWS_BASE || 'https://news.google.com/rss/search?hl=ko&gl=KR&ceid=KR:ko&q=';

export const EMAILJS_PUBLIC_KEY  = env.VITE_EMAILJS_PUBLIC_KEY  || '';
export const EMAILJS_SERVICE_ID  = env.VITE_EMAILJS_SERVICE_ID  || '';
export const EMAILJS_TEMPLATE_ID = env.VITE_EMAILJS_TEMPLATE_ID || '';
export const KAKAO_JS_KEY        = env.VITE_KAKAO_JS_KEY        || '';

export const MAX_ARTICLES_PER_KEYWORD = 30;
export const MAX_STORED_ARTICLES      = 500;
export const MAX_HISTORY              = 90;

export const STORAGE_KEYS = {
  SETTINGS:  'tc.settings.v1',
  ARTICLES:  'tc.articles.v1',
  HISTORY:   'tc.history.v1',
  BOOKMARKS: 'tc.bookmarks.v1',
  SCHEDULE:  'tc.schedules.v1',
};

export const SCHEDULE_TYPES = {
  DAILY:    'daily',
  INTERVAL: 'interval',
  WEEKLY:   'weekly',
};

export const REPORT_TYPES = {
  DAILY:  'daily',
  WEEKLY: 'weekly',
};

export const CHANNELS = {
  EMAIL:   'email',
  KAKAO:   'kakao',
  BROWSER: 'browser',
};

// 빠른 추가용 기본 키워드 (공무원·정책·행정 분야 우선)
export const PRESET_KEYWORDS = [
  '정부', '국정', '국무회의', '대통령', '국회',
  '예산', '법안', '정책', '행정', '지자체',
  '복지', '교육', '보건', '환경', '교통',
  '경제', '부동산', '청년', '일자리', '재난',
];

export const DEFAULT_KEYWORDS = ['정책', '지자체', '예산'];

// 광고/홍보성 기사 필터링용 기본 키워드
export const DEFAULT_AD_KEYWORDS = [
  '광고', '협찬', '프로모션', '특가', '할인',
  '쿠폰', '이벤트', '체험단', '리뷰이벤트',
  '[AD]', '[PR]', '<AD>',
];
