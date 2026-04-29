// ─────────────────────────────────────────────
// server/index.js — Express 서버 진입점
// 정적 SPA + REST API + 인증 + cron
// ─────────────────────────────────────────────

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRouter, { requireAuth } from './auth.js';
import { loadConfig, saveConfig, listReports, loadReport, saveReport, appendFeedback } from './store.js';
import { runCollection, reextractReport } from './collector.js';
import { sendMail, isConfigured as smtpConfigured } from './mailer.js';
import { renderReportHtml, renderReportEmailHtml, renderReportText } from './reportTemplate.js';
import { startScheduler, restartScheduler, getStatus as getSchedulerStatus } from './scheduler.js';
import { htmlToPdf, shutdownBrowser } from './pdfGenerator.js';
import { isKakaoEnabled } from './notifyKakao.js';
import { isNaverConfigured } from './sources/naver.js';
import { isTrendsEnabled, getProvider as getTrendsProvider } from './trends/googleTrends.js';

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
    sources: {
      googleNews:      cfg.useGoogleNews !== false,
      naverNews:       !!cfg.useNaverNews && isNaverConfigured(),
      naverConfigured: isNaverConfigured(),
    },
    trends: {
      enabled:        isTrendsEnabled() && cfg.googleTrendsEnabled !== false,
      configured:     isTrendsEnabled(),
      provider:       getTrendsProvider(),
    },
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

