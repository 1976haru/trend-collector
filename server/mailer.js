// ─────────────────────────────────────────────
// mailer.js — Provider 추상화 메일 발송
//   provider:
//     'smtp'     — nodemailer (Render Free 플랜은 포트 차단 가능성)
//     'resend'   — Resend API (https://api.resend.com/emails)
//     'sendgrid' — SendGrid API (https://api.sendgrid.com/v3/mail/send)
//     'none'     — 저장만, 발송 안 함
//
// 우선순위: data/mail.json (UI 설정) → 환경변수
// SMTP 가 실패해도 앱 자체는 정상 동작해야 한다 — 호출 측에서 try/catch 처리.
// ─────────────────────────────────────────────

import nodemailer from 'nodemailer';
import { loadMailSettings } from './store.js';

let cachedTransporter = null;
let cachedConfig = null;

async function getActiveConfig() {
  const stored = await loadMailSettings();

  // 1) UI 저장값 — provider 가 'none' 이 아니면서 enabled 면 우선
  if (stored.enabled && stored.provider && stored.provider !== 'none') {
    if (stored.provider === 'smtp' && stored.host) {
      return {
        source:   'ui',
        provider: 'smtp',
        host:     stored.host,
        port:     Number(stored.port || 587),
        secure:   !!stored.secure,
        user:     stored.user || undefined,
        pass:     stored.password || undefined,
        from:     stored.from || stored.user || '',
        feedbackTo: stored.feedbackTo || '',
      };
    }
    if (stored.provider === 'resend' && stored.apiKey) {
      return {
        source:   'ui',
        provider: 'resend',
        apiKey:   stored.apiKey,
        from:     stored.from || '',
        feedbackTo: stored.feedbackTo || '',
      };
    }
    if (stored.provider === 'sendgrid' && stored.apiKey) {
      return {
        source:   'ui',
        provider: 'sendgrid',
        apiKey:   stored.apiKey,
        from:     stored.from || '',
        feedbackTo: stored.feedbackTo || '',
      };
    }
  }

  // 2) 환경변수 (SMTP)
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT || 587);
    return {
      source:   'env',
      provider: 'smtp',
      host:     process.env.SMTP_HOST,
      port,
      secure:   port === 465,
      user:     process.env.SMTP_USER || undefined,
      pass:     process.env.SMTP_PASS || undefined,
      from:     process.env.SMTP_FROM || process.env.SMTP_USER || '',
      feedbackTo: process.env.FEEDBACK_TO_EMAIL || '',
    };
  }
  // 3) 환경변수 (Resend)
  if (process.env.RESEND_API_KEY) {
    return {
      source:   'env',
      provider: 'resend',
      apiKey:   process.env.RESEND_API_KEY,
      from:     process.env.MAIL_FROM || process.env.SMTP_FROM || '',
      feedbackTo: process.env.FEEDBACK_TO_EMAIL || '',
    };
  }
  // 4) 환경변수 (SendGrid)
  if (process.env.SENDGRID_API_KEY) {
    return {
      source:   'env',
      provider: 'sendgrid',
      apiKey:   process.env.SENDGRID_API_KEY,
      from:     process.env.MAIL_FROM || process.env.SMTP_FROM || '',
      feedbackTo: process.env.FEEDBACK_TO_EMAIL || '',
    };
  }
  return null;
}

async function buildTransporter() {
  const cfg = await getActiveConfig();
  if (!cfg) return { transporter: null, cfg: null };
  // SMTP 일 때만 transporter 객체를 만든다 — API provider 는 fetch 로 직접 호출.
  if (cfg.provider !== 'smtp') return { transporter: null, cfg };
  const transporter = nodemailer.createTransport({
    host:    cfg.host,
    port:    cfg.port,
    secure:  cfg.secure,
    auth:    cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    // 30s 타임아웃 — Render Free 차단 시 빠르게 실패하도록
    connectionTimeout: 30_000,
    greetingTimeout:   30_000,
    socketTimeout:     45_000,
  });
  return { transporter, cfg };
}

