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
  keywords:           ['정책', '지자체', '예산'],
  excludes:           [],
  recipients:         [],
  reportType:         'daily',
  filterAds:          true,
  requireAllInclude:  false,

  // ── 자동 수집 스케줄 ──────────────────────────
  autoCollect:        true,                 // 자동 수집 ON/OFF
  scheduleMode:       'daily',              // 'daily' | 'interval' | 'off'
  intervalHours:      6,                    // scheduleMode === 'interval' 일 때 6/10/12/24/48
  reportTime:         '09:00',              // scheduleMode === 'daily' 일 때 HH:MM (KST)

  // ── 자동 발송 옵션 ────────────────────────────
  autoEmail:          true,                 // 수집 후 메일 자동 발송
  attachPdf:          false,                // PDF 첨부 (P1: false, P2 에서 본격 지원)

  // ── 알림 트리거 (메일 발송 트리거 보강) ───────
  alertOnNegative:    true,                 // 부정 비율 50% 이상
  alertOnTrending:    true,                 // 급상승 이슈 발생
  alertOnGov:         false,                // 정부/공공기관 보도 발생
  alertOnCentral:     false,                // 중앙언론 보도 발생
  alertKeywords:      [],                   // 특정 키워드 포함 시
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
