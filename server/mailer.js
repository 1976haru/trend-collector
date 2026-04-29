// ─────────────────────────────────────────────
// mailer.js — nodemailer SMTP 발송
// 우선순위: data/mail.json (UI 설정) → 환경변수
// 설정 변경 시 reloadMailer() 로 transporter 캐시 초기화.
// ─────────────────────────────────────────────

import nodemailer from 'nodemailer';
import { loadMailSettings } from './store.js';

let cachedTransporter = null;
let cachedConfig = null;

async function getActiveConfig() {
  const stored = await loadMailSettings();
  // 1) UI 저장값이 enabled + host 있으면 우선
  if (stored.enabled && stored.host) {
    return {
      source:   'ui',
      host:     stored.host,
      port:     Number(stored.port || 587),
      secure:   !!stored.secure,
      user:     stored.user || undefined,
      pass:     stored.password || undefined,
      from:     stored.from || stored.user || '',
      feedbackTo: stored.feedbackTo || '',
    };
  }
  // 2) 환경변수
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT || 587);
    return {
      source:   'env',
      host:     process.env.SMTP_HOST,
      port,
      secure:   port === 465,
      user:     process.env.SMTP_USER || undefined,
      pass:     process.env.SMTP_PASS || undefined,
      from:     process.env.SMTP_FROM || process.env.SMTP_USER || '',
      feedbackTo: process.env.FEEDBACK_TO_EMAIL || '',
    };
  }
  return null;
}

async function buildTransporter() {
  const cfg = await getActiveConfig();
  if (!cfg) return { transporter: null, cfg: null };
  const transporter = nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    auth:   cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  return { transporter, cfg };
}

async function ensureTransporter() {
  if (cachedTransporter && cachedConfig) return { transporter: cachedTransporter, cfg: cachedConfig };
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

/** SMTP 가 이용 가능한 상태인지 — sync (env 또는 캐시된 UI 설정). */
export function isConfigured() {
  return !!process.env.SMTP_HOST || !!cachedConfig;
}

/** 서버 시작 시 한 번 호출 — UI 저장값으로 cachedConfig 를 채움. */
export async function preloadMailer() {
  try {
    const r = await buildTransporter();
    cachedTransporter = r.transporter;
    cachedConfig      = r.cfg;
  } catch {}
}

export async function sendMail({ to, subject, html, text, attachments = [] } = {}) {
  if (!Array.isArray(to)) to = [to];
  to = to.filter(Boolean);
  if (!to.length) throw new Error('수신자가 없습니다.');
  const { transporter, cfg } = await ensureTransporter();
  if (!transporter) throw new Error('SMTP 가 설정되지 않았습니다 (관리 → 메일 설정 또는 환경변수 SMTP_HOST 확인).');
  return transporter.sendMail({
    from:        cfg.from || cfg.user,
    to:          to.join(','),
    subject,
    html,
    text,
    attachments,
  });
}