async function ensureTransporter() {
  if (cachedConfig) return { transporter: cachedTransporter, cfg: cachedConfig };
  const r = await buildTransporter();
  cachedTransporter = r.transporter;
  cachedConfig      = r.cfg;
  return r;
}

export function reloadMailer() {
  cachedTransporter = null;
  cachedConfig      = null;
}

export async function getActiveMailConfig() {
  return await getActiveConfig();
}

/** 메일 발송이 이용 가능한 상태인지 — sync (env 또는 캐시된 UI 설정). */
export function isConfigured() {
  if (cachedConfig) return true;
  return !!process.env.SMTP_HOST || !!process.env.RESEND_API_KEY || !!process.env.SENDGRID_API_KEY;
}

/** 서버 시작 시 한 번 호출 — UI 저장값으로 cachedConfig 를 채움. */
export async function preloadMailer() {
  try {
    const r = await buildTransporter();
    cachedTransporter = r.transporter;
    cachedConfig      = r.cfg;
  } catch {}
}

// ── 단순 텍스트 변환 (HTML → plain) — Resend/SendGrid 대체 본문용 ──
function htmlToPlain(html = '') {
  return String(html).replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Resend API 호출 ─────────────────────────
async function sendViaResend(cfg, { to, subject, html, text, attachments = [] }) {
  if (!cfg.apiKey) throw new Error('Resend API 키가 설정되지 않았습니다.');
  const body = {
    from:    cfg.from || 'no-reply@example.com',
    to,
    subject,
    html,
    text:    text || htmlToPlain(html),
  };
  if (attachments.length) {
    body.attachments = attachments.map(a => ({
      filename: a.filename,
      content:  Buffer.isBuffer(a.content) ? a.content.toString('base64')
              : typeof a.content === 'string' ? Buffer.from(a.content).toString('base64')
              : '',
    }));
  }
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 400); } catch {}
    const e = new Error(`Resend HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
    e.code = `RESEND_${res.status}`;
    throw e;
  }
  return await res.json().catch(() => ({}));
}

// ── SendGrid API 호출 ───────────────────────
async function sendViaSendGrid(cfg, { to, subject, html, text, attachments = [] }) {
  if (!cfg.apiKey) throw new Error('SendGrid API 키가 설정되지 않았습니다.');
  const body = {
    personalizations: [{ to: to.map(addr => ({ email: addr })) }],
    from:    { email: cfg.from || 'no-reply@example.com' },
    subject,
    content: [
      { type: 'text/plain', value: text || htmlToPlain(html) || ' ' },
      { type: 'text/html',  value: html || '<p></p>' },
    ],
  };
  if (attachments.length) {
    body.attachments = attachments.map(a => ({
      filename: a.filename,
      type:     a.contentType || 'application/octet-stream',
      content:  Buffer.isBuffer(a.content) ? a.content.toString('base64')
              : typeof a.content === 'string' ? Buffer.from(a.content).toString('base64')
              : '',
    }));
  }
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 400); } catch {}
    const e = new Error(`SendGrid HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
    e.code = `SENDGRID_${res.status}`;
    throw e;
  }
  return { ok: true };
}

// ── 통합 발송 ───────────────────────────────
export async function sendMail({ to, subject, html, text, attachments = [] } = {}) {
  if (!Array.isArray(to)) to = [to];
  to = to.filter(Boolean);
  if (!to.length) throw new Error('수신자가 없습니다.');
  const { transporter, cfg } = await ensureTransporter();
  if (!cfg) {
    const e = new Error('메일 발송이 설정되지 않았습니다 (관리 → 메일 설정 또는 환경변수 SMTP_HOST / RESEND_API_KEY / SENDGRID_API_KEY 확인).');
    e.code = 'NO_PROVIDER';
    throw e;
  }
  if (cfg.provider === 'smtp') {
    if (!transporter) throw new Error('SMTP transporter 가 초기화되지 않았습니다.');
    return transporter.sendMail({
      from:        cfg.from || cfg.user,
      to:          to.join(','),
      subject,
      html,
      text:        text || htmlToPlain(html),
      attachments,
    });
  }
  if (cfg.provider === 'resend')   return sendViaResend(cfg, { to, subject, html, text, attachments });
  if (cfg.provider === 'sendgrid') return sendViaSendGrid(cfg, { to, subject, html, text, attachments });
  // 'none' — 저장만 — 발송 시도하면 즉시 실패시킨다 (호출 측에서 try/catch)
  const e = new Error('메일 발송 방식이 "저장만"으로 설정되어 있어 실제 발송하지 않습니다.');
  e.code = 'PROVIDER_NONE';
  throw e;
}

