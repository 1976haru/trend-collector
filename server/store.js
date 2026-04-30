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
  keywords:           [],   // 신규 설치/배포 환경에서는 비어 있어야 한다 — 사용자가 빠른 키워드를 직접 선택
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

  // ── 기사 제외 / 재분석 ───────────────────────
  autoReanalyze:       true,        // 제외/복원 시 자동 재분석

  // ── 자동 발송 ─────────────────────────────────
  autoEmail:          true,
  attachPdf:          true,         // 자동 메일에 PDF 첨부

  // ── 알림 트리거 ───────────────────────────────
  alertOnNegative:    true,
  alertOnTrending:    true,
  alertOnGov:         false,
  alertOnCentral:     false,
  alertKeywords:      [],

  // ── 제출용 보고서 메타 (Word 표지) ────────────
  reportMeta: {
    organization:   '법무부',
    department:     '대변인실',
    author:         '',
    classification: '내부 검토용',
    purpose:        '법무부 정책 및 주요 업무 관련 언론 보도 동향을 일일 단위로 모니터링하여 신속한 대응 자료로 활용함.',
  },
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

// ── 편철 출력 설정 / 기사 수동 편집값 부분 갱신 ──
// printSettings · articleOverrides 만 갱신해서 저장한다. 기존 데이터는 유지.
export async function updateReportPart(id, patch = {}) {
  const r = await loadReport(id);
  if (patch.printSettings) {
    r.printSettings = { ...(r.printSettings || {}), ...patch.printSettings };
  }
  if (patch.articleOverrides) {
    r.articleOverrides = { ...(r.articleOverrides || {}), ...patch.articleOverrides };
  }
  if (patch.clearArticleOverrideId) {
    if (r.articleOverrides) delete r.articleOverrides[patch.clearArticleOverrideId];
  }
  if (patch.resetArticleOverrides) {
    r.articleOverrides = {};
  }
  await saveReport(r);
  return r;
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
  // ── 발송 방식 (provider) ─────
  // 'smtp'     : nodemailer SMTP (Render Free 플랜에서 포트 차단 가능)
  // 'resend'   : Resend API (https://resend.com) — RESEND_API_KEY 필요
  // 'sendgrid' : SendGrid API (https://sendgrid.com)
  // 'none'     : 저장만 — 실제 발송 안 함 (기능개선 제안 등은 data/ 에 저장)
  provider:          'smtp',
  // SMTP
  host:              '',
  port:              587,
  secure:            false,
  user:              '',
  password:          '',            // 평문 저장 (data/ 는 .gitignore)
  // API 방식
  apiKey:            '',            // Resend / SendGrid API key (provider 별 공통 슬롯)
  // 공통
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
  // 비밀 값(password / apiKey) 이 빈 문자열로 들어오면 기존 값을 유지 — 실수 덮어쓰기 방지
  if (patch.password === undefined || patch.password === '') next.password = current.password;
  if (patch.apiKey   === undefined || patch.apiKey   === '') next.apiKey   = current.apiKey;
  // provider 검증
  if (patch.provider && !['smtp', 'resend', 'sendgrid', 'none'].includes(patch.provider)) {
    next.provider = current.provider || 'smtp';
  }
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
  // 공식 기관 보도자료 직접 수집 (Google site: 검색)
  officialAgencyEnabled: true,
  officialAgencyDomains: [],          // 빈 배열 → DEFAULT_AGENCY_DOMAINS 사용
  // 사용자 지정 뉴스 소스 (RSS / 검색 URL 템플릿)
  customSources: [],
  // 검색 누락 보완 — RELATED_KEYWORDS 기반 확장 검색 ON/OFF
  expandKeywords: true,
  // Naver API 마지막 테스트 결과 (UI 상태 카드용)
  lastNaverTest: null,                // { ok, at, keyword, total, returnedCount, error?, source }
  // 자동 추적 — 기관 배포자료 카테고리별 ON/OFF (기본 모두 ON)
  autoTracking: {
    moj:         true,
    probation:   true,
    corrections: true,
    immigration: true,
    prosecution: true,
    policy:      true,
    other:       true,
  },
};

async function ensureSourceFile() {
  await ensureDirs();
  try {
    await fs.access(SOURCE_PATH());
  } catch {
    // 파일이 없으면 기본값으로 자동 생성
    await fs.writeFile(SOURCE_PATH(), JSON.stringify(DEFAULT_SOURCE_SETTINGS, null, 2), 'utf8');
  }
}

