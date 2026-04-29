// ─────────────────────────────────────────────
// scheduler.js — 자동 수집 cron (daily / interval / off)
// 설정 변경 시 restartScheduler() 로 재구성.
// ─────────────────────────────────────────────

import cron from 'node-cron';
import { runCollection } from './collector.js';
import { loadConfig, saveReport } from './store.js';
import { sendMail, isConfigured as smtpConfigured } from './mailer.js';
import { renderReportEmailHtml, renderReportText, renderReportHtml } from './reportTemplate.js';
import { htmlToPdf } from './pdfGenerator.js';
import { sendKakao, buildReportMessage } from './notifyKakao.js';

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

function shouldAlert(cfg, report) {
  const reasons = [];
  if (cfg.alertOnNegative && (report.sentiment?.negativePct || 0) >= 50) reasons.push(`부정 ${report.sentiment.negativePct}%`);
  if (cfg.alertOnTrending && (report.trending?.length || 0) >= 1)         reasons.push(`급상승 ${report.trending.length}건`);
  if (cfg.alertOnCentral  && (report.mediaCounts?.['중앙언론'] || 0) > 0) reasons.push('중앙언론 보도');
  if (cfg.alertOnGov      && (report.mediaCounts?.['정부/공공기관'] || 0) > 0) reasons.push('정부/공공기관 보도');
  if (cfg.alertKeywords?.length) {
    const hit = (report.articles || []).find(a => {
      const hay = `${a.title || ''} ${a.summary || ''}`;
      return cfg.alertKeywords.some(k => hay.includes(k));
    });
    if (hit) reasons.push(`키워드 알림(${cfg.alertKeywords.join(',')})`);
  }
  return reasons;
}

async function runOnce(trigger = 'scheduled') {
  console.log(`[scheduler] running collection (trigger=${trigger})`);
  try {
    const report = await runCollection({ trigger });
    const cfg    = await loadConfig();

    // 메일 발송
    if (cfg.autoEmail !== false && cfg.recipients?.length && smtpConfigured()) {
      const alerts = shouldAlert(cfg, report);
      const prefix = alerts.length ? `⚠️ ` : '';
      const subject = `${prefix}[Trend Collector] ${new Date().toLocaleDateString('ko-KR')} 보고 (${report.articles.length}건${report.riskLevel ? ` · ${report.riskLevel.level}` : ''})`;

      let attachments = [];
      if (cfg.attachPdf) {
        try {
          const pdf = await htmlToPdf(renderReportHtml(report));
          const dateStr = new Date(report.generatedAt).toISOString().slice(0, 16).replace(/[-T:]/g, '').slice(0, 12);
          attachments = [{ filename: `trend-report-${dateStr}.pdf`, content: pdf, contentType: 'application/pdf' }];
        } catch (e) {
          console.error('[scheduler] PDF 첨부 실패:', e.message);
        }
      }

      try {
        await sendMail({
          to:      cfg.recipients,
          subject,
          html:    renderReportEmailHtml(report, baseUrl || process.env.BASE_URL),
          text:    renderReportText(report),
          attachments,
        });
        report.emailedTo = cfg.recipients;
        report.alerts    = alerts;
        await saveReport(report);
        console.log(`[scheduler] emailed to ${cfg.recipients.length} recipients (alerts=${alerts.length}, pdf=${attachments.length > 0})`);
      } catch (e) {
        console.error('[scheduler] email error:', e.message);
      }
    }

    // 카카오 알림 (스텁 — KAKAO_ENABLED=true 일 때만 실 발송 시도)
    try {
      const r = await sendKakao({
        message: buildReportMessage(report, baseUrl || process.env.BASE_URL),
        link:    `${(baseUrl || process.env.BASE_URL || '').replace(/\/$/, '')}/api/reports/${encodeURIComponent(report.id)}/pdf`,
      });
      if (r.sent) console.log('[scheduler] kakao sent');
    } catch (e) {
      console.error('[scheduler] kakao error:', e.message);
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
