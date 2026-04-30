// ─────────────────────────────────────────────
// sources/naver.js — 네이버 뉴스 검색 API
// https://developers.naver.com/docs/serviceapi/search/news/news.md
//
// 설정 우선순위 (재배포 후에도 키가 유지되도록 env 를 1순위로):
//   1) 환경변수            NAVER_CLIENT_ID + NAVER_CLIENT_SECRET (NAVER_ENABLED 기본 true)
//   2) 관리자 화면 저장값  data/sourceSettings.json (naverEnabled + clientId + clientSecret)
//
// ⚠️ Render Free 진단성 정책:
//   - 어떤 호출자도 process.env.NAVER_* 를 직접 읽지 않는다 — 항상 getNaverConfig() 사용.
//   - NAVER_ENABLED 는 대소문자/공백 모두 정규화 (true/TRUE/True/1/yes/y/on).
//   - getNaverEnvDiagnostics() 는 boolean + 마스킹 ID 만 노출 — secret 값 절대 X.
// ─────────────────────────────────────────────

import { loadSourceSettings } from '../store.js';

const NAVER_API     = 'https://openapi.naver.com/v1/search/news.json';
const TIMEOUT_MS    = 10_000;

let cachedCreds  = null;          // null = 미설정, 객체 = 활성 자격증명
let cachedSource = 'none';
let _loaded      = false;

// 환경변수 boolean 정규화 — Render UI 에서 어떤 케이스로 입력해도 인식.
// 미지정 (undefined) 은 true 로 간주 — 사용자가 키만 등록한 일반 케이스를 허용.
function normalizeEnabledFlag(raw) {
  if (raw === undefined || raw === null) return true;          // 미지정 = 기본 ON
  const s = String(raw).trim().toLowerCase();
  if (s === '') return true;                                   // 공백만 = 기본 ON
  if (['false', '0', 'no', 'n', 'off', 'disabled'].includes(s)) return false;
  if (['true',  '1', 'yes', 'y', 'on', 'enabled'].includes(s)) return true;
  // 그 외 알 수 없는 값은 안전하게 false (의도적 비활성으로 해석)
  return false;
}

// 환경변수 진단 — boolean + 마스킹 ID 만 노출. Secret 값은 절대 노출하지 않는다.
export function getNaverEnvDiagnostics() {
  const rawEnabled = process.env.NAVER_ENABLED;
  const rawId      = process.env.NAVER_CLIENT_ID;
  const rawSecret  = process.env.NAVER_CLIENT_SECRET;
  const idTrim     = String(rawId || '').trim();
  const secretTrim = String(rawSecret || '').trim();
  const enabledNorm = normalizeEnabledFlag(rawEnabled);
  return {
    hasNAVER_ENABLED:        rawEnabled !== undefined,
    naverEnabledRaw:         rawEnabled === undefined ? null : '(설정됨, 값은 비공개)',  // 값 자체는 노출 X
    naverEnabledNormalized:  enabledNorm,
    hasNAVER_CLIENT_ID:      !!idTrim,
    naverClientIdMasked:     idTrim ? (idTrim.slice(0, 4) + '*'.repeat(Math.max(0, idTrim.length - 4))) : '',
    hasNAVER_CLIENT_SECRET:  !!secretTrim,
    // 부분 누락 진단 — 사용자에게 한국어 안내를 만들기 위한 단서
    completeForEnv:          enabledNorm && !!idTrim && !!secretTrim,
    partialMissing:          enabledNorm && (!idTrim || !secretTrim),
  };
}

function envHasNaverCreds() {
  const d = getNaverEnvDiagnostics();
  return d.completeForEnv;
}

/**
 * 단일 진실 출처 (Single Source of Truth) — 모든 호출자는 이 함수만 사용한다.
 * 캐시된 결과 기준이므로 동기 호출 가능. 자격증명이 변경되면 reloadNaver() 후 preloadNaver().
 *
 * @returns {{
 *   configured: boolean,
 *   source: 'env'|'admin'|'none',
 *   clientId: string|null,        // 호출자 내부에서만 사용 — 응답으로 노출 금지
 *   clientSecret: string|null,    // 동일
 *   clientIdMasked: string,
 *   envDiagnostics: object,
 * }}
 */