export async function loadSourceSettings() {
  try {
    await ensureSourceFile();
    const raw = JSON.parse(await fs.readFile(SOURCE_PATH(), 'utf8'));
    return { ...DEFAULT_SOURCE_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SOURCE_SETTINGS };
  }
}

export async function saveSourceSettings(patch) {
  try {
    await ensureSourceFile();
    const current = await loadSourceSettings();
    const next = { ...current, ...patch };
    // secret 빈 문자열로 들어오면 기존 값 유지 (실수 덮어쓰기 방지)
    if (patch.naverClientSecret === undefined || patch.naverClientSecret === '') {
      next.naverClientSecret = current.naverClientSecret;
    }
    // clientId 도 비어 있는 입력으로 기존 값을 지우지 않도록 보호
    if (patch.naverClientId !== undefined && String(patch.naverClientId).trim() === '') {
      next.naverClientId = current.naverClientId;
    }
    // autoTracking 패치는 부분 merge — 일부 카테고리만 토글해도 다른 카테고리는 유지
    if (patch.autoTracking !== undefined) {
      next.autoTracking = {
        ...DEFAULT_SOURCE_SETTINGS.autoTracking,
        ...(current.autoTracking || {}),
        ...(patch.autoTracking || {}),
      };
    }
    // customSources 는 전체 교체 (CRUD 는 별도 함수로 처리)
    if (patch.customSources !== undefined && Array.isArray(patch.customSources)) {
      next.customSources = patch.customSources;
    }
    if (patch.officialAgencyDomains !== undefined && Array.isArray(patch.officialAgencyDomains)) {
      next.officialAgencyDomains = patch.officialAgencyDomains
        .map(s => String(s).trim().toLowerCase())
        .filter(Boolean);
    }
    if ('officialAgencyEnabled' in patch) next.officialAgencyEnabled = !!patch.officialAgencyEnabled;
    if ('expandKeywords' in patch)        next.expandKeywords        = !!patch.expandKeywords;
    if (patch.lastNaverTest !== undefined) next.lastNaverTest = patch.lastNaverTest;
    next.updatedAt = new Date().toISOString();
    // atomic write — 임시파일 → rename
    const tmp = SOURCE_PATH() + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
    await fs.rename(tmp, SOURCE_PATH());
    return next;
  } catch (e) {
    const err = new Error(`뉴스 소스 설정 저장에 실패했습니다: ${e.message || e}`);
    err.cause = e;
    throw err;
  }
}

/** API 응답용 — clientSecret 은 절대 평문 반환하지 않고 hasNaverClientSecret 로만 노출. */
export function safeSourceSettings(s = {}) {
  const at = { ...DEFAULT_SOURCE_SETTINGS.autoTracking, ...(s.autoTracking || {}) };
  // customSources 는 평문 노출 OK (URL/이름은 secret 아님)
  const cs = Array.isArray(s.customSources) ? s.customSources : [];
  return {
    naverEnabled:           !!s.naverEnabled,
    naverClientId:          s.naverClientId || '',     // clientId 는 공개 식별자라 평문 OK
    hasNaverClientId:       !!s.naverClientId,
    hasNaverClientSecret:   !!s.naverClientSecret,
    officialAgencyEnabled:  s.officialAgencyEnabled !== false,
    officialAgencyDomains:  Array.isArray(s.officialAgencyDomains) ? s.officialAgencyDomains : [],
    customSources:          cs.map(x => ({
      id: x.id, name: x.name || '', url: x.url || '', type: x.type || 'rss',
      agencyCategory: x.agencyCategory || '', enabled: x.enabled !== false,
      createdAt: x.createdAt || null,
    })),
    expandKeywords:         s.expandKeywords !== false,
    lastNaverTest:          s.lastNaverTest || null,
    autoTracking:           at,
    updatedAt:              s.updatedAt || null,
  };
}