// ── 사용자 친화 오류 진단 — 테스트 메일 라우트에서 사용 ──
export function diagnoseMailError(err, providerHint) {
  const raw = err?.message || String(err || '');
  const code = err?.code || '';
  const out = { type: 'unknown', message: raw, hint: '' };

  if (code === 'NO_PROVIDER' || /설정이 .*되지 않/.test(raw)) {
    out.type = 'missing-config';
    out.hint = 'SMTP 호스트/포트 또는 API 키가 비어 있습니다. 메일 설정을 다시 저장해 주세요.';
    return out;
  }
  if (code === 'PROVIDER_NONE') {
    out.type = 'provider-none';
    out.hint = '발송 방식이 "저장만"으로 설정되어 있습니다. SMTP / Resend / SendGrid 중 하나를 선택하세요.';
    return out;
  }
  // SMTP 관련 — Connection timeout / 차단
  if (/ETIMEDOUT|ECONNECTION|connection.*timed?\s*out|Greeting never received/i.test(raw)) {
    out.type = 'connection-timeout';
    out.hint = '서버에서 SMTP 포트에 연결하지 못했습니다. Render 무료 플랜 등 일부 호스팅은 SMTP 포트(25/465/587)가 차단됩니다. 메일 API 방식(Resend/SendGrid) 또는 유료 플랜 사용을 권장합니다.';
    return out;
  }
  if (/ENOTFOUND|EAI_AGAIN|EHOSTUNREACH/i.test(raw)) {
    out.type = 'dns-or-host';
    out.hint = 'SMTP 호스트 이름을 찾을 수 없습니다. 호스트 주소(예: smtp.naver.com)를 확인하세요.';
    return out;
  }
  if (/ECONNREFUSED/i.test(raw)) {
    out.type = 'refused';
    out.hint = '서버가 연결을 거부했습니다. 포트(465 또는 587)와 secure 설정을 확인하세요.';
    return out;
  }
  if (/EAUTH|535|invalid login|authentication|Username and Password not accepted/i.test(raw)) {
    out.type = 'auth';
    out.hint = '메일 아이디 또는 비밀번호가 올바르지 않습니다. 네이버는 "메일 환경설정 → POP3/IMAP" 에서 별도 비밀번호를 발급받아야 합니다.';
    return out;
  }
  if (/TLS|SSL|certificate|self.signed|wrong version number/i.test(raw)) {
    out.type = 'tls';
    out.hint = '보안 연결 설정을 확인하세요. 네이버 SMTP 는 587 포트 + secure=false (STARTTLS) 가 필요하며, 465 포트는 secure=true 입니다.';
    return out;
  }
  if (/RESEND_4\d\d/i.test(code) || /resend/i.test(raw)) {
    out.type = 'resend';
    out.hint = 'Resend API 호출이 거부되었습니다. API 키가 유효한지, FROM 주소가 인증된 도메인인지 확인하세요.';
    return out;
  }
  if (/SENDGRID_4\d\d/i.test(code) || /sendgrid/i.test(raw)) {
    out.type = 'sendgrid';
    out.hint = 'SendGrid API 호출이 거부되었습니다. API 키 권한과 발신자(Single Sender / Domain) 인증 상태를 확인하세요.';
    return out;
  }
  if (providerHint) out.hint = `${providerHint} 발송 중 알 수 없는 오류가 발생했습니다.`;
  return out;
}