// ── 무인증 — 기능 개선 제안 ──────────────────
// (보호된 라우터(api) 보다 먼저 등록해야 한다)
const DEFAULT_FEEDBACK_TO = 'hsuhyun77@naver.com';
app.post('/api/feedback', async (req, res) => {
  const to = process.env.FEEDBACK_TO_EMAIL || DEFAULT_FEEDBACK_TO;
  const smtpOk = smtpConfigured();
  const b = req.body || {};
  for (const k of ['title', 'content']) {
    if (!b[k] || String(b[k]).trim().length === 0) {
      return res.status(400).json({ ok: false, error: `${k} 는 필수입니다.` });
    }
  }
  const trim = (v, n) => String(v || '').trim().slice(0, n);
  const data = {
    name:       trim(b.name, 80),
    contact:    trim(b.contact, 200),
    title:      trim(b.title, 200),
    content:    trim(b.content, 5000),
    severity:   ['낮음', '보통', '높음', '긴급'].includes(b.severity) ? b.severity : '보통',
    userAgent:  trim(req.get('user-agent'), 300),
    pageUrl:    trim(b.pageUrl, 500),
    receivedAt: new Date().toISOString(),
  };
  const subject = `[Trend Collector 기능개선 제안] ${data.title}`;
  const text = [
    `▶ 접수 시간: ${new Date(data.receivedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    `▶ 이름/부서: ${data.name || '-'}`,
    `▶ 연락처:   ${data.contact || '-'}`,
    `▶ 중요도:   ${data.severity}`,
    `▶ 제안 제목: ${data.title}`,
    '',
    '── 제안 내용 ─────────────────────────',
    data.content,
    '──────────────────────────────────────',
    '',
    `브라우저: ${data.userAgent}`,
    `현재 URL: ${data.pageUrl}`,
  ].join('\n');
  const escHtml = (s) => String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
  const html = `
    <div style="font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif; line-height:1.6; color:#222;">
      <h2 style="margin:0 0 8px;">📨 Trend Collector 기능개선 제안</h2>
      <table style="border-collapse:collapse; font-size:13px; margin:8px 0;">
        <tr><th align="left" style="padding:4px 10px; background:#f0ede8;">접수 시간</th><td style="padding:4px 10px;">${new Date(data.receivedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</td></tr>
        <tr><th align="left" style="padding:4px 10px; background:#f0ede8;">이름/부서</th><td style="padding:4px 10px;">${escHtml(data.name) || '-'}</td></tr>
        <tr><th align="left" style="padding:4px 10px; background:#f0ede8;">연락처</th><td style="padding:4px 10px;">${escHtml(data.contact) || '-'}</td></tr>
        <tr><th align="left" style="padding:4px 10px; background:#f0ede8;">중요도</th><td style="padding:4px 10px;"><strong>${escHtml(data.severity)}</strong></td></tr>
        <tr><th align="left" style="padding:4px 10px; background:#f0ede8;">제목</th><td style="padding:4px 10px;">${escHtml(data.title)}</td></tr>
      </table>
      <h3 style="margin:14px 0 4px;">제안 내용</h3>
      <div style="background:#fafaf6; border:1px solid #ccc; border-radius:6px; padding:12px; white-space:pre-wrap;">${escHtml(data.content)}</div>
      <div style="margin-top:14px; color:#666; font-size:12px;">
        브라우저: ${escHtml(data.userAgent)}<br/>
        현재 URL: ${escHtml(data.pageUrl) || '-'}
      </div>
    </div>
  `;
  // 메일 발송 시도 + JSON 영구 저장 (실패해도 저장은 진행)
  let mailSent = false, mailError = null;
  if (smtpOk) {
    try {
      await sendMail({ to, subject, text, html });
      mailSent = true;
    } catch (e) {
      console.error('[feedback] send error:', e.message);
      mailError = e.message;
    }
  } else {
    mailError = 'SMTP 환경변수 미설정 — 서버에 저장만 됩니다.';
  }

  try {
    const total = await appendFeedback({ ...data, mailSent, mailError });
    if (mailSent) {
      res.json({ ok: true, savedCount: total, mailSent: true, to });
    } else {
      // SMTP 미설정 / 발송 실패 — 저장은 됐다는 사실은 안내
      res.status(200).json({
        ok: true,
        mailSent: false,
        savedCount: total,
        warning: smtpOk
          ? '메일 발송에 실패했습니다. 서버에는 저장되었습니다. SMTP 설정을 확인하세요.'
          : 'SMTP 가 설정되지 않아 메일은 발송되지 않았으나 서버에 저장되었습니다.',
      });
    }
  } catch (e) {
    console.error('[feedback] save error:', e.message);
    res.status(500).json({ ok: false, error: '제안 저장에 실패했습니다.' });
  }
});

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
    // 수집 / 본문 / 소스
    'collectPeriod', 'collectFromDate', 'collectToDate',
    'extractContent', 'includeImages',
    'useGoogleNews', 'useNaverNews',
    'googleTrendsEnabled', 'trendsTimeframe', 'trendsGeo',
    'articleViewMode', 'sortNegativeFirst',
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

// 본문/이미지 재추출 (전체 또는 실패 기사만)
api.post('/reports/:id/reextract', async (req, res) => {
  try {
    const { failedOnly } = req.body || {};
    const r = await reextractReport(req.params.id, { failedOnly: !!failedOnly });
    res.json({ ok: true, reextracted: r.reextracted, report: r.report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 단일 기사 재추출
api.post('/reports/:id/articles/:articleId/reextract', async (req, res) => {
  try {
    const r = await reextractReport(req.params.id, { articleId: req.params.articleId });
    if (!r.reextracted) return res.status(404).json({ error: 'article not found in report' });
    res.json({ ok: true, report: r.report });
  } catch (e) {
    res.status(500).json({ error: e.message });
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

// ── 공통: 리포트 ID 로 PDF 버퍼 생성 ───────────
async function generatePdfFor(id, opts = {}) {
  const orig = await loadReport(id);
  let report = orig;
  let suffix = '';
  if (opts.filter === 'negative') {
    // 부정 / 긴급·주의 만 필터링한 리포트로 재구성
    const keep = (orig.articles || []).filter(a =>
      a.sentiment?.label === '부정' || a.priority === '긴급' || a.priority === '주의'
    );
    report = { ...orig, articles: keep, title: (orig.title || '') + ' (부정 이슈)' };
    suffix = '-negative';
  }
  const buf     = await htmlToPdf(renderReportHtml(report));
  const dateStr = new Date(report.generatedAt).toISOString().slice(0, 16).replace(/[-T:]/g, '').slice(0, 12);
  return { buf, fileName: `trend-report-${dateStr}${suffix}.pdf` };
}

// ── 리포트 PDF — 미리보기 (inline) ──────────────
app.get('/api/reports/:id/pdf/preview', requireAuth, async (req, res) => {
  try {
    const { buf, fileName } = await generatePdfFor(req.params.id, { filter: req.query.filter });
    res.set('Content-Type',        'application/pdf');
    res.set('Content-Disposition', `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.set('Cache-Control',       'no-store');
    res.send(buf);
  } catch (e) {
    console.error('[pdf:preview] generation error:', e.stack || e.message);
    res.status(500).type('text/html; charset=utf-8').send(
      `<pre style="font-family:'Noto Sans KR',sans-serif; padding:20px; color:#c53030;">PDF 미리보기 생성 실패\n\n${(e.message || String(e)).replace(/</g, '&lt;')}</pre>`
    );
  }
});

// ── 리포트 PDF — 다운로드 (attachment) ──────────
app.get('/api/reports/:id/pdf/download', requireAuth, async (req, res) => {
  try {
    const { buf, fileName } = await generatePdfFor(req.params.id, { filter: req.query.filter });
    res.set('Content-Type',        'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.set('Cache-Control',       'no-store');
    res.send(buf);
  } catch (e) {
    console.error('[pdf:download] generation error:', e.stack || e.message);
    res.status(500).type('text/html; charset=utf-8').send(
      `<pre style="font-family:'Noto Sans KR',sans-serif; padding:20px; color:#c53030;">PDF 다운로드 생성 실패\n\n${(e.message || String(e)).replace(/</g, '&lt;')}</pre>`
    );
  }
});

// ── 호환 — 기존 /pdf 는 download 로 ─────────────
app.get('/api/reports/:id/pdf', requireAuth, (req, res) => {
  res.redirect(302, `/api/reports/${encodeURIComponent(req.params.id)}/pdf/download`);
});

// ── 디버그: 보고서 → 렌더링된 HTML 그대로 (PDF 변환 없이) ──
app.get('/api/reports/:id/html-debug', requireAuth, async (req, res) => {
  try {
    const report = await loadReport(req.params.id);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(renderReportHtml(report));
  } catch (e) {
    res.status(500).type('text/html; charset=utf-8').send(`<pre>${(e.message || '').replace(/</g, '&lt;')}</pre>`);
  }
});

// ── 디버그: 단일 기사의 추출 결과 (JSON) ─────────
app.get('/api/reports/:id/articles/:articleId/debug', requireAuth, async (req, res) => {
  try {
    const report = await loadReport(req.params.id);
    const a = (report.articles || []).find(x => x.id === req.params.articleId);
    if (!a) return res.status(404).json({ error: 'article not found' });
    res.json({
      id: a.id,
      title: a.title,
      url: a.url,
      source: a.source,
      mediaType: a.mediaType,
      sourceProvider: a.sourceProvider,
      extracted: a.extracted,
      extractionError: a.extractionError,
      reporter: a.reporter,
      publishedMeta: a.publishedMeta,
      contentTextLength: a.contentText?.length || 0,
      contentHtmlLength: a.contentHtml?.length || 0,
      images: a.images || [],
      sentiment: a.sentiment,
      departments: a.departments,
      priority: a.priority,
      briefLine: a.briefLine,
      // 본문 미리보기 (첫 800자)
      contentPreview: (a.contentText || '').slice(0, 800),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
