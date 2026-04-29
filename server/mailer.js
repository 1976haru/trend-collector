// ─────────────────────────────────────────────
// mailer.js — nodemailer SMTP 발송
// ─────────────────────────────────────────────

import nodemailer from 'nodemailer';

let cached;

function buildTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) throw new Error('SMTP_HOST not configured');
  const port   = Number(SMTP_PORT || 587);
  const secure = port === 465;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
}

export function getTransporter() {
  cached ||= buildTransporter();
  return cached;
}

export function isConfigured() {
  return !!process.env.SMTP_HOST;
}

export async function sendMail({ to, subject, html, text }) {
  if (!Array.isArray(to)) to = [to];
  to = to.filter(Boolean);
  if (!to.length) throw new Error('수신자가 없습니다.');
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!from) throw new Error('SMTP_FROM (또는 SMTP_USER) 가 설정되지 않았습니다.');
  const tx = getTransporter();
  return tx.sendMail({ from, to: to.join(','), subject, html, text });
}
