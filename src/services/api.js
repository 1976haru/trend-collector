// ─────────────────────────────────────────────
// api.js — 백엔드 REST API 호출 (쿠키 세션 기반)
// ─────────────────────────────────────────────

async function request(method, url, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const msg = (data && data.error) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body   = data;
    throw err;
  }
  return data;
}

// 인증
export const checkAuth = ()         => request('GET',  '/api/auth/me');
export const login     = (password) => request('POST', '/api/auth/login', { password });
export const logout    = ()         => request('POST', '/api/auth/logout');

// 헬스 (무인증)
export const health    = ()         => request('GET',  '/api/health');

// 설정
export const getConfig = ()         => request('GET',  '/api/config');
export const putConfig = (patch)    => request('PUT',  '/api/config', patch);

// 수집·리포트
export const collectNow  = ()       => request('POST', '/api/collect');
export const listReports = ()       => request('GET',  '/api/reports');
export const getReport   = (id)     => request('GET',  `/api/reports/${encodeURIComponent(id)}`);

export function reportHtmlUrl(id) {
  return `/api/reports/${encodeURIComponent(id)}/html`;
}

export function emailReport(id, body = {}) {
  return request('POST', `/api/reports/${encodeURIComponent(id)}/email`, body);
}
