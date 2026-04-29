// ─────────────────────────────────────────────
// scheduler.js — 자동 수집 cron (daily / interval / off)
// 설정 변경 시 restartScheduler() 로 재구성.
// ─────────────────────────────────────────────

import cron from 'node-cron';
import { runCollection } from './collector.js';
import { loadConfig, saveReport } from './store.js';
import { sendMail, isConfigured as smtpConfigured } from './mailer.js';
import { renderReportEmailHtml, renderReportText } from './reportTemplate.js';

let task    = null;
let mode    = 'off';
let nextAt  = null;
let baseUrl = null;

const TZ = 'Asia/Seoul';

function parseHHMM(v, def = '09:00') {
  const m = String(v || def).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return [9, 0];
  return [Math.min(23, +m[1]), Math.min(59, +m[2])];
}

// 다음 daily 실행 시각 (KST 기준)
function nextDaily(hh, mm) {
  // 서버 시간이 UTC 일 수 있으므로 한국 시각으로 계산
  const now    = new Date();
  const target = new Date();
  target.setHours(hh, mm, 0, 0);
  // KST 와 로컬이 다른 경우 보정 — TZ env 가 Asia/Seoul 이라고 가정
  if (target <= now) target.setDate(target.getDate() + 1);
  return target;
}

function nextInterval(hours) {
  return new Date(Date.now() + hours * 3600 * 1000);
}

async function runOnce(trigger = 'scheduled') {
  console.log(`[scheduler] running collection (trigger=${trigger})`);
  try {
    const report = await runCollection({ trigger });
    const cfg    = await loadConfig();

    if (cfg.autoEmail !== false && cfg.recipients?.length && smtpConfigured()) {
      const subject = `[Trend Collector] ${new Date().toLocaleDateString('ko-KR')} 보고 (${report.articles.length}건)`;
      try {
        await sendMail({
          to:      cfg.recipients,
          subject,
          html:    renderReportEmailHtml(report, baseUrl || process.env.BASE_URL),
          text:    renderReportText(report),
        });
        report.emailedTo = cfg.recipients;
        await saveReport(report);
        console.log(`[scheduler] emailed to ${cfg.recipients.length} recipients`);
      } catch (e) {
        console.error('[scheduler] email error:', e.message);
      }
    }
  } catch (e) {
    console.error('[scheduler] error:', e.message);
  }
}

function clearTask() {
  if (task) { try { task.stop(); } catch {} }
  task   = null;
  nextAt = null;
}

/**
 * 현재 설정에 맞춰 스케줄을 재구성한다.
 */
export async function restartScheduler({ baseUrl: bu } = {}) {
  if (bu) baseUrl = bu;
  clearTask();

  const cfg = await loadConfig();
  if (cfg.autoCollect === false || cfg.scheduleMode === 'off') {
    mode = 'off';
    console.log('[scheduler] auto-collect disabled');
    return getStatus();
  }

  if (cfg.scheduleMode === 'interval') {
    const hrs = Math.max(1, Number(cfg.intervalHours) || 6);
    mode = 'interval';
    // node-cron 의 매시 표현식 — every N hours: `0 */N * * *`
    // 단 N 이 24 의 약수가 아닐 수 있으므로 안전하게 setInterval 사용
    nextAt = nextInterval(hrs);
    const ms = hrs * 3600 * 1000;
    task = {
      _t: setInterval(async () => {
        nextAt = nextInterval(hrs);
        await runOnce('scheduled');
      }, ms),
      stop() { clearInterval(this._t); },
    };
    console.log(`[scheduler] interval mode: every ${hrs} hours, next ~ ${nextAt.toLocaleString('ko-KR', { timeZone: TZ })}`);
    return getStatus();
  }

  // 기본: daily
  const [h, m] = parseHHMM(cfg.reportTime, '09:00');
  mode = 'daily';
  const expr = `${m} ${h} * * *`;
  task = cron.schedule(expr, async () => {
    nextAt = nextDaily(h, m);
    await runOnce('scheduled');
  }, { timezone: TZ });
  nextAt = nextDaily(h, m);
  console.log(`[scheduler] daily mode: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} KST (cron "${expr}"), next ~ ${nextAt.toLocaleString('ko-KR', { timeZone: TZ })}`);
  return getStatus();
}

export function startScheduler(opts = {}) { return restartScheduler(opts); }

export function stopScheduler() {
  clearTask();
  mode = 'off';
}

export function getStatus() {
  return {
    mode,
    nextAt: nextAt ? nextAt.toISOString() : null,
  };
}
