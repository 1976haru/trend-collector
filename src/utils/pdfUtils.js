// ─────────────────────────────────────────────
// pdfUtils.js — 보고서 PDF 생성
//
// jsPDF 는 한글 글꼴 임베드가 까다로워서, 기본 구현은
// "프린트 친화적인 HTML 새 창 → 사용자가 PDF로 저장"
// 방식을 사용합니다. (모든 OS / 브라우저에서 한글이 깨지지 않음)
//
// jsPDF 가 설치돼 있으면 generatePDFNative() 로 직접 PDF 생성도 가능.
// ─────────────────────────────────────────────

import { formatFull } from './dateUtils.js';
import { classifyMediaTier, classifyRegion } from '../constants/mediaList.js';

/**
 * 보고서 PDF 생성 (기본: 인쇄 창 방식 — 한글 안전)
 * @param {Array} articles
 * @param {Object} opts {
 *   title?, reportDate?, bookmarks?, sentiments?,
 *   reportType? 'daily' | 'weekly',
 *   trending? Array<{keyword,prev,curr}>,
 * }
 */
export function generatePDF(articles = [], opts = {}) {
  const html = buildReportHTML(articles, opts);
  const win  = window.open('', '_blank');
  if (!win) {
    alert('팝업이 차단되어 있습니다. 팝업 허용 후 다시 시도하세요.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // 일부 브라우저에서 즉시 print 호출이 빈 창을 인쇄하는 문제 방지
  setTimeout(() => { try { win.focus(); win.print(); } catch {} }, 350);
}

/**
 * 일일 업무보고용 표준 템플릿 — "요약 / 주요 이슈 / 시사점 / 참고 링크"
 */
export function buildReportHTML(articles, opts = {}) {
  const {
    title       = 'Trend Collector 일일 언론보도 보고서',
    reportDate  = formatFull(),
    reportType  = 'daily',
    trending    = [],
  } = opts;

  const keywords = [...new Set(articles.map(a => a.keyword))].filter(Boolean);
  const total    = articles.length;

  // 매체 등급별 분류
  const byTier = { 중앙: [], 지방: [], 인터넷: [], 기타: [] };
  articles.forEach(a => {
    const tier = classifyMediaTier(a.source || '');
    (byTier[tier] || byTier['기타']).push(a);
  });

  const mainIssues = articles.slice(0, 10);
  const refLinks   = articles.slice(0, 30);

  return /* html */ `<!doctype html>
<html lang="ko"><head>
  <meta charset="utf-8" />
  <title>${escape(title)} — ${escape(reportDate)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',sans-serif; color:#0d1117; line-height:1.55; font-size:12pt; }
    h1 { font-size: 18pt; margin: 0 0 4pt; }
    h2 { font-size: 13pt; margin: 18pt 0 6pt; padding-bottom:3pt; border-bottom:1.5pt solid #0d1117; }
    .meta { color:#555; font-size:10.5pt; margin-bottom:10pt; }
    .pill { display:inline-block; padding:1pt 7pt; border:1pt solid #0d1117; border-radius:10pt; font-size:10pt; margin-right:4pt; }
    table { width:100%; border-collapse: collapse; font-size:10.5pt; margin:6pt 0; }
    th, td { border-bottom: .5pt solid #ccc; padding: 4pt 6pt; vertical-align: top; text-align:left; }
    th { background:#f0ede8; }
    ol { padding-left: 18pt; }
    li { margin-bottom: 3pt; }
    .src   { color:#666; font-size: 10pt; }
    .url   { color:#2563eb; font-size: 9.5pt; word-break: break-all; }
    .trend { background:#fff7ed; border:1pt solid #fdba74; padding:6pt 10pt; border-radius:4pt; margin-top:6pt; }
    .footer { margin-top: 22pt; color:#999; font-size:9.5pt; text-align:center; border-top:.5pt solid #ccc; padding-top:6pt; }
    @media print { .no-print { display:none; } }
  </style>
</head><body>
  <h1>${escape(title)}</h1>
  <div class="meta">
    발행: ${escape(reportDate)} · 유형: ${reportType === 'weekly' ? '주간' : '일간'} · 총 ${total}건
  </div>
  <div>
    ${keywords.map(k => `<span class="pill">${escape(k)}</span>`).join('')}
  </div>

  <h2>요약</h2>
  <table>
    <tr><th style="width:30%">구분</th><th>건수 / 비고</th></tr>
    <tr><td>총 보도 건수</td><td>${total}건</td></tr>
    <tr><td>중앙 매체</td><td>${byTier.중앙.length}건</td></tr>
    <tr><td>지방 매체</td><td>${byTier.지방.length}건</td></tr>
    <tr><td>인터넷·전문</td><td>${byTier.인터넷.length}건</td></tr>
    <tr><td>키워드</td><td>${keywords.map(escape).join(', ') || '—'}</td></tr>
  </table>

  ${trending.length ? `
  <div class="trend">
    <strong>📈 키워드 급상승</strong> —
    ${trending.slice(0, 5).map(t => `${escape(t.keyword)} (${t.prev}→${t.curr})`).join(', ')}
  </div>` : ''}

  <h2>주요 이슈 (상위 ${mainIssues.length}건)</h2>
  <ol>
    ${mainIssues.map(a => `
      <li>
        <div><strong>${escape(a.title || '제목 없음')}</strong></div>
        <div class="src">[${escape(a.source || '미상')}] ${escape(a.date || '')} · #${escape(a.keyword || '')} · ${classifyMediaTier(a.source || '')} / ${classifyRegion(a.source || '')}</div>
        ${a.summary ? `<div>${escape(a.summary)}</div>` : ''}
      </li>`).join('')}
  </ol>

  <h2>시사점</h2>
  <ol>
    <li>키워드 ‘${escape(keywords[0] || '')}’ 관련 보도가 ${articles.filter(a => a.keyword === keywords[0]).length}건으로 비중이 가장 높음.</li>
    <li>중앙 ${byTier.중앙.length}건 / 지방 ${byTier.지방.length}건 / 인터넷 ${byTier.인터넷.length}건 으로 매체 분포 확인.</li>
    ${trending.length ? `<li>급상승 키워드: ${trending.slice(0, 3).map(t => escape(t.keyword)).join(', ')} — 추가 모니터링 권장.</li>` : ''}
  </ol>

  <h2>참고 링크 (상위 ${refLinks.length}건)</h2>
  <ol>
    ${refLinks.map(a => `
      <li>
        <div>${escape(a.title || '')} <span class="src">[${escape(a.source || '')}]</span></div>
        ${a.url ? `<div class="url">${escape(a.url)}</div>` : ''}
      </li>`).join('')}
  </ol>

  <div class="footer">Trend Collector — 자동 생성 보고서</div>

  <div class="no-print" style="margin-top:14pt; text-align:center;">
    <button onclick="window.print()" style="padding:8pt 18pt; font-size:11pt;">PDF로 저장 / 인쇄</button>
  </div>
</body></html>`;
}

function escape(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
