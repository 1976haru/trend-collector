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
      });
    } catch { /* skip corrupt */ }
  }
  return items
    .sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''))
    .slice(0, limit);
}
