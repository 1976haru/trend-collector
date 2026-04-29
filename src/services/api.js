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
export function reportPdfPreviewUrl(id)  { return `/api/reports/${encodeURIComponent(id)}/pdf/preview`; }
export function reportPdfDownloadUrl(id) { return `/api/reports/${encodeURIComponent(id)}/pdf/download`; }
export function reportHtmlDebugUrl(id)   { return `/api/reports/${encodeURIComponent(id)}/html-debug`; }
// 호환 alias
export function reportPdfUrl(id) { return reportPdfDownloadUrl(id); }

// ── PDF fetch+blob 으로 안정적으로 받기 ─────────
async function fetchPdfBlob(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch {}
    if (res.status === 401) {
      throw Object.assign(new Error('인증이 만료되었습니다. 다시 로그인하세요.'), { status: 401 });
    }
    throw Object.assign(new Error(`PDF 생성 실패 (HTTP ${res.status}). ${detail}`), { status: res.status });
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('application/pdf')) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch {}
    throw new Error(`PDF 가 아닌 응답이 반환되었습니다 (${ct}). ${detail}`);
  }
  const blob = await res.blob();
  // 첫 4byte = %PDF 검증
  const head = await blob.slice(0, 4).text();
  if (head !== '%PDF') throw new Error(`PDF 매직 바이트 오류: ${JSON.stringify(head)}`);
  // 파일명 추출 (Content-Disposition)
  const cd = res.headers.get('content-disposition') || '';
  const m  = cd.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
  const filename = m ? decodeURIComponent(m[1] || m[2] || '') : 'trend-report.pdf';
  return { blob, filename };
}

export async function downloadReportPdf(id) {
  const { blob, filename } = await fetchPdfBlob(reportPdfDownloadUrl(id));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { filename, size: blob.size };
}

export async function previewReportPdf(id) {
  const { blob, filename } = await fetchPdfBlob(reportPdfPreviewUrl(id));
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    URL.revokeObjectURL(url);
    throw new Error('팝업이 차단되어 미리보기 창을 열 수 없습니다. 팝업을 허용한 뒤 다시 시도하세요.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  return { filename };
}

export function emailReport(id, body = {}) {
  return request('POST', `/api/reports/${encodeURIComponent(id)}/email`, body);
}

// 기능 개선 제안 (인증 무관)
export function submitFeedback(payload) {
  return request('POST', '/api/feedback', payload);
}

// 본문/이미지 재추출
export function reextractReport(id, body = {}) {
  return request('POST', `/api/reports/${encodeURIComponent(id)}/reextract`, body);
}
export function reextractArticle(id, articleId) {
  return request('POST', `/api/reports/${encodeURIComponent(id)}/articles/${encodeURIComponent(articleId)}/reextract`, {});
}

// 관리자
export const listFeedback         = ()           => request('GET',   '/api/admin/feedback');
export const markFeedbackRead     = (id, read=true) => request('PATCH', `/api/admin/feedback/${encodeURIComponent(id)}/read`, { read });
export const getExtractionStats   = ()           => request('GET',   '/api/admin/extraction-stats');

// 관리자: 메일 설정
export const getMailSettings      = ()           => request('GET',  '/api/admin/mail-settings');
export const saveMailSettingsApi  = (patch)      => request('PUT',  '/api/admin/mail-settings', patch);
export const sendTestMail         = (to, settings, applyBeforeSend) =>
  request('POST', '/api/admin/mail-settings/test', { to, settings, applyBeforeSend });

// 부정 이슈 전용 PDF (filter=negative)
export async function downloadNegativePdf(id) {
  const { blob, filename } = await fetchPdfBlob(reportPdfDownloadUrl(id) + '?filter=negative');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { filename, size: blob.size };
}
