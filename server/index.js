// ─────────────────────────────────────────────
// server/index.js — Express 서버 진입점
// 정적 SPA + REST API + 인증 + cron
// ─────────────────────────────────────────────

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRouter, { requireAuth } from './auth.js';
import { loadConfig, saveConfig, listReports, loadReport, saveReport } from './store.js';
import { runCollection } from './collector.js';
import { sendMail, isConfigured as smtpConfigured } from './mailer.js';
import { renderReportHtml, renderReportEmailHtml, renderReportText } from './reportTemplate.js';
import { startScheduler, restartScheduler, getStatus as getSchedulerStatus } from './scheduler.js';
import { htmlToPdf, shutdownBrowser } from './pdfGenerator.js';
import { isKakaoEnabled } from './notifyKakao.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const DIST_DIR  = path.join(ROOT, 'dist');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '512kb' }));
app.use(cookieParser());

// 가벼운 요청 로그 (운영시 morgan 으로 교체 가능)
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`${new Date().toISOString()}  ${req.method} ${req.path}`);
  }
  next();
});

// ── 헬스체크 (Render 무인증 ping) ────────────
app.get('/api/health', async (_req, res) => {
  const cfg = await loadConfig();
  const sch = getSchedulerStatus();
  res.json({
    ok:              true,
    time:            new Date().toISOString(),
    smtp:            smtpConfigured(),
    kakao:           isKakaoEnabled(),
    adminConfigured: !!process.env.ADMIN_PASSWORD,
    schedule: {
      autoCollect:   cfg.autoCollect !== false,
      mode:          sch.mode,
      intervalHours: cfg.intervalHours,
      reportTime:    cfg.reportTime || process.env.REPORT_TIME || '09:00',
      nextAt:        sch.nextAt,
    },
  });
});

// ── 인증 ─────────────────────────────────────
app.use('/api/auth', authRouter);

// ── 보호된 API ───────────────────────────────
const api = express.Router();
api.use(requireAuth);

// 설정 (키워드/제외/수신자/옵션) — 직원 모두가 공유
api.get('/config', async (_req, res) => {
  res.json(await loadConfig());
});

api.put('/config', async (req, res) => {
  const allowed = [
    'keywords', 'excludes', 'recipients', 'reportType', 'filterAds', 'requireAllInclude',
    'autoCollect', 'scheduleMode', 'intervalHours', 'reportTime',
    'autoEmail', 'attachPdf',
    'alertOnNegative', 'alertOnTrending', 'alertOnGov', 'alertOnCentral', 'alertKeywords',
  ];
  const patch = {};
  for (const k of allowed) {
    if (k in req.body) patch[k] = req.body[k];
  }
  // 검증
  if (patch.keywords && !Array.isArray(patch.keywords))     return res.status(400).json({ error: 'keywords must be array' });
  if (patch.excludes && !Array.isArray(patch.excludes))     return res.status(400).json({ error: 'excludes must be array' });
  if (patch.alertKeywords && !Array.isArray(patch.alertKeywords))
    return res.status(400).json({ error: 'alertKeywords must be array' });
  if (patch.recipients) {
    if (!Array.isArray(patch.recipients)) return res.status(400).json({ error: 'recipients must be array' });
    patch.recipients = patch.recipients
      .map(s => String(s).trim())
      .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  }
  if (patch.scheduleMode && !['daily', 'interval', 'off'].includes(patch.scheduleMode))
    return res.status(400).json({ error: 'scheduleMode must be daily|interval|off' });
  if (patch.intervalHours !== undefined) {
    const n = Number(patch.intervalHours);
    if (!Number.isFinite(n) || n < 1 || n > 168) return res.status(400).json({ error: 'intervalHours must be 1..168' });
    patch.intervalHours = Math.round(n);
  }
  if (patch.reportTime && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(patch.reportTime))
    return res.status(400).json({ error: 'reportTime must be HH:MM' });

  const next = await saveConfig(patch);

  // 스케줄에 영향 있는 키가 들어왔다면 재구성
  const SCHED_KEYS = ['autoCollect', 'scheduleMode', 'intervalHours', 'reportTime'];
  if (SCHED_KEYS.some(k => k in patch)) {
    try { await restartScheduler(); } catch (e) { console.error('[scheduler] restart error:', e.message); }
  }

  res.json(next);
});