export function getNaverConfig() {
  const env = getNaverEnvDiagnostics();
  if (cachedCreds) {
    return {
      configured:     true,
      source:         cachedSource,
      clientId:       cachedCreds.clientId,
      clientSecret:   cachedCreds.clientSecret,
      clientIdMasked: cachedCreds.clientId
        ? (cachedCreds.clientId.slice(0, 4) + '*'.repeat(Math.max(0, cachedCreds.clientId.length - 4)))
        : '',
      envDiagnostics: env,
    };
  }
  return {
    configured: false, source: 'none',
    clientId: null, clientSecret: null, clientIdMasked: '',
    envDiagnostics: env,
  };
}

async function resolveCredentials() {
  // 1) 환경변수 (Render 등 배포 환경) — 우선
  if (envHasNaverCreds()) {
    return {
      source:       'env',
      clientId:     String(process.env.NAVER_CLIENT_ID || '').trim(),
      clientSecret: String(process.env.NAVER_CLIENT_SECRET || '').trim(),
    };
  }

  // 2) 관리자 화면 저장값 (보조)
  try {
    const stored = await loadSourceSettings();
    if (stored.naverEnabled && stored.naverClientId && stored.naverClientSecret) {
      return {
        source:       'admin',
        clientId:     String(stored.naverClientId).trim(),
        clientSecret: String(stored.naverClientSecret).trim(),
      };
    }
  } catch { /* fall through */ }

  return null;
}

export async function preloadNaver() {
  const c = await resolveCredentials();
  cachedCreds  = c;
  cachedSource = c ? c.source : 'none';
  _loaded = true;
}

export function reloadNaver() {
  cachedCreds  = null;
  cachedSource = 'none';
  _loaded      = false;
}

/** sync 호출자(collector / health) 호환용 — 캐시된 결과 기준. */
export function isNaverConfigured() {
  return !!cachedCreds;
}

/** 현재 활성 출처 — 'admin' / 'env' / 'none'. */
export function getNaverSource() {
  return cachedSource;
}

async function ensureLoaded() {
  if (!_loaded) await preloadNaver();
}

// HTML/엔티티 제거 (Naver 응답에는 <b>매칭키워드</b> 가 들어있음)
function stripHtml(s = '') {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function safeDate(raw) {
  try {
    return new Date(raw).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return raw || ''; }
}

const DOMAIN_TO_SOURCE = {
  'chosun.com': '조선일보', 'biz.chosun.com': '조선일보',
  'joongang.co.kr': '중앙일보', 'joins.com': '중앙일보',
  'donga.com': '동아일보',
  'hani.co.kr': '한겨레',
  'khan.co.kr': '경향신문',
  'hankookilbo.com': '한국일보',
  'kmib.co.kr': '국민일보',
  'munhwa.com': '문화일보',
  'segye.com': '세계일보',
  'seoul.co.kr': '서울신문',
  'mk.co.kr': '매일경제',
  'hankyung.com': '한국경제',
  'mt.co.kr': '머니투데이',
  'edaily.co.kr': '이데일리',
  'sedaily.com': '서울경제',
  'fnnews.com': '파이낸셜뉴스',
  'asiae.co.kr': '아시아경제',
  'ajunews.com': '아주경제',
  'heraldcorp.com': '헤럴드경제',
  'newspim.com': '뉴스핌',
  'kbs.co.kr': 'KBS', 'news.kbs.co.kr': 'KBS',
  'imnews.imbc.com': 'MBC', 'imbc.com': 'MBC', 'mbc.co.kr': 'MBC',
  'sbs.co.kr': 'SBS', 'news.sbs.co.kr': 'SBS',
  'ytn.co.kr': 'YTN',
  'jtbc.co.kr': 'JTBC', 'news.jtbc.co.kr': 'JTBC',
  'tvchosun.com': 'TV조선',
  'ichannela.com': '채널A',
  'mbn.co.kr': 'MBN',
  'yna.co.kr': '연합뉴스', 'yonhapnews.co.kr': '연합뉴스',
  'newsis.com': '뉴시스',
  'news1.kr': '뉴스1',
  'ohmynews.com': '오마이뉴스',
  'pressian.com': '프레시안',
  'newstapa.org': '뉴스타파',
  'mediatoday.co.kr': '미디어오늘',
  'dailian.co.kr': '데일리안',
  'kukinews.com': '쿠키뉴스',
  'nocutnews.co.kr': '노컷뉴스',
  'dt.co.kr': '디지털타임스',
  'etnews.com': '전자신문',
  'inews24.com': '아이뉴스24',
  'busan.com': '부산일보',
  'kookje.co.kr': '국제신문',
  'imaeil.com': '매일신문',
  'kado.net': '강원도민일보',
  'kwnews.co.kr': '강원일보',
  'cctoday.co.kr': '충청투데이',
  'daejonilbo.com': '대전일보',
  'jjan.kr': '전북일보',
  'kwangju.co.kr': '광주일보',
  'kyeonggi.com': '경기일보',
  'kyeongin.com': '경인일보',
  'jejunews.com': '제주일보',
  'korea.kr': '대한민국 정책브리핑',
};

function extractSource(url, title) {
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
      if (DOMAIN_TO_SOURCE[host]) return DOMAIN_TO_SOURCE[host];
      for (const [d, name] of Object.entries(DOMAIN_TO_SOURCE)) {
        if (host === d || host.endsWith('.' + d)) return name;
      }
      if (host.endsWith('.go.kr')) return '정부/공공기관';
      return host;
    } catch {}
  }
  if (title) {
    const m = title.match(/-\s*([^-]+)\s*$/);
    if (m) return m[1].trim();
  }
  return '미상';
}

