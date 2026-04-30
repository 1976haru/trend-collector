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
export function reportWordDownloadUrl(id)  { return `/api/reports/${encodeURIComponent(id)}/word/download`; }
export function reportHtmlDownloadUrl(id)  { return `/api/reports/${encodeURIComponent(id)}/html-download`; }
export function reportExcelDownloadUrl(id) { return `/api/reports/${encodeURIComponent(id)}/excel/download`; }
export function reportHtmlDebugUrl(id)   { return `/api/reports/${encodeURIComponent(id)}/html-debug`; }
// 호환 alias
export function reportPdfUrl(id) { return reportPdfDownloadUrl(id); }

// ── PDF fetch+blob 으로 안정적으로 받기 ─────────
// 서버는 PDF 실패 시 X-PDF-Error-Code 헤더 + Accept: application/json 시 JSON 본문을 반환한다.
// 여기서는 JSON 을 우선 요청하여 friendly 한국어 메시지를 그대로 사용자에게 표시한다.
async function fetchPdfBlob(url) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Accept': 'application/pdf, application/json' },
  });
  if (!res.ok) {
    const code = res.headers.get('x-pdf-error-code') || '';
    let payload = null, detail = '';
    try {
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) payload = await res.json();
      else                                  detail = (await res.text()).slice(0, 400);
    } catch {}
    if (res.status === 401) {
      throw Object.assign(new Error('인증이 만료되었습니다. 다시 로그인하세요.'), { status: 401 });
    }
    const msg = payload?.message
              || (code === 'PDF_TIMEOUT' ? 'PDF 생성 시간이 초과되었습니다. 빠른 PDF / Word / HTML 로 대신 받아주세요.' : null)
              || (code === 'CHROME_NOT_FOUND' ? 'PDF 엔진(Chrome) 이 서버에 설치되지 않았습니다.' : null)
              || `PDF 생성 실패 (HTTP ${res.status}). ${detail}`;
    throw Object.assign(new Error(msg), {
      status: res.status,
      code: payload?.code || code || 'PDF_FAILED',
      fallback: payload?.fallback || ['fast-pdf', 'word', 'html', 'excel'],
    });
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
  const mode = res.headers.get('x-pdf-mode') || '';   // '' | 'fast' | 'auto-fast'
  return { blob, filename, mode };
}