// 수집 실행 (수동)
api.post('/collect', async (_req, res) => {
  try {
    const report = await runCollection({ trigger: 'manual' });
    res.json({ ok: true, report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 리포트 목록
api.get('/reports', async (_req, res) => {
  res.json({ items: await listReports({ limit: 50 }) });
});

// 특정 리포트 (JSON)
api.get('/reports/:id', async (req, res) => {
  try {
    res.json(await loadReport(req.params.id));
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

// 메일 발송 (PDF 첨부 옵션 지원)
api.post('/reports/:id/email', async (req, res) => {
  if (!smtpConfigured()) return res.status(400).json({ error: 'SMTP 환경변수가 설정되지 않았습니다.' });
  try {
    const report = await loadReport(req.params.id);
    const cfg    = await loadConfig();
    const to     = Array.isArray(req.body?.to) && req.body.to.length ? req.body.to : cfg.recipients;
    if (!to?.length) return res.status(400).json({ error: '수신자가 없습니다.' });

    const dateStr = new Date(report.generatedAt).toISOString().slice(0, 16).replace(/[-T:]/g, '').slice(0, 12);
    const fileName = `trend-report-${dateStr}.pdf`;
    const subject = req.body?.subject
      || `[Trend Collector] ${new Date(report.generatedAt).toLocaleDateString('ko-KR')} 보고 (${report.articles.length}건)`;

    // PDF 첨부 옵션 — config.attachPdf 또는 body.attach 가 true 일 때
    const wantAttach = req.body?.attach !== undefined ? !!req.body.attach : !!cfg.attachPdf;
    let attachments = [];
    if (wantAttach) {
      try {
        const pdf = await htmlToPdf(renderReportHtml(report));
        attachments = [{ filename: fileName, content: pdf, contentType: 'application/pdf' }];
      } catch (e) {
        console.error('[email] PDF 첨부 실패:', e.message);
      }
    }

    await sendMail({
      to,
      subject,
      html: renderReportEmailHtml(report, process.env.BASE_URL),
      text: renderReportText(report),
      attachments,
    });
    report.emailedTo = to;
    await saveReport(report);
    res.json({ ok: true, sentTo: to, attached: attachments.length > 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use('/api', api);

// ── 리포트 HTML 보기 (인쇄·PDF 저장용) ──────
app.get('/api/reports/:id/html', requireAuth, async (req, res) => {
  try {
    const report = await loadReport(req.params.id);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderReportHtml(report));
  } catch {
    res.status(404).send('not found');
  }
});

// ── 리포트 PDF 다운로드 (Puppeteer 서버 생성) ──
app.get('/api/reports/:id/pdf', requireAuth, async (req, res) => {
  try {
    const report = await loadReport(req.params.id);
    const dateStr = new Date(report.generatedAt).toISOString().slice(0, 16).replace(/[-T:]/g, '').slice(0, 12);
    const fileName = `trend-report-${dateStr}.pdf`;
    const pdf = await htmlToPdf(renderReportHtml(report));
    res.set('Content-Type',        'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.set('Cache-Control',       'no-store');
    res.send(Buffer.from(pdf));
  } catch (e) {
    console.error('[pdf] generation error:', e.message);
    res.status(500).send('PDF 생성 실패: ' + e.message);
  }
});

// ── SPA 정적 서빙 ────────────────────────────
import fs from 'node:fs';
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.send('<pre>dist/ 폴더가 없습니다. 먼저 npm run build 를 실행하세요.</pre>');
  });
}

// ── 시작 ─────────────────────────────────────
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`[trend-collector] listening on :${PORT}  (${process.env.NODE_ENV || 'dev'})`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('⚠️  ADMIN_PASSWORD 환경변수가 비어 있습니다. 로그인 시도가 모두 거부됩니다.');
  }
  if (!smtpConfigured()) {
    console.warn('⚠️  SMTP_HOST 미설정 — 자동 메일 발송 비활성. 수집 / 리포트 / 스케줄은 정상 동작합니다.');
  }
  if (!isKakaoEnabled()) {
    console.log('ℹ️  카카오 알림: KAKAO_ENABLED 가 true 가 아니므로 비활성 (스텁).');
  }
  startScheduler({ baseUrl: process.env.BASE_URL });
});

// 종료 시 Puppeteer 브라우저 정리
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    try { await shutdownBrowser(); } catch {}
    process.exit(0);
  });
}