/**
 * Naver 뉴스 검색.
 * @param {string} keyword
 * @param {Object} opts { display=30 (max 100), sort='date' | 'sim' }
 * @param {Object} overrideCreds  명시적 자격증명 — test 용
 * @returns {Promise<Array>} 정규화된 article 배열
 */
export async function fetchNaverNews(keyword, { display = 30, sort = 'date', returnRaw = false } = {}, overrideCreds = null) {
  let creds = overrideCreds;
  if (!creds) {
    await ensureLoaded();
    creds = cachedCreds;
  }
  if (!creds) {
    // 부분 누락 케이스를 한국어로 구체 진단
    const d = getNaverEnvDiagnostics();
    let detail = '';
    if (d.partialMissing) {
      const miss = [];
      if (!d.hasNAVER_CLIENT_ID)     miss.push('NAVER_CLIENT_ID');
      if (!d.hasNAVER_CLIENT_SECRET) miss.push('NAVER_CLIENT_SECRET');
      detail = ` Render Environment 에 ${miss.join(' / ')} 가 누락되어 있습니다.`;
    } else if (d.hasNAVER_ENABLED && !d.naverEnabledNormalized) {
      detail = ' NAVER_ENABLED 가 false / 0 / no / off 로 해석되었습니다. true 또는 1 로 설정하세요.';
    } else if (!d.hasNAVER_ENABLED && !d.hasNAVER_CLIENT_ID && !d.hasNAVER_CLIENT_SECRET) {
      detail = ' Render Environment 에 NAVER_* 환경변수가 등록되지 않았습니다.';
    }
    throw new Error('Naver API 가 설정되지 않았습니다.' + detail + ' 관리 → 뉴스 소스 설정 또는 Render Environment 에서 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 을 확인하세요.');
  }
  const url = `${NAVER_API}?query=${encodeURIComponent(keyword)}&display=${Math.min(display, 100)}&sort=${sort}`;
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let data;
  try {
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id':     creds.clientId,
        'X-Naver-Client-Secret': creds.clientSecret,
        'Accept':                'application/json',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Naver API HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (!Array.isArray(data?.items)) return returnRaw ? { items: [], total: 0 } : [];

  const items = data.items.map((it, i) => {
    const title    = stripHtml(it.title);
    const summary  = stripHtml(it.description).slice(0, 300);
    const orig     = (it.originallink || '').trim();
    const naverUrl = (it.link || '').trim();
    const url      = orig || naverUrl;
    return {
      id:             `${keyword}_naver_${i}_${Date.now()}`,
      keyword,
      title,
      url,
      source:         extractSource(orig || naverUrl, title),
      date:           safeDate(it.pubDate),
      rawDate:        it.pubDate || '',
      summary,
      sourceProvider: 'naver',
    };
  });
  return returnRaw ? { items, total: data.total || items.length } : items;
}