export async function downloadReportPdf(id, opts = {}) {
  const q = opts.fast === true ? '?fast=1' : opts.fast === false ? '?fast=0' : '';
  const { blob, filename, mode } = await fetchPdfBlob(reportPdfDownloadUrl(id) + q);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { filename, size: blob.size, mode };
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

// 기사 제외 / 복원 / 일괄 / 재분석
export function excludeArticle(id, articleId, reason) {
  return request('PATCH', `/api/reports/${encodeURIComponent(id)}/articles/${encodeURIComponent(articleId)}/exclude`, { reason });
}
export function restoreArticle(id, articleId) {
  return request('PATCH', `/api/reports/${encodeURIComponent(id)}/articles/${encodeURIComponent(articleId)}/restore`, {});
}
export function bulkExcludeArticles(id, articleIds, reason) {
  return request('PATCH', `/api/reports/${encodeURIComponent(id)}/articles/bulk-exclude`, { articleIds, reason });
}
export function bulkRestoreArticles(id, articleIds) {
  return request('PATCH', `/api/reports/${encodeURIComponent(id)}/articles/bulk-restore`, { articleIds });
}
export function reanalyzeReport(id) {
  return request('POST', `/api/reports/${encodeURIComponent(id)}/reanalyze`);
}
export function getExclusionCandidates(id) {
  return request('GET', `/api/reports/${encodeURIComponent(id)}/exclusion-candidates`);
}
export function getAuditLog(id) {
  return request('GET', `/api/reports/${encodeURIComponent(id)}/audit-log`);
}
export function getExclusionStats() {
  return request('GET', '/api/admin/exclusion-stats');
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

// 관리자: 뉴스 소스 설정
export const getSourceSettings    = ()           => request('GET',  '/api/admin/source-settings');
export const saveSourceSettings   = (patch)      => request('PUT',  '/api/admin/source-settings', patch);
export const testNaver            = (keyword)    => request('POST', '/api/admin/source-settings/test-naver', { keyword });
export const getNaverEnvDiagnostics = ()         => request('GET',  '/api/admin/naver-env-diagnostics');

// YouTube 관심도 / 영상 반응
export const getYoutubeInsights = (keyword, period = '30d') =>
  request('GET', `/api/youtube/insights?keyword=${encodeURIComponent(keyword)}&period=${encodeURIComponent(period)}`);
export const testSearch           = (body)       => request('POST', '/api/admin/test-search', body);
export const simulateSearch       = (body)       => request('POST', '/api/admin/simulate-search', body);

// 사용자 지정 뉴스 소스
export const listCustomSources   = ()           => request('GET',    '/api/admin/custom-sources');
export const addCustomSource     = (body)       => request('POST',   '/api/admin/custom-sources', body);
export const updateCustomSource  = (id, patch)  => request('PATCH',  `/api/admin/custom-sources/${encodeURIComponent(id)}`, patch);
export const deleteCustomSource  = (id)         => request('DELETE', `/api/admin/custom-sources/${encodeURIComponent(id)}`);
export const testCustomSource    = (source, keyword = '보호관찰') => request('POST', '/api/admin/custom-sources/test', { source, keyword });

// 뉴스 소스 백업/복원 (Render 무료 플랜 디스크 휘발 대비)
export function backupSourceSettingsUrl(includeSecrets = false) {
  return '/api/admin/source-settings/backup' + (includeSecrets ? '?includeSecrets=1' : '');
}
export const restoreSourceSettings = (backup) => request('POST', '/api/admin/source-settings/restore', { backup });

// 추적 링크 — mode: '' | 'auto' | 'manual'
export const listTrackingLinks    = (mode = '') => request('GET',    '/api/tracking-links' + (mode ? `?mode=${encodeURIComponent(mode)}` : ''));
export const createTrackingLink   = (body)       => request('POST',   '/api/tracking-links', body);
export const updateTrackingLink   = (id, patch)  => request('PATCH',  `/api/tracking-links/${encodeURIComponent(id)}`, patch);
export const deleteTrackingLink   = (id)         => request('DELETE', `/api/tracking-links/${encodeURIComponent(id)}`);
export const autoSyncTrackingLinks = (reportId)  => request('POST',   `/api/tracking-links/auto-sync/${encodeURIComponent(reportId)}`);
export function trackingRedirectUrl(id) {
  const base = window.location.origin;
  return `${base}/r/${encodeURIComponent(id)}`;
}

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

// ── 일반 파일 다운로드 (PDF 매직 바이트 검증 X) ──
async function fetchFileBlob(url, expectedCt) {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch {}
    if (res.status === 401) {
      throw Object.assign(new Error('인증이 만료되었습니다. 다시 로그인하세요.'), { status: 401 });
    }
    throw Object.assign(new Error(`다운로드 실패 (HTTP ${res.status}). ${detail}`), { status: res.status });
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (expectedCt && !ct.includes(expectedCt)) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 300); } catch {}
    throw new Error(`예상과 다른 응답입니다 (${ct}). ${detail}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const m  = cd.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
  const filename = m ? decodeURIComponent(m[1] || m[2] || '') : 'trend-report';
  return { blob, filename };
}

async function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadReportWord(id) {
  const { blob, filename } = await fetchFileBlob(reportWordDownloadUrl(id), 'wordprocessingml');
  await triggerDownload(blob, filename);
  return { filename, size: blob.size };
}

export async function downloadReportHtml(id) {
  const { blob, filename } = await fetchFileBlob(reportHtmlDownloadUrl(id), 'text/html');
  await triggerDownload(blob, filename);
  return { filename, size: blob.size };
}

export async function downloadReportExcel(id) {
  const { blob, filename } = await fetchFileBlob(reportExcelDownloadUrl(id), 'spreadsheetml');
  await triggerDownload(blob, filename);
  return { filename, size: blob.size };
}

// ── 편철형 / 분석형 출력 — URL ───────────────────
export const clippingPreviewUrl = (id, q='')   => `/api/reports/${encodeURIComponent(id)}/clipping/preview${q}`;
export const clippingPdfUrl     = (id, q='')   => `/api/reports/${encodeURIComponent(id)}/clipping/pdf${q}`;
export const clippingWordUrl    = (id)         => `/api/reports/${encodeURIComponent(id)}/clipping/word`;
export const clippingHtmlUrl    = (id)         => `/api/reports/${encodeURIComponent(id)}/clipping/html`;
export const analysisPreviewUrl = (id)         => `/api/reports/${encodeURIComponent(id)}/analysis/preview`;
export const analysisWordUrl    = (id)         => `/api/reports/${encodeURIComponent(id)}/analysis/word`;
export const analysisExcelUrl   = (id)         => `/api/reports/${encodeURIComponent(id)}/analysis/excel`;
export const analysisHtmlUrl    = (id)         => `/api/reports/${encodeURIComponent(id)}/analysis/html`;

// ── 편철형 다운로드 ──────────────────────────
// opts.fast === true → 빠른 PDF (외부 폰트 / 본문 이미지 제외)
// opts.fast === false → 강제 원문 PDF (자동 fallback 비활성)
// 기본 (auto)            → 서버가 기사 30+/이미지 20+/HTML 5MB+ 시 자동으로 fast 모드 적용
export async function downloadClippingPdf(id, opts = {}) {
  const params = [];
  if (opts.includeAppendix === false) params.push('appendix=0');
  if (opts.fast === true)  params.push('fast=1');
  if (opts.fast === false) params.push('fast=0');
  const q = params.length ? '?' + params.join('&') : '';
  const { blob, filename, mode } = await fetchPdfBlob(clippingPdfUrl(id, q));
  await triggerDownload(blob, filename);
  return { filename, size: blob.size, mode };
}
export async function previewClippingPdf(id) {
  const w = window.open(clippingPreviewUrl(id), '_blank');
  if (!w) throw new Error('팝업 차단 — 미리보기 창을 열 수 없습니다. 팝업을 허용하세요.');
}
export async function downloadClippingWord(id) {
  const { blob, filename } = await fetchFileBlob(clippingWordUrl(id), 'wordprocessingml');
  await triggerDownload(blob, filename);
  return { filename, size: blob.size };
}
export async function downloadClippingHtml(id) {
  const { blob, filename } = await fetchFileBlob(clippingHtmlUrl(id), 'text/html');
  await triggerDownload(blob, filename);
  return { filename, size: blob.size };
}

// ── 분석형 다운로드 ──────────────────────────
export async function downloadAnalysisWord(id) {
  const { blob, filename } = await fetchFileBlob(analysisWordUrl(id), 'wordprocessingml');
  await triggerDownload(blob, filename);
  return { filename, size: blob.size };
}
export async function downloadAnalysisExcel(id) {
  const { blob, filename } = await fetchFileBlob(analysisExcelUrl(id), 'spreadsheetml');
  await triggerDownload(blob, filename);
  return { filename, size: blob.size };
}
export async function downloadAnalysisHtml(id) {
  const { blob, filename } = await fetchFileBlob(analysisHtmlUrl(id), 'text/html');
  await triggerDownload(blob, filename);
  return { filename, size: blob.size };
}
export function previewAnalysisHtml(id) {
  const w = window.open(analysisPreviewUrl(id), '_blank');
  if (!w) throw new Error('팝업 차단 — 분석 보고서 미리보기를 열 수 없습니다.');
}

// ── 편철 설정 / 기사 편집 ──────────────────────
export const getPrintSettings  = (id)        => request('GET', `/api/reports/${encodeURIComponent(id)}/print-settings`);
export const savePrintSettings = (id, body)  => request('PUT', `/api/reports/${encodeURIComponent(id)}/print-settings`, body);
export const saveArticleOverrides = (id, body) => request('PUT', `/api/reports/${encodeURIComponent(id)}/article-overrides`, body);
export const getQualityCheck   = (id)        => request('GET', `/api/reports/${encodeURIComponent(id)}/quality-check`);
export const listClippingPresets = ()        => request('GET', `/api/clipping/presets`);