// ── 사용자 지정 뉴스 소스 CRUD ─────────────────
function newCustomSourceId() {
  return 'cs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function validateCustomSource(src) {
  const errs = [];
  if (!src.name || !String(src.name).trim()) errs.push('name 은 필수입니다.');
  if (!src.url || !/^https?:\/\//i.test(src.url)) errs.push('url 은 http(s) 형식이어야 합니다.');
  const t = src.type || 'rss';
  if (!['rss', 'search'].includes(t)) errs.push('type 은 rss / search 중 하나여야 합니다.');
  if (errs.length) throw new Error(errs.join(' '));
}

export async function addCustomSource(src) {
  validateCustomSource(src);
  const cur = await loadSourceSettings();
  const list = Array.isArray(cur.customSources) ? cur.customSources : [];
  const item = {
    id:             newCustomSourceId(),
    name:           String(src.name).trim().slice(0, 80),
    url:            String(src.url).trim(),
    type:           ['rss', 'search'].includes(src.type) ? src.type : 'rss',
    agencyCategory: String(src.agencyCategory || '').slice(0, 60),
    enabled:        src.enabled !== false,
    createdAt:      new Date().toISOString(),
  };
  list.push(item);
  await saveSourceSettings({ customSources: list });
  return item;
}

export async function updateCustomSource(id, patch) {
  const cur = await loadSourceSettings();
  const list = (cur.customSources || []).slice();
  const idx = list.findIndex(x => x.id === id);
  if (idx < 0) return null;
  const merged = { ...list[idx], ...patch };
  validateCustomSource(merged);
  list[idx] = {
    ...list[idx],
    name:           String(merged.name).trim().slice(0, 80),
    url:            String(merged.url).trim(),
    type:           ['rss', 'search'].includes(merged.type) ? merged.type : 'rss',
    agencyCategory: String(merged.agencyCategory || '').slice(0, 60),
    enabled:        merged.enabled !== false,
    updatedAt:      new Date().toISOString(),
  };
  await saveSourceSettings({ customSources: list });
  return list[idx];
}

export async function deleteCustomSource(id) {
  const cur = await loadSourceSettings();
  const list = (cur.customSources || []).filter(x => x.id !== id);
  await saveSourceSettings({ customSources: list });
  return true;
}

// ── 백업 / 복원 — Render 무료 플랜 디스크 휘발 대비 ──
/**
 * @param {boolean} includeSecrets — true 면 naverClientSecret 평문 포함 (사용자 명시 동의 필요)
 */
export async function exportSourceSettingsBackup({ includeSecrets = false } = {}) {
  const s = await loadSourceSettings();
  const safe = {
    version:               1,
    exportedAt:            new Date().toISOString(),
    naverEnabled:          !!s.naverEnabled,
    naverClientId:         s.naverClientId || '',
    naverClientSecret:     includeSecrets ? (s.naverClientSecret || '') : '',
    secretsIncluded:       !!includeSecrets,
    officialAgencyEnabled: s.officialAgencyEnabled !== false,
    officialAgencyDomains: s.officialAgencyDomains || [],
    customSources:         s.customSources || [],
    expandKeywords:        s.expandKeywords !== false,
    autoTracking:          s.autoTracking || DEFAULT_SOURCE_SETTINGS.autoTracking,
  };
  return safe;
}

/**
 * 백업 파일을 받아 sourceSettings 에 적용한다.
 * - 비어있는 secret 은 기존 값을 보존 (덮어쓰기 방지)
 */
export async function importSourceSettingsBackup(backup) {
  if (!backup || typeof backup !== 'object') throw new Error('백업 파일 형식이 올바르지 않습니다.');
  const patch = {};
  if ('naverEnabled'  in backup) patch.naverEnabled  = !!backup.naverEnabled;
  if ('naverClientId' in backup) patch.naverClientId = String(backup.naverClientId || '');
  if (backup.naverClientSecret) patch.naverClientSecret = String(backup.naverClientSecret); // 비어있으면 saveSourceSettings 에서 보존
  if ('officialAgencyEnabled'  in backup) patch.officialAgencyEnabled  = !!backup.officialAgencyEnabled;
  if (Array.isArray(backup.officialAgencyDomains))   patch.officialAgencyDomains  = backup.officialAgencyDomains;
  if (Array.isArray(backup.customSources))           patch.customSources          = backup.customSources;
  if ('expandKeywords' in backup) patch.expandKeywords = !!backup.expandKeywords;
  if (backup.autoTracking) patch.autoTracking = backup.autoTracking;
  return await saveSourceSettings(patch);
}

/** API 응답용 — 비밀번호 / API key 는 절대 반환하지 않고 boolean 으로만 노출. */
export function safeMailSettings(s = {}) {
  return {
    enabled:         !!s.enabled,
    provider:        s.provider || 'smtp',
    host:            s.host || '',
    port:            Number(s.port || 587),
    secure:          !!s.secure,
    user:            s.user || '',
    hasPassword:     !!s.password,
    hasApiKey:       !!s.apiKey,
    from:            s.from || '',
    feedbackTo:      s.feedbackTo || '',
    reportDefaultTo: s.reportDefaultTo || '',
  };
}

// ── 기사 제외 / 복원 / 일괄 처리 / 이력 ──────────
//
// 정책:
//   - 실제로 article 을 삭제하지 않고 article.excluded = true 로 표시.
//   - report.articleAuditLog 에 모든 exclude/restore 이벤트를 append.
//   - excludedReason / excludedAt / excludedBy 는 article 객체에 부착.
//   - articles 배열 자체는 보존 — 추후 복원 / 감사용.
//
// 호출자는 store 함수만 사용해 atomic 하게 갱신한다.

function appendAuditLog(report, entry) {
  if (!Array.isArray(report.articleAuditLog)) report.articleAuditLog = [];
  report.articleAuditLog.push(entry);
  // 최근 500건 유지 — 디스크 용량 제한
  if (report.articleAuditLog.length > 500) {
    report.articleAuditLog = report.articleAuditLog.slice(-500);
  }
}

/**
 * 기사 1건 제외.
 * @param {string} reportId
 * @param {string} articleId
 * @param {Object} ctx { reason, by }
 * @returns {{ ok, article, excludedCount }}
 */
export async function excludeArticle(reportId, articleId, ctx = {}) {
  const r = await loadReport(reportId);
  const arts = r.articles || [];
  const a = arts.find(x => x.id === articleId);
  if (!a) return { ok: false, error: 'article not found' };
  const now = new Date().toISOString();
  const prevExcluded = !!a.excluded;
  a.excluded       = true;
  a.excludedAt     = now;
  a.excludedReason = String(ctx.reason || '').slice(0, 100) || '관련 없음';
  a.excludedBy     = String(ctx.by || 'admin').slice(0, 60);
  if (!prevExcluded) {
    appendAuditLog(r, { articleId, action: 'exclude', reason: a.excludedReason, at: now, by: a.excludedBy });
  }
  await saveReport(r);
  return { ok: true, article: a, excludedCount: arts.filter(x => x.excluded).length };
}

/** 기사 1건 복원. */
export async function restoreArticle(reportId, articleId, ctx = {}) {
  const r = await loadReport(reportId);
  const arts = r.articles || [];
  const a = arts.find(x => x.id === articleId);
  if (!a) return { ok: false, error: 'article not found' };
  if (!a.excluded) return { ok: true, article: a, excludedCount: arts.filter(x => x.excluded).length };
  const now = new Date().toISOString();
  const prevReason = a.excludedReason;
  a.excluded       = false;
  a.excludedAt     = null;
  a.excludedReason = null;
  appendAuditLog(r, { articleId, action: 'restore', reason: prevReason || '', at: now, by: String(ctx.by || 'admin').slice(0, 60) });
  await saveReport(r);
  return { ok: true, article: a, excludedCount: arts.filter(x => x.excluded).length };
}

/** 일괄 제외. */
export async function bulkExcludeArticles(reportId, articleIds = [], ctx = {}) {
  const r = await loadReport(reportId);
  const arts = r.articles || [];
  const ids = new Set(articleIds);
  const now = new Date().toISOString();
  const reason = String(ctx.reason || '관련 없음').slice(0, 100);
  const by     = String(ctx.by || 'admin').slice(0, 60);
  let changed = 0;
  for (const a of arts) {
    if (!ids.has(a.id)) continue;
    if (a.excluded) continue;
    a.excluded = true;
    a.excludedAt = now;
    a.excludedReason = reason;
    a.excludedBy = by;
    appendAuditLog(r, { articleId: a.id, action: 'exclude', reason, at: now, by });
    changed++;
  }
  if (changed) await saveReport(r);
  return { ok: true, changed, excludedCount: arts.filter(a => a.excluded).length };
}

/** 일괄 복원. */
export async function bulkRestoreArticles(reportId, articleIds = [], ctx = {}) {
  const r = await loadReport(reportId);
  const arts = r.articles || [];
  const ids = new Set(articleIds);
  const now = new Date().toISOString();
  const by  = String(ctx.by || 'admin').slice(0, 60);
  let changed = 0;
  for (const a of arts) {
    if (!ids.has(a.id)) continue;
    if (!a.excluded) continue;
    const prev = a.excludedReason;
    a.excluded = false;
    a.excludedAt = null;
    a.excludedReason = null;
    appendAuditLog(r, { articleId: a.id, action: 'restore', reason: prev || '', at: now, by });
    changed++;
  }
  if (changed) await saveReport(r);
  return { ok: true, changed, excludedCount: arts.filter(a => a.excluded).length };
}

// ── 추적 링크 (보도자료 클릭 추적) ─────────────
const TRACK_PATH = () => path.join(DATA_DIR, 'trackingLinks.json');

function newTrackingId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function readTrackingArr() {
  try {
    const arr = JSON.parse(await fs.readFile(TRACK_PATH(), 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
async function writeTrackingArr(arr) {
  await ensureDirs();
  await fs.writeFile(TRACK_PATH(), JSON.stringify(arr, null, 2), 'utf8');
}

export async function listTrackingLinks() {
  const arr = await readTrackingArr();
  // 최신 생성 우선
  return arr.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function getTrackingLink(id) {
  const arr = await readTrackingArr();
  return arr.find(l => l.id === id) || null;
}

function normalizeUrl(u = '') {
  // 비교용 — querystring tracking 파라미터 제거 / fragment 제거 / 끝의 / 통일
  try {
    const url = new URL(String(u).trim());
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) {
      if (/^utm_|^fbclid$|^gclid$|^_ga$/i.test(k)) url.searchParams.delete(k);
    }
    let s = url.toString();
    s = s.replace(/\/$/, '');
    return s.toLowerCase();
  } catch { return String(u || '').trim().toLowerCase(); }
}

export async function createTrackingLink({
  title, originalUrl, agency = '', department = '', notes = '',
  // ── 기관 배포자료 자동 추적용 ──
  trackingMode = 'manual',                  // 'manual' | 'auto'
  agencyCategory = '',                      // '법무부 본부' / '보호직' / ...
  officialReleaseType = '',                 // 'moj'|'probation'|'corrections'|'immigration'|'prosecution'|'policy'|'other'
  reportId = '',                            // 자동 등록 시 어느 리포트에서 왔는지
  articleId = '',                           // 어느 기사에서 왔는지
}) {
  if (!title || !originalUrl) throw new Error('title, originalUrl 은 필수입니다.');
  if (!/^https?:\/\//i.test(originalUrl)) throw new Error('originalUrl 은 http(s) URL 이어야 합니다.');
  const arr = await readTrackingArr();
  // 같은 originalUrl(정규화 비교) 이 이미 있으면 그대로 반환 — 자동 sync 시 중복 생성 방지
  const norm = normalizeUrl(originalUrl);
  const existing = arr.find(l => normalizeUrl(l.originalUrl) === norm);
  if (existing) return existing;

  const now = new Date().toISOString();
  const link = {
    id:                  newTrackingId(),
    title:               String(title).trim().slice(0, 200),
    originalUrl:         String(originalUrl).trim(),
    agency:              String(agency).trim().slice(0, 100),
    department:          String(department).trim().slice(0, 100),
    notes:               String(notes).trim().slice(0, 500),
    trackingMode:        trackingMode === 'auto' ? 'auto' : 'manual',
    agencyCategory:      String(agencyCategory).slice(0, 60),
    officialReleaseType: String(officialReleaseType).slice(0, 30),
    reportId:            String(reportId).slice(0, 60),
    articleId:           String(articleId).slice(0, 60),
    createdAt:           now,
    autoCreatedAt:       trackingMode === 'auto' ? now : null,
    clickCount:          0,
    lastClickedAt:       null,
    clickHistory:        [],     // [{ clickedAt, userAgent, referrer }]
  };
  arr.push(link);
  await writeTrackingArr(arr);
  return link;
}

/**
 * 리포트의 기관 배포자료 기사들을 자동 추적 링크로 동기화.
 * - article 에 isOfficialRelease 필드가 없으면 즉석에서 classifyAgencyArticle 호출 (구버전 리포트 호환)
 * - 이미 등록된 originalUrl 은 갱신만 (clickCount 보존)
 * - settings 로 카테고리별 ON/OFF 가능
 * @returns { created: [], existing: [], skipped: [] }
 */
export async function autoSyncReportTrackingLinks(report, opts = {}) {
  const { autoTracking = {} } = opts;
  const { DEFAULT_AUTO_TRACKING, shouldAutoTrack, classifyAgencyArticle } = await import('./agencyClassifier.js');
  const settings = { ...DEFAULT_AUTO_TRACKING, ...autoTracking };
  const arr = await readTrackingArr();
  const created = [], existing = [], skipped = [];

  for (const a of (report.articles || [])) {
    // 분류 필드 누락 시 즉석 분류 (구버전 리포트 호환)
    let cls;
    if (a.officialReleaseType !== undefined || a.isOfficialRelease !== undefined) {
      cls = {
        isOfficialRelease:   !!a.isOfficialRelease,
        officialReleaseType: a.officialReleaseType,
        agencyName:          a.agencyName,
        agencyCategory:      a.agencyCategory,
      };
    } else {
      cls = classifyAgencyArticle(a);
    }
    if (!shouldAutoTrack(cls, settings)) { skipped.push(a.id); continue; }
    if (!a.url || !/^https?:\/\//i.test(a.url)) { skipped.push(a.id); continue; }
    const norm = normalizeUrl(a.url);
    const dup  = arr.find(l => normalizeUrl(l.originalUrl) === norm);
    if (dup) {
      // 메타데이터만 보강 (clickCount / clickHistory 는 그대로)
      dup.agency              = dup.agency || cls.agencyName || a.source || '';
      dup.agencyCategory      = dup.agencyCategory || cls.agencyCategory || '';
      dup.officialReleaseType = dup.officialReleaseType || cls.officialReleaseType || '';
      dup.reportId            = dup.reportId || report.id;
      dup.articleId           = dup.articleId || a.id;
      // 자동 sync 시 mode 를 강제로 바꾸지 않는다 — manual 로 만든 것은 manual 로 둔다.
      existing.push(dup);
      continue;
    }
    const now = new Date().toISOString();
    const link = {
      id:                  newTrackingId(),
      title:               String(a.title || '').trim().slice(0, 200),
      originalUrl:         a.url,
      agency:              cls.agencyName || a.source || '',
      department:          '',
      notes:               '',
      trackingMode:        'auto',
      agencyCategory:      cls.agencyCategory || '',
      officialReleaseType: cls.officialReleaseType || '',
      reportId:            report.id || '',
      articleId:           a.id || '',
      createdAt:           now,
      autoCreatedAt:       now,
      clickCount:          0,
      lastClickedAt:       null,
      clickHistory:        [],
    };
    arr.push(link);
    created.push(link);
  }
  if (created.length) await writeTrackingArr(arr);
  else if (existing.length) await writeTrackingArr(arr);  // 메타 보강 저장
  return { created, existing, skipped, totalAutoLinks: arr.filter(l => l.trackingMode === 'auto').length };
}

export async function updateTrackingLink(id, patch = {}) {
  const arr = await readTrackingArr();
  const idx = arr.findIndex(l => l.id === id);
  if (idx < 0) return null;
  const allowed = ['title', 'originalUrl', 'agency', 'department', 'notes'];
  for (const k of allowed) if (k in patch) arr[idx][k] = String(patch[k] || '').trim();
  if (patch.originalUrl && !/^https?:\/\//i.test(patch.originalUrl)) {
    throw new Error('originalUrl 은 http(s) URL 이어야 합니다.');
  }
  arr[idx].updatedAt = new Date().toISOString();
  await writeTrackingArr(arr);
  return arr[idx];
}

export async function deleteTrackingLink(id) {
  const arr = await readTrackingArr();
  const filtered = arr.filter(l => l.id !== id);
  if (filtered.length === arr.length) return false;
  await writeTrackingArr(filtered);
  return true;
}

/**
 * 추적 클릭 기록.
 * 개인정보 최소화 정책: IP 는 저장하지 않는다. userAgent / referrer 만 저장하며,
 * 보관 이력은 최근 50건으로 자동 절단한다.
 * @param {string} id
 * @param {Object} ctx { userAgent?, referrer? }
 */
export async function recordTrackingClick(id, ctx = {}) {
  const arr = await readTrackingArr();
  const idx = arr.findIndex(l => l.id === id);
  if (idx < 0) return null;
  const link = arr[idx];
  link.clickCount    = (link.clickCount || 0) + 1;
  const now = new Date().toISOString();
  link.lastClickedAt = now;
  // clickHistory — 최근 50건 보존
  const ua = String(ctx.userAgent || '').slice(0, 250);
  const rf = String(ctx.referrer || '').slice(0, 250);
  if (!Array.isArray(link.clickHistory)) link.clickHistory = [];
  link.clickHistory.push({ clickedAt: now, userAgent: ua, referrer: rf });
  if (link.clickHistory.length > 50) link.clickHistory = link.clickHistory.slice(-50);
  await writeTrackingArr(arr);
  return link;
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
