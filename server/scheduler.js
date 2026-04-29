// ─────────────────────────────────────────────
// scheduler.js — REPORT_TIME 환경변수 기반 일일 cron
// ─────────────────────────────────────────────

import cron from 'node-cron';
import { runCollection } from './collector.js';
import { loadConfig, saveReport } from './store.js';
import { sendMail, isConfigured as smtpConfigured } from './mailer.js';
import { renderReportEmailHtml, renderReportText } from './reportTemplate.js';

let task;

function parseHHMM(v, fallback = '09:00') {
  const s = String(v || fallback).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return [9, 0];
  return [Math.min(23, +m[1]), Math.min(59, +m[2])];
}

export function startScheduler({ baseUrl } = {}) {
  if (task) { task.stop(); task = null; }
  const [h, mn] = parseHHMM(process.env.REPORT_TIME);
  const expr = `${mn} ${h} * * *`;
  task = cron.schedule(expr, async () => {
    console.log(`[scheduler] daily collection start (${h}:${String(mn).padStart(2, '0')} KST)`);
    try {
      const report = await runCollection({ trigger: 'scheduled' });
      const cfg    = await loadConfig();
      if (cfg.recipients?.length && smtpConfigured()) {
        const subject = `[Trend Collector] ${new Date().toLocaleDateString('ko-KR')} 일일 보고 (${report.articles.length}건)`;
        await sendMail({
          to:      cfg.recipients,
          subject,
          html:    renderReportEmailHtml(report, baseUrl || process.env.BASE_URL),
          text:    renderReportText(report),
        });
        report.emailedTo = cfg.recipients;
        await saveReport(report);
        console.log(`[scheduler] emailed to ${cfg.recipients.length} recipients`);
      } else {
        console.log('[scheduler] no recipients or SMTP not configured — skipped email');
      }
    } catch (e) {
      console.error('[scheduler] error:', e.message);
    }
  }, { timezone: 'Asia/Seoul' });

  console.log(`[scheduler] scheduled daily at ${h}:${String(mn).padStart(2, '0')} KST (cron: "${expr}")`);
}

export function stopScheduler() {
  if (task) { task.stop(); task = null; }
}
