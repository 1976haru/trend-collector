// ─────────────────────────────────────────────
// server/index.js — Express 서버 진입점
// 정적 SPA + REST API + 인증 + cron
// ─────────────────────────────────────────────

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRouter, { requireAuth } from './auth.js';
import { loadConfig, saveConfig, listReports, loadReport, saveReport, updateReportPart, appendFeedback, listFeedback, setFeedbackRead, loadMailSettings, saveMailSettings, safeMailSettings, loadSourceSettings, saveSourceSettings, safeSourceSettings,
  listTrackingLinks, getTrackingLink, createTrackingLink, updateTrackingLink, deleteTrackingLink, recordTrackingClick } from './store.js';
import { runCollection, reextractReport, fetchSourceRaw, simulateSearch } from './collector.js';
import { sendMail, isConfigured as smtpConfigured, reloadMailer, preloadMailer, getActiveMailConfig, diagnoseMailError } from './mailer.js';
import { renderReportHtml, renderReportEmailHtml, renderReportText } from './reportTemplate.js';
import { renderClippingHtml, buildQualityReport } from './clippingTemplate.js';
import { renderAnalysisHtml } from './analysisTemplate.js';
import { PRESET_LIST, getPreset, defaultPrintSettings } from './clippingPresets.js';
import { startScheduler, restartScheduler, getStatus as getSchedulerStatus } from './scheduler.js';
import { htmlToPdf, shutdownBrowser } from './pdfGenerator.js';
import { reportToDocx, clippingToDocx, analysisToDocx } from './wordGenerator.js';
import { reportToXlsx } from './excelGenerator.js';
import { embedImagesInReport } from './imageCache.js';
import { isKakaoEnabled } from './notifyKakao.js';
import { isNaverConfigured, getNaverSource, fetchNaverNews, reloadNaver, preloadNaver } from './sources/naver.js';
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
  const stored = await loadSourceSettings();
  const naverSource = getNaverSource();   // 'env' | 'admin' | 'none'
  res.json({
    ok:              true,
    time:            new Date().toISOString(),
    smtp:            smtpConfigured(),
    kakao:           isKakaoEnabled(),
    adminConfigured: !!process.env.ADMIN_PASSWORD,
    sources: {
      googleNews:           cfg.useGoogleNews !== false,
      naverNews:            !!cfg.useNaverNews && isNaverConfigured(),
      naverConfigured:      isNaverConfigured(),
      naverSource,                         // 'env' | 'admin' | 'none' — env 우선
      hasNaverClientId:     !!process.env.NAVER_CLIENT_ID || !!stored.naverClientId,
      hasNaverClientSecret: !!process.env.NAVER_CLIENT_SECRET || !!stored.naverClientSecret,
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

// ── 무인증 — 추적 링크 redirect (/r/:id) ─────
// SPA catch-all 보다 먼저 등록한다. 잘못된 id 는 홈으로 보낸다.
app.get('/r/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '').replace(/[^a-z0-9]/gi, '');
    if (!id) return res.redirect(302, '/');
    const link = await recordTrackingClick(id);
    if (!link) return res.redirect(302, '/');
    return res.redirect(302, link.originalUrl);
  } catch (e) {
    console.error('[tracking] redirect error:', e.message);
    res.redirect(302, '/');
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
    'reportMeta',
  ];
  const patch = {};
  for (const k of allowed) {
    if (k in req.body) patch[k] = req.body[k];
  }
  // 검증 (오류 메시지는 사용자에게 그대로 노출되므로 한국어로 통일)
  if (patch.keywords && !Array.isArray(patch.keywords))
    return res.status(400).json({ error: 'keywords 는 배열이어야 합니다.' });
  if (patch.excludes && !Array.isArray(patch.excludes))
    return res.status(400).json({ error: 'excludes 는 배열이어야 합니다.' });
  if (patch.alertKeywords && !Array.isArray(patch.alertKeywords))
    return res.status(400).json({ error: 'alertKeywords 는 배열이어야 합니다.' });
  if (patch.recipients) {
    if (!Array.isArray(patch.recipients)) return res.status(400).json({ error: 'recipients 는 배열이어야 합니다.' });
    patch.recipients = patch.recipients
      .map(s => String(s).trim())
      .filter(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  }
  if (patch.scheduleMode && !['daily', 'interval', 'off'].includes(patch.scheduleMode))
    return res.status(400).json({ error: 'scheduleMode 는 daily / interval / off 중 하나여야 합니다.' });
  if (patch.intervalHours !== undefined) {
    const n = Number(patch.intervalHours);
    if (!Number.isFinite(n) || n < 1 || n > 168)
      return res.status(400).json({ error: '수집 주기(시간)는 1 이상 168 이하의 숫자여야 합니다.' });
    patch.intervalHours = Math.round(n);
  }
  if (patch.reportTime && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(patch.reportTime))
    return res.status(400).json({ error: '발송 시각은 HH:MM 형식이어야 합니다 (예: 09:00).' });

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

// ── 관리자: 기능개선 제안 조회 + 읽음 처리 ─────
api.get('/admin/feedback', async (_req, res) => {
  try {
    const items = await listFeedback({ limit: 500 });
    const unread = items.filter(f => !f.read).length;
    res.json({ items, count: items.length, unread });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

api.patch('/admin/feedback/:id/read', async (req, res) => {
  try {
    const ok = await setFeedbackRead(req.params.id, req.body?.read !== false);
    if (!ok) return res.status(404).json({ error: 'feedback not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 관리자: 메일 설정 ────────────────────────
api.get('/admin/mail-settings', async (_req, res) => {
  try {
    const stored = await loadMailSettings();
    const active = await getActiveMailConfig();    // 실제 적용되는 값 (env fallback 포함)
    res.json({
      stored: safeMailSettings(stored),
      active: active ? {
        source: active.source, host: active.host, port: active.port, secure: active.secure,
        user: active.user || '', from: active.from || '',
      } : null,
      envHasSmtp: !!process.env.SMTP_HOST,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

api.put('/admin/mail-settings', async (req, res) => {
  try {
    const allowed = ['enabled', 'provider', 'host', 'port', 'secure', 'user', 'password',
                     'apiKey', 'from', 'feedbackTo', 'reportDefaultTo'];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    if (patch.port !== undefined) {
      const p = Number(patch.port);
      if (!Number.isFinite(p) || p < 1 || p > 65535) return res.status(400).json({ error: 'port 가 유효하지 않습니다.' });
      patch.port = Math.round(p);
    }
    if (patch.feedbackTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.feedbackTo))
      return res.status(400).json({ error: 'feedbackTo 이메일 형식이 올바르지 않습니다.' });
    if (patch.provider && !['smtp', 'resend', 'sendgrid', 'none'].includes(patch.provider))
      return res.status(400).json({ error: 'provider 가 유효하지 않습니다 (smtp / resend / sendgrid / none).' });
    const next = await saveMailSettings(patch);
    reloadMailer();
    res.json({ ok: true, stored: safeMailSettings(next) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

api.post('/admin/mail-settings/test', async (req, res) => {
  const to = (req.body?.to || '').trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))
    return res.status(400).json({ ok: false, error: 'to 이메일 형식이 올바르지 않습니다.' });

  // 임시 patch 로 테스트하려면 먼저 저장 후 reload
  if (req.body?.applyBeforeSend) {
    try {
      await saveMailSettings(req.body.settings || {});
      reloadMailer();
    } catch (e) { /* ignore */ }
  }

  try {
    await sendMail({
      to,
      subject: '[Trend Collector] 메일 설정 테스트',
      text:    '이 메일은 Trend Collector 메일 설정 화면에서 보낸 테스트입니다. 정상적으로 도착했다면 메일 설정이 올바릅니다.',
      html:    `<div style="font-family:'Noto Sans KR',sans-serif; line-height:1.6;">
                  <h3>📨 Trend Collector 메일 설정 테스트</h3>
                  <p>이 메일은 관리자 화면에서 보낸 <b>테스트 메일</b>입니다.</p>
                  <p>정상 도착했다면 메일 설정이 올바릅니다.</p>
                  <hr/><div style="color:#888; font-size:12px;">발송 시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</div>
                </div>`,
    });
    res.json({ ok: true, sentTo: to });
  } catch (e) {
    const active = await getActiveMailConfig().catch(() => null);
    const diag = diagnoseMailError(e, active?.provider || '메일');
    res.status(500).json({
      ok:    false,
      error: e.message || String(e),
      type:  diag.type,
      hint:  diag.hint,
      provider: active?.provider || null,
    });
  }
});

// ── 관리자: 뉴스 소스 설정 ────────────────────
api.get('/admin/source-settings', async (_req, res) => {
  try {
    const stored = await loadSourceSettings();
    const cfg    = await loadConfig();
    const envHas = process.env.NAVER_ENABLED === 'true'
                    && !!process.env.NAVER_CLIENT_ID
                    && !!process.env.NAVER_CLIENT_SECRET;
    res.json({
      stored: safeSourceSettings(stored),
      // 키워드 화면 토글값 (config.json 의 useGoogleNews / useNaverNews)
      preferences: {
        useGoogleNews: cfg.useGoogleNews !== false,
        useNaverNews:  !!cfg.useNaverNews,
      },
      // 실제 활성 상태
      naverConfigured: isNaverConfigured(),
      naverSource:     getNaverSource(),
      envHasNaver:     envHas,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

api.put('/admin/source-settings', async (req, res) => {
  try {
    const b = req.body || {};
    // 1) 자격증명·토글 → sourceSettings.json
    const sourcePatch = {};
    if ('naverEnabled' in b)      sourcePatch.naverEnabled = !!b.naverEnabled;
    if ('naverClientId' in b)     sourcePatch.naverClientId = String(b.naverClientId || '').trim();
    if ('naverClientSecret' in b) sourcePatch.naverClientSecret = String(b.naverClientSecret || '');
    const saved = await saveSourceSettings(sourcePatch);

    // 2) 키워드 화면 사용 토글 → config.json
    const cfgPatch = {};
    if ('useGoogleNews' in b) cfgPatch.useGoogleNews = !!b.useGoogleNews;
    if ('useNaverNews'  in b) cfgPatch.useNaverNews  = !!b.useNaverNews;
    if (Object.keys(cfgPatch).length) await saveConfig(cfgPatch);

    // 3) Naver 모듈 캐시 재구성
    reloadNaver();
    await preloadNaver();

    const cfg = await loadConfig();
    res.json({
      ok: true,
      stored: safeSourceSettings(saved),
      preferences: {
        useGoogleNews: cfg.useGoogleNews !== false,
        useNaverNews:  !!cfg.useNaverNews,
      },
      naverConfigured: isNaverConfigured(),
      naverSource:     getNaverSource(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 관리자: 키워드 검색 테스트 (필터 적용 전 raw 결과) ────
api.post('/admin/test-search', async (req, res) => {
  const keyword = String(req.body?.keyword || '').trim();
  if (!keyword) return res.status(400).json({ error: 'keyword 가 필요합니다.' });
  const useGoogle = req.body?.useGoogle !== false;
  const useNaver  = req.body?.useNaver  !== false;

  try {
    const raw = await fetchSourceRaw(keyword, { useGoogle, useNaver });
    res.json({
      ok: true,
      keyword,
      google: {
        count:  raw.google.articles.length,
        error:  raw.google.error,
        sample: raw.google.articles.slice(0, 10).map(a => ({
          title: a.title, source: a.source, date: a.date, rawDate: a.rawDate, url: a.url,
        })),
      },
      naver: {
        count:  raw.naver.articles.length,
        error:  raw.naver.error,
        sample: raw.naver.articles.slice(0, 10).map(a => ({
          title: a.title, source: a.source, date: a.date, rawDate: a.rawDate, url: a.url,
        })),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 관리자: 검색 시뮬레이션 (다중 키워드 + AND + 기간 필터) ────
api.post('/admin/simulate-search', async (req, res) => {
  try {
    const b = req.body || {};
    let kws = [];
    if (Array.isArray(b.keywords))      kws = b.keywords;
    else if (typeof b.keyword === 'string') kws = b.keyword.split(/[,\n]/);
    kws = kws.map(s => String(s || '').trim()).filter(Boolean);
    const r = await simulateSearch({
      keywords:    kws,
      useGoogle:   b.useGoogle !== false,
      useNaver:    b.useNaver  !== false,
      requireAll:  !!b.requireAll,
      period:      b.period   || '7d',
      fromDate:    b.fromDate || '',
      toDate:      b.toDate   || '',
    });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ error: e.message || String(e) });
  }
});

api.post('/admin/source-settings/test-naver', async (req, res) => {
  try {
    if (!isNaverConfigured()) {
      return res.status(400).json({ ok: false, error: 'Naver API 가 활성화되어 있지 않습니다. 먼저 저장 후 시도하세요.' });
    }
    const keyword = String(req.body?.keyword || '법무부').trim() || '법무부';
    const r = await fetchNaverNews(keyword, { display: 10, sort: 'date', returnRaw: true });
    res.json({
      ok: true,
      keyword,
      total:  r.total || r.items.length,
      count:  r.items.length,
      sample: r.items.slice(0, 5).map(x => ({ title: x.title, source: x.source, date: x.date })),
    });
  } catch (e) {
    const msg = e.message || String(e);
    let hint = '';
    if (/HTTP\s*4(00|01|03)|invalid|unauthor/i.test(msg))     hint = '클라이언트 ID 또는 시크릿이 올바르지 않습니다. 네이버 개발자 센터에서 다시 확인하세요.';
    else if (/HTTP\s*429|quota|limit/i.test(msg))             hint = '일일 호출 한도(25,000건)를 초과했을 수 있습니다.';
    else if (/network|timeout|getaddrinfo|ENOTFOUND|ECONN/i.test(msg)) hint = '네트워크 오류 — 서버에서 외부 호출이 가능한지 확인하세요.';
    res.status(500).json({ ok: false, error: msg, hint });
  }
});

// ── 추적 링크 (보도자료 클릭 카운트) ───────────
api.get('/tracking-links', async (_req, res) => {
  try {
    const items = await listTrackingLinks();
    const totalClicks = items.reduce((s, l) => s + (l.clickCount || 0), 0);
    res.json({ items, count: items.length, totalClicks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

api.post('/tracking-links', async (req, res) => {
  try {
    const link = await createTrackingLink(req.body || {});
    res.json({ ok: true, link });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

api.patch('/tracking-links/:id', async (req, res) => {
  try {
    const link = await updateTrackingLink(req.params.id, req.body || {});
    if (!link) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true, link });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

api.delete('/tracking-links/:id', async (req, res) => {
  try {
    const ok = await deleteTrackingLink(req.params.id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 관리자: 도메인별 본문 추출 실패 통계 ────────
api.get('/admin/extraction-stats', async (_req, res) => {
  try {
    const items = await listReports({ limit: 30 });
    const domainStats = {};
    for (const meta of items) {
      let r;
      try { r = await loadReport(meta.id); } catch { continue; }
      for (const a of r.articles || []) {
        let host = '';
        try { host = new URL(a.resolvedUrl || a.url || '').hostname.replace(/^www\./, ''); } catch {}
        if (!host) continue;
        if (!domainStats[host]) domainStats[host] = { total: 0, success: 0, failed: 0 };
        domainStats[host].total++;
        if (a.extracted) domainStats[host].success++;
        else             domainStats[host].failed++;
      }
    }
    const arr = Object.entries(domainStats)
      .map(([host, s]) => ({ host, ...s, rate: s.total ? Math.round(s.success / s.total * 100) : 0 }))
      .sort((a, b) => b.failed - a.failed);
    res.json({ reportsScanned: items.length, items: arr });
  } catch (e) {
    res.status(500).json({ error: e.message });
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

// ──────────────────────────────────────────────
// 편철 / 분석 — 출력 설정 · 기사 편집 · 프리셋
// ──────────────────────────────────────────────

// 프리셋 목록
api.get('/clipping/presets', (_req, res) => {
  res.json({ presets: PRESET_LIST.map(p => ({ id: p.id, label: p.label, settings: p.settings })) });
});

// 출력 설정 조회 — 저장 안 됐으면 기본값 + 프리셋 반환
api.get('/reports/:id/print-settings', async (req, res) => {
  try {
    const r = await loadReport(req.params.id);
    res.json({
      printSettings: { ...defaultPrintSettings(r), ...(r.printSettings || {}) },
      presets: PRESET_LIST.map(p => ({ id: p.id, label: p.label })),
    });
  } catch { res.status(404).json({ error: 'not found' }); }
});

// 출력 설정 저장 (부분 갱신)
api.put('/reports/:id/print-settings', async (req, res) => {
  try {
    const allowed = ['presetId', 'title', 'dateText', 'issueLabel', 'mainBoxTitle', 'mainBoxSub',
      'extraTag1', 'extraTag2', 'organization', 'sortBy', 'pageLayout', 'columnCount', 'imageMode',
      'showSourceLink', 'includeAnalysisAppendix', 'printOptimized'];
    const patch = {};
    for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
    // 프리셋 적용 옵션
    if (patch.presetId) {
      const preset = getPreset(patch.presetId);
      if (preset && req.body.applyPreset) {
        Object.assign(patch, preset.settings, patch); // 프리셋 + 사용자 입력
      }
    }
    const r = await updateReportPart(req.params.id, { printSettings: patch });
    res.json({ ok: true, printSettings: r.printSettings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 기사 수동 편집값 — 한 건 또는 여러 건 (object map)
api.put('/reports/:id/article-overrides', async (req, res) => {
  try {
    const map = {};
    const allowed = ['title', 'subtitle', 'source', 'pageLabel', 'author', 'publishedAt',
                     'category', 'contentText', 'leadImage', 'includeInClipping', 'printOrder'];
    const incoming = req.body?.overrides || {};
    for (const [aid, patch] of Object.entries(incoming)) {
      const clean = {};
      for (const k of allowed) if (k in (patch || {})) clean[k] = patch[k];
      if (Number.isFinite(Number(clean.printOrder))) clean.printOrder = Number(clean.printOrder);
      map[aid] = clean;
    }
    const opts = { articleOverrides: map };
    if (req.body?.reset) opts.resetArticleOverrides = true;
    if (req.body?.clearArticleId) opts.clearArticleOverrideId = req.body.clearArticleId;
    const r = await updateReportPart(req.params.id, opts);
    res.json({ ok: true, articleOverrides: r.articleOverrides || {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 출력 전 품질 점검
api.get('/reports/:id/quality-check', async (req, res) => {
  try {
    const r = await loadReport(req.params.id);
    res.json(buildQualityReport(r));
  } catch { res.status(404).json({ error: 'not found' }); }
});

app.use('/api', api);

// ──────────────────────────────────────────────
// 편철형 출력물 — HTML / PDF / Word 다운로드 + 미리보기
// ──────────────────────────────────────────────
async function buildClippingHtml(id, query = {}) {
  const r = await loadReport(id);
  const includeAppendix = query.appendix === '1' ? true : query.appendix === '0' ? false : undefined;
  return renderClippingHtml(r, { includeAppendix });
}

app.get('/api/reports/:id/clipping/preview', requireAuth, async (req, res) => {
  try {
    const html = await buildClippingHtml(req.params.id, req.query);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { res.status(500).type('text/html').send(`<pre>${(e.message || '').replace(/</g, '&lt;')}</pre>`); }
});

app.get('/api/reports/:id/clipping/html', requireAuth, async (req, res) => {
  try {
    const html = await buildClippingHtml(req.params.id, req.query);
    const r = await loadReport(req.params.id);
    const dateStr = new Date(r.generatedAt).toISOString().slice(0, 10);
    const fileName = `clipping-${dateStr}.html`;
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.set('Cache-Control', 'no-store');
    res.send(html);
  } catch (e) { res.status(500).type('text/html').send(`<pre>${(e.message || '').replace(/</g, '&lt;')}</pre>`); }
});

app.get('/api/reports/:id/clipping/pdf', requireAuth, async (req, res) => {
  try {
    const html = await buildClippingHtml(req.params.id, req.query);
    const buf = await htmlToPdf(html);
    const r = await loadReport(req.params.id);
    const dateStr = new Date(r.generatedAt).toISOString().slice(0, 10);
    const fileName = `clipping-${dateStr}.pdf`;
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `${req.query.preview ? 'inline' : 'attachment'}; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.set('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) {
    console.error('[clipping:pdf] error:', e.stack || e.message);
    const status = e.code === 'CHROME_NOT_FOUND' ? 503 : 500;
    res.status(status).type('text/html; charset=utf-8').send(`<pre style="font-family:'Noto Sans KR'; padding:20px; color:#c53030;">편철 PDF 생성 실패\n\n${(e.message || '').replace(/</g, '&lt;')}</pre>`);
  }
});

app.get('/api/reports/:id/clipping/word', requireAuth, async (req, res) => {
  try {
    const r = await loadReport(req.params.id);
    const buf = await clippingToDocx(r);
    const dateStr = new Date(r.generatedAt).toISOString().slice(0, 10);
    const fileName = `clipping-${dateStr}.docx`;
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.set('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.set('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) {
    console.error('[clipping:word] error:', e.stack || e.message);
    res.status(500).type('text/html').send(`<pre>${(e.message || '').replace(/</g, '&lt;')}</pre>`);
  }
});

// ──────────────────────────────────────────────
// 분석형 보고서 — HTML / Word / Excel
// ──────────────────────────────────────────────
async function buildAnalysisHtml(id) {
  const r = await loadReport(id);
  const cfg = await loadConfig();
  const tlinks = await listTrackingLinks();
  const tracking = {
    totalLinks: tlinks.length,
    totalClicks: tlinks.reduce((s, l) => s + (l.clickCount || 0), 0),
    items: tlinks,
  };
  return renderAnalysisHtml({ ...r, reportMeta: cfg.reportMeta }, { reportMeta: cfg.reportMeta, tracking });
}

app.get('/api/reports/:id/analysis/preview', requireAuth, async (req, res) => {
  try {
    const html = await buildAnalysisHtml(req.params.id);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { res.status(500).type('text/html').send(`<pre>${(e.message || '').replace(/</g, '&lt;')}</pre>`); }
});

app.get('/api/reports/:id/analysis/html', requireAuth, async (req, res) => {
  try {
    const html = await buildAnalysisHtml(req.params.id);
    const r = await loadReport(req.params.id);
    const dateStr = new Date(r.generatedAt).toISOString().slice(0, 10);
    const fileName = `analysis-${dateStr}.html`;
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.set('Cache-Control', 'no-store');
    res.send(html);
  } catch (e) { res.status(500).type('text/html').send(`<pre>${(e.message || '').replace(/</g, '&lt;')}</pre>`); }
});

app.get('/api/reports/:id/analysis/word', requireAuth, async (req, res) => {
  try {
    const r = await loadReport(req.params.id);
    const cfg = await loadConfig();
    const tlinks = await listTrackingLinks();
    const trackingTotals = {
      totalLinks:  tlinks.length,
      totalClicks: tlinks.reduce((s, l) => s + (l.clickCount || 0), 0),
      items: tlinks,
    };
    const buf = await analysisToDocx(r, { reportMeta: cfg.reportMeta, trackingTotals });
    const dateStr = new Date(r.generatedAt).toISOString().slice(0, 10);
    const fileName = `analysis-${dateStr}.docx`;
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.set('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.set('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) {
    console.error('[analysis:word] error:', e.stack || e.message);
    res.status(500).type('text/html').send(`<pre>${(e.message || '').replace(/</g, '&lt;')}</pre>`);
  }
});

app.get('/api/reports/:id/analysis/excel', requireAuth, async (req, res) => {
  try {
    const r = await loadReport(req.params.id);
    const tlinks = await listTrackingLinks();
    const tracking = {
      totalLinks:  tlinks.length,
      totalClicks: tlinks.reduce((s, l) => s + (l.clickCount || 0), 0),
      items: tlinks,
    };
    const buf = await reportToXlsx(r, { tracking });
    const dateStr = new Date(r.generatedAt).toISOString().slice(0, 10);
    const fileName = `analysis-${dateStr}.xlsx`;
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.set('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) {
    console.error('[analysis:excel] error:', e.stack || e.message);
    res.status(500).type('text/html').send(`<pre>${(e.message || '').replace(/</g, '&lt;')}</pre>`);
  }
});

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
  let working = orig;
  let suffix = '';
  if (opts.filter === 'negative') {
    const keep = (orig.articles || []).filter(a =>
      a.sentiment?.label === '부정' || a.priority === '긴급' || a.priority === '주의'
    );
    working = { ...orig, articles: keep, title: (orig.title || '') + ' (부정 이슈)' };
    suffix = '-negative';
  }
  // 이미지를 서버에서 다운로드 → data:base64 로 변환해 PDF 에 임베드
  const includeImages = orig.includeImages !== false;
  const { report, stats } = await embedImagesInReport(working, { includeImages });
  console.log(`[pdf] image embed: ${stats.succeeded}/${stats.total} succeeded, ${stats.articlesWithImage}/${stats.articleTotal} articles have image`);
  const buf     = await htmlToPdf(renderReportHtml(report));
  const dateStr = new Date(report.generatedAt).toISOString().slice(0, 16).replace(/[-T:]/g, '').slice(0, 12);
  return { buf, fileName: `trend-report-${dateStr}${suffix}.pdf`, imageStats: stats };
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
    const status = e.code === 'CHROME_NOT_FOUND' ? 503 : 500;
    res.status(status).type('text/html; charset=utf-8').send(
      `<pre style="font-family:'Noto Sans KR',sans-serif; padding:20px; color:#c53030;">PDF 미리보기 생성 실패\n\n${(e.message || String(e)).replace(/</g, '&lt;')}${e.detail ? `\n\n원본 오류: ${e.detail.replace(/</g, '&lt;')}` : ''}</pre>`
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
    const status = e.code === 'CHROME_NOT_FOUND' ? 503 : 500;
    res.status(status).type('text/html; charset=utf-8').send(
      `<pre style="font-family:'Noto Sans KR',sans-serif; padding:20px; color:#c53030;">PDF 다운로드 생성 실패\n\n${(e.message || String(e)).replace(/</g, '&lt;')}${e.detail ? `\n\n원본 오류: ${e.detail.replace(/</g, '&lt;')}` : ''}</pre>`
    );
  }
});

// ── 호환 — 기존 /pdf 는 download 로 ─────────────
app.get('/api/reports/:id/pdf', requireAuth, (req, res) => {
  res.redirect(302, `/api/reports/${encodeURIComponent(req.params.id)}/pdf/download`);
});

// ── 보고서 — Word (.docx) 다운로드 (PDF 대체) ────
app.get('/api/reports/:id/word/download', requireAuth, async (req, res) => {
  try {
    const report = await loadReport(req.params.id);
    const cfg    = await loadConfig();
    const tlinks = await listTrackingLinks();
    const trackingTotals = {
      totalLinks:  tlinks.length,
      totalClicks: tlinks.reduce((s, l) => s + (l.clickCount || 0), 0),
      items:       tlinks,
    };
    const buf    = await reportToDocx(report, { reportMeta: cfg.reportMeta, trackingTotals });
    const dateStr = new Date(report.generatedAt).toISOString().slice(0, 16).replace(/[-T:]/g, '').slice(0, 12);
    const fileName = `trend-report-${dateStr}.docx`;
    res.set('Content-Type',        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.set('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.set('Cache-Control',       'no-store');
    res.send(buf);
  } catch (e) {
    console.error('[word:download] generation error:', e.stack || e.message);
    res.status(500).type('text/html; charset=utf-8').send(
      `<pre style="font-family:'Noto Sans KR',sans-serif; padding:20px; color:#c53030;">Word 다운로드 생성 실패\n\n${(e.message || String(e)).replace(/</g, '&lt;')}</pre>`
    );
  }
});

// ── 보고서 — HTML 다운로드 (브라우저 열고 Ctrl+P) ─
app.get('/api/reports/:id/html-download', requireAuth, async (req, res) => {
  try {
    const orig = await loadReport(req.params.id);
    // 이미지를 base64 로 임베드해서 오프라인에서도 열리게
    const includeImages = orig.includeImages !== false;
    const { report } = await embedImagesInReport(orig, { includeImages });
    const html = renderReportHtml(report);
    const dateStr = new Date(orig.generatedAt).toISOString().slice(0, 16).replace(/[-T:]/g, '').slice(0, 12);
    const fileName = `trend-report-${dateStr}.html`;
    res.set('Content-Type',        'text/html; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.set('Cache-Control',       'no-store');
    res.send(html);
  } catch (e) {
    console.error('[html:download] generation error:', e.stack || e.message);
    res.status(500).type('text/html; charset=utf-8').send(
      `<pre style="font-family:'Noto Sans KR',sans-serif; padding:20px; color:#c53030;">HTML 다운로드 생성 실패\n\n${(e.message || String(e)).replace(/</g, '&lt;')}</pre>`
    );
  }
});

// ── 보고서 — Excel (.xlsx) 다운로드 (홍보 실적) ───
app.get('/api/reports/:id/excel/download', requireAuth, async (req, res) => {
  try {
    const report = await loadReport(req.params.id);
    const tlinks = await listTrackingLinks();
    const tracking = {
      totalLinks:  tlinks.length,
      totalClicks: tlinks.reduce((s, l) => s + (l.clickCount || 0), 0),
      items:       tlinks,
    };
    const buf    = await reportToXlsx(report, { tracking });
    const dateStr = new Date(report.generatedAt).toISOString().slice(0, 16).replace(/[-T:]/g, '').slice(0, 12);
    const fileName = `trend-report-${dateStr}.xlsx`;
    res.set('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.set('Cache-Control',       'no-store');
    res.send(buf);
  } catch (e) {
    console.error('[excel:download] generation error:', e.stack || e.message);
    res.status(500).type('text/html; charset=utf-8').send(
      `<pre style="font-family:'Noto Sans KR',sans-serif; padding:20px; color:#c53030;">Excel 다운로드 생성 실패\n\n${(e.message || String(e)).replace(/</g, '&lt;')}</pre>`
    );
  }
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
  // UI 메일 설정 / 뉴스 소스 캐시 미리 로드
  preloadMailer().catch(() => {});
  preloadNaver().catch(() => {});
  startScheduler({ baseUrl: process.env.BASE_URL });
});

// 종료 시 Puppeteer 브라우저 정리
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    try { await shutdownBrowser(); } catch {}
    process.exit(0);
  });
}
