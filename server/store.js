// ─────────────────────────────────────────────
// store.js — JSON 파일 기반 저장소
// 설정 + 리포트 영구 저장. 키워드·제외·수신자는 모든 직원이 공유.
// ⚠️ Render free 플랜은 디스크가 휘발성이므로 영구 보관이 필요하면
//   Render Disk(유료) 또는 외부 DB 로 옮길 것 — README 참고.
// ─────────────────────────────────────────────

import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR    = process.env.DATA_DIR || path.resolve('./data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

const DEFAULT_CONFIG = {
  keywords:           ['법무부', '검찰', '교정'],
  excludes:           [],
  recipients:         [],
  reportType:         'daily',
  filterAds:          true,
  requireAllInclude:  false,

  // ── 자동 수집 스케줄 ──────────────────────────
  autoCollect:        true,
  scheduleMode:       'daily',
  intervalHours:      6,
  reportTime:         '09:00',

  // ── 수집 기간 (P1 추가) ───────────────────────
  collectPeriod:      '7d',         // '24h' | '3d' | '7d' | '14d' | '30d' | 'custom'
  collectFromDate:    '',           // YYYY-MM-DD (custom 일 때만)
  collectToDate:      '',           // YYYY-MM-DD

  // ── 본문 / 이미지 ─────────────────────────────
  extractContent:     true,         // 본문 추출 ON/OFF
  includeImages:      true,         // PDF 에 이미지 포함

  // ── 뉴스 소스 ─────────────────────────────────
  useGoogleNews:      true,
  useNaverNews:       false,

  // ── Google Trends ─────────────────────────────
  googleTrendsEnabled: false,       // 환경변수 + UI 토글 모두 ON 일 때만 활성
  trendsTimeframe:     '7d',        // '7d' | '30d' | '90d' | '12m'
  trendsGeo:           'KR',        // 'KR' 또는 시도 코드 (확장)

  // ── 보기 모드 ─────────────────────────────────
  articleViewMode:     'paper',     // 'paper'(원문형) | 'analytic'(분석형)
  sortNegativeFirst:   true,        // 부정/긴급 우선 정렬

  // ── 자동 발송 ─────────────────────────────────
  autoEmail:          true,
  attachPdf:          true,         // 자동 메일에 PDF 첨부

  // ── 알림 트리거 ───────────────────────────────
  alertOnNegative:    true,
  alertOnTrending:    true,
  alertOnGov:         false,
  alertOnCentral:     false,
  alertKeywords:      [],
};

let configCache = null;

async function ensureDirs() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

export async function loadConfig() {
  if (configCache) return configCache;
  await ensureDirs();
  try {
    const txt = await fs.readFile(CONFIG_PATH, 'utf8');
    configCache = { ...DEFAULT_CONFIG, ...JSON.parse(txt) };
  } catch {
    configCache = { ...DEFAULT_CONFIG };
  }
  return configCache;
}

export async function saveConfig(patch) {
  const current = await loadConfig();
  const next = { ...current, ...patch };
  await ensureDirs();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  configCache = next;
  return next;
}

export async function saveReport(report) {
  await ensureDirs();
  const file = path.join(REPORTS_DIR, `${report.id}.json`);
  await fs.writeFile(file, JSON.stringify(report, null, 2), 'utf8');
  return report;
}

export async function loadReport(id) {
  const safeId = String(id).replace(/[^a-z0-9_-]/gi, '');
  const file   = path.join(REPORTS_DIR, `${safeId}.json`);
  const txt    = await fs.readFile(file, 'utf8');
  return JSON.parse(txt);
}

// ── 기능개선 제안 영구 저장 ──────────────────
const FEEDBACK_PATH = () => path.join(DATA_DIR, 'feedback.json');

export async function appendFeedback(entry) {
  await ensureDirs();
  let arr = [];
  try { arr = JSON.parse(await fs.readFile(FEEDBACK_PATH(), 'utf8')); if (!Array.isArray(arr)) arr = []; } catch {}
  const id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  arr.push({ id, read: false, ...entry });
  if (arr.length > 1000) arr = arr.slice(-1000);
  await fs.writeFile(FEEDBACK_PATH(), JSON.stringify(arr, null, 2), 'utf8');
  return arr.length;
}

export async function listFeedback({ limit = 200 } = {}) {
  await ensureDirs();
  let arr = [];
  try { arr = JSON.parse(await fs.readFile(FEEDBACK_PATH(), 'utf8')); if (!Array.isArray(arr)) arr = []; } catch {}
  return arr.slice(-limit).reverse();
}

// ── 메일 설정 (관리자 화면에서 입력) ───────────
const MAIL_PATH = () => path.join(DATA_DIR, 'mail.json');

const DEFAULT_MAIL_SETTINGS = {
  enabled:           false,         // 메일 발송 ON/OFF
  host:              '',
  port:              587,
  secure:            false,
  user:              '',
  password:          '',            // 평문 저장 (data/ 는 .gitignore)
  from:              '',
  feedbackTo:        '',            // 비어 있으면 환경변수 / 기본값 사용
  reportDefaultTo:   '',            // 정보용 (실제 리포트 수신자는 config.recipients)
};

export async function loadMailSettings() {
  await ensureDirs();
  try {
    const raw = JSON.parse(await fs.readFile(MAIL_PATH(), 'utf8'));
    return { ...DEFAULT_MAIL_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_MAIL_SETTINGS };
  }
}

export async function saveMailSettings(patch) {
  await ensureDirs();
  const current = await loadMailSettings();
  const next = { ...current, ...patch };
  // password 가 빈 문자열로 들어오면 기존 값을 유지
  if (patch.password === undefined || patch.password === '') next.password = current.password;
  await fs.writeFile(MAIL_PATH(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

// ── 뉴스 소스 설정 (관리자 화면에서 입력) ───────
const SOURCE_PATH = () => path.join(DATA_DIR, 'sourceSettings.json');

const DEFAULT_SOURCE_SETTINGS = {
  // 환경변수 NAVER_ENABLED 와 별개로 관리자 화면 토글
  naverEnabled:      false,
  naverClientId:     '',
  naverClientSecret: '',
};

export async function loadSourceSettings() {
  await ensureDirs();
  try {
    const raw = JSON.parse(await fs.readFile(SOURCE_PATH(), 'utf8'));
    return { ...DEFAULT_SOURCE_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SOURCE_SETTINGS };
  }
}

export async function saveSourceSettings(patch) {
  await ensureDirs();
  const current = await loadSourceSettings();
  const next = { ...current, ...patch };
  // secret 빈 문자열로 들어오면 기존 값 유지
  if (patch.naverClientSecret === undefined || patch.naverClientSecret === '') {
    next.naverClientSecret = current.naverClientSecret;
  }
  next.updatedAt = new Date().toISOString();
  await fs.writeFile(SOURCE_PATH(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/** API 응답용 — clientSecret 은 절대 평문 반환하지 않고 hasNaverClientSecret 로만 노출. */
export function safeSourceSettings(s = {}) {
  return {
    naverEnabled:           !!s.naverEnabled,
    naverClientId:          s.naverClientId || '',     // clientId 는 공개 식별자라 평문 OK
    hasNaverClientId:       !!s.naverClientId,
    hasNaverClientSecret:   !!s.naverClientSecret,
    updatedAt:              s.updatedAt || null,
  };
}

/** API 응답용 — 비밀번호는 절대 반환하지 않고 hasPassword 로만 노출. */
export function safeMailSettings(s = {}) {
  return {
    enabled:         !!s.enabled,
    host:            s.host || '',
    port:            Number(s.port || 587),
    secure:          !!s.secure,
    user:            s.user || '',
    hasPassword:     !!s.password,
    from:            s.from || '',
    feedbackTo:      s.feedbackTo || '',
    reportDefaultTo: s.reportDefaultTo || '',
  };
}

export async function setFeedbackRead(id, read = true) {
  await ensureDirs();
  let arr = [];
  try { arr = JSON.parse(await fs.readFile(FEEDBACK_PATH(), 'utf8')); if (!Array.isArray(arr)) arr = []; } catch { return false; }
  const idx = arr.findIndex(f => f.id === id);
  if (idx < 0) return false;
  arr[idx].read = !!read;
  arr[idx].readAt = read ? new Date().toISOString() : null;
  await fs.writeFile(FEEDBACK_PATH(), JSON.stringify(arr, null, 2), 'utf8');
  return true;
}

export async function listReports({ limit = 50 } = {}) {
  await ensureDirs();
  const files = await fs.readdir(REPORTS_DIR);
  const items = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const r = JSON.parse(await fs.readFile(path.join(REPORTS_DIR, f), 'utf8'));
      items.push({
        id:          r.id,
        generatedAt: r.generatedAt,
        count:       r.articles?.length || 0,
        keywords:    r.keywords,
        trigger:     r.trigger,
        emailedTo:   r.emailedTo || [],
        riskLevel:   r.riskLevel || null,
      });
    } catch { /* skip corrupt */ }
  }
  return items
    .sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''))
    .slice(0, limit);
}
