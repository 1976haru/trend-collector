// ─────────────────────────────────────────────
// auth.js — ADMIN_PASSWORD 기반 단일 비밀번호 인증
// HMAC 으로 서명한 쿠키 토큰을 사용. 비밀번호 변경 시 모든 세션 자동 무효화.
// ─────────────────────────────────────────────

import express from 'express';
import crypto from 'node:crypto';

const router = express.Router();

const COOKIE_NAME = 'tc_session';
const MAX_AGE_MS  = 7 * 24 * 60 * 60 * 1000; // 7일

function secret() {
  const v = process.env.ADMIN_PASSWORD;
  if (!v) throw new Error('ADMIN_PASSWORD not configured');
  return v;
}

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  let expected;
  try { expected = crypto.createHmac('sha256', secret()).update(data).digest('base64url'); }
  catch { return null; }
  // timing-safe compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (Date.now() - (payload.iat || 0) > MAX_AGE_MS) return null;
    return payload;
  } catch { return null; }
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (verify(token)) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

router.post('/login', (req, res) => {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD 가 서버에 설정되지 않았습니다.' });
  }
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ error: 'password required' });
  }
  // 비밀번호 자체를 timing-safe 비교
  const a = Buffer.from(password);
  const b = Buffer.from(process.env.ADMIN_PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
  }
  const token = sign({ iat: Date.now() });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   MAX_AGE_MS,
    path:     '/',
  });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ authenticated: !!verify(req.cookies?.[COOKIE_NAME]) });
});

export default router;
