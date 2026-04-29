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
import { startScheduler } from './scheduler.js';

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
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    time:        new Date().toISOString(),
    smtp:        smtpConfigured(),
    reportTime:  process.env.REPORT_TIME || '09:00',
    adminConfigured: !!process.env.ADMIN_PASSWORD,
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
  const allowed = ['keywords', 'excludes', 'recipients', 'reportType', 'filterAds', 'requireAllInclude'];
  const patch = {};
  for (const k of allowed) {
    if (k in req.body) patch[k] = req.body[k];
  }
  // 가벼운 검증
  if (patch.keywords && !Array.isArray(patch.keywords)) return res.status(400).json({ error: 'keywords must be array' });
  if (patch.excludes && !Array.isArray(patch.excludes)) return res.status(400).json({ error: 'excludes must be array' });
  if (patch.recipients) {
    if (!Array.isArray(patch.recipients)) return res.status(400).json({ error: 'recipients must be array' });
    patch.recipients = patch.recipients
      .map(s => String(s).trim())
      .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  }
  const next = await saveConfig(patch);
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

// 메일 발송 (현재 등록된 수신자 또는 본문 to 로)
api.post('/reports/:id/email', async (req, res) => {
  if (!smtpConfigured()) return res.status(400).json({ error: 'SMTP 환경변수가 설정되지 않았습니다.' });
  try {
    const report = await loadReport(req.params.id);
    const cfg    = await loadConfig();
    const to     = Array.isArray(req.body?.to) && req.body.to.length ? req.body.to : cfg.recipients;
    if (!to?.length) return res.status(400).json({ error: '수신자가 없습니다.' });
    const subject = req.body?.subject
      || `[Trend Collector] ${new Date(report.generatedAt).toLocaleDateString('ko-KR')} 보고 (${report.articles.length}건)`;
    await sendMail({
      to,
      subject,
      html: renderReportEmailHtml(report, process.env.BASE_URL),
      text: renderReportText(report),
    });
    report.emailedTo = to;
    await saveReport(report);
    res.json({ ok: true, sentTo: to });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use('/api', api);

// ── 리포트 HTML 보기 (인쇄·PDF 저장용) ──────
// 인증 필요. 새 창으로 열어 브라우저에서 PDF 로 인쇄 저장.
app.get('/api/reports/:id/html', requireAuth, async (req, res) => {
  try {
    const report = await loadReport(req.params.id);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderReportHtml(report));
  } catch {
    res.status(404).send('not found');
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
  if (smtpConfigured()) {
    startScheduler({ baseUrl: process.env.BASE_URL });
  } else {
    console.warn('⚠️  SMTP_HOST 미설정 — 메일 발송 / 일일 자동 메일 비활성화. 수집 자체는 동작합니다.');
    // SMTP 가 없어도 cron 으로 수집은 돌려야 한다면 startScheduler() 호출 무관.
    startScheduler({ baseUrl: process.env.BASE_URL });
  }
});
