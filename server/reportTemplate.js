// ─────────────────────────────────────────────
// reportTemplate.js — 인쇄/PDF 친화 HTML + 메일 본문
// ⚠️ 모든 사용자 데이터는 escape() 후 출력 — 원본 RSS 의 인라인 HTML 이
//    문자열로 새는 것을 방지.
// ─────────────────────────────────────────────

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtKST(iso) {
  try {
    return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch { return iso; }
}

// 안전한 외부링크: javascript: 등 차단, target=_blank + rel
function safeUrl(u = '') {
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return '';
}

// ── 메인 인쇄용 HTML 보고서 ────────────────────
export function renderReportHtml(report) {
  const {
    id, keywords = [], excludes = [], articles = [], generatedAt,
    trigger = 'manual',
    mediaCounts = {}, sentiment = {}, trending = [], groups = [],
    summaryText = '',
  } = report;
  const total = articles.length;
  const top   = articles.slice(0, 10);
  const refs  = articles.slice(0, 30);

  const mediaRows = Object.entries(mediaCounts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}건</td></tr>`).join('');

  const sentRow = sentiment.total
    ? `긍정 ${sentiment.positive}(${sentiment.positivePct}%) · 부정 ${sentiment.negative}(${sentiment.negativePct}%) · 중립 ${sentiment.neutral}(${sentiment.neutralPct}%) — <strong>${esc(sentiment.overall || '')}</strong>`
    : '분석 데이터 없음';

  return /* html */ `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" />
<title>Trend Collector — ${esc(fmtKST(generatedAt))}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',sans-serif; color:#0d1117; line-height:1.55; font-size:12pt; padding: 8pt; }
  h1 { font-size: 18pt; margin: 0 0 4pt; }
  h2 { font-size: 13pt; margin: 18pt 0 6pt; padding-bottom:3pt; border-bottom:1.5pt solid #0d1117; }
  .meta { color:#555; font-size:10.5pt; margin-bottom:10pt; }
  .pill { display:inline-block; padding:1pt 7pt; border:1pt solid #0d1117; border-radius:10pt; font-size:10pt; margin-right:4pt; }
  .pillNeg { display:inline-block; padding:1pt 7pt; border:1pt solid #c53030; color:#c53030; border-radius:10pt; font-size:10pt; margin-right:4pt; }
  table { width:100%; border-collapse: collapse; font-size:10.5pt; margin:6pt 0; }
  th, td { border-bottom: .5pt solid #ccc; padding: 4pt 6pt; vertical-align: top; text-align:left; }
  th { background:#f0ede8; }
  ol { padding-left: 18pt; } li { margin-bottom: 5pt; }
  .src { color:#666; font-size: 10pt; }
  .url { color:#2563eb; font-size: 9.5pt; word-break: break-all; }
  .lead { background:#f8f6f2; border-left:3pt solid #0d1117; padding:8pt 12pt; margin:8pt 0; font-size:11pt; }
  .alert { background:#fff7ed; border:1pt solid #fdba74; color:#9a3412; padding:7pt 10pt; border-radius:4pt; margin:6pt 0; font-size:10.5pt; }
  .grp { background:#fafaf6; border:.5pt solid #d5d0c8; border-radius:4pt; padding:7pt 10pt; margin-bottom:6pt; font-size:10.5pt; }
  .pos { color:#16a34a; font-weight:700; }
  .neg { color:#dc2626; font-weight:700; }
  .footer { margin-top: 22pt; color:#999; font-size:9.5pt; text-align:center; border-top:.5pt solid #ccc; padding-top:6pt; }
  .toolbar { margin: 6pt 0 14pt; }
  .toolbar button { padding: 6pt 14pt; font-size: 11pt; cursor: pointer; }
  @media print { .toolbar { display: none; } }
</style></head><body>
  <div class="toolbar"><button onclick="window.print()">📄 PDF로 저장 / 인쇄</button></div>

  <h1>Trend Collector — 일일 언론보도 보고서</h1>
  <div class="meta">
    📅 발행: ${esc(fmtKST(generatedAt))} ·
    🆔 ${esc(id || '')} ·
    ${trigger === 'scheduled' ? '예약 실행' : '수동 실행'} ·
    총 ${total}건
  </div>
  <div>
    ${keywords.map(k => `<span class="pill">#${esc(k)}</span>`).join('')}
    ${excludes.map(k => `<span class="pillNeg">−${esc(k)}</span>`).join('')}
  </div>

  ${summaryText ? `<div class="lead">📝 <strong>오늘의 요약</strong><br/>${esc(summaryText)}</div>` : ''}

  ${trending.length ? `<div class="alert">📈 <strong>급상승 이슈</strong> — ${
    trending.slice(0, 5).map(t => `${esc(t.keyword)} (${t.prev}→${t.curr})`).join(', ')
  }</div>` : ''}

  <h2>요약</h2>
  <table>
    <tr><th style="width:30%">총 보도 건수</th><td>${total}건</td></tr>
    <tr><th>키워드</th><td>${keywords.map(esc).join(', ') || '—'}</td></tr>
    <tr><th>감정 분석</th><td>${sentRow}</td></tr>
  </table>

  <h2>언론 유형별 건수</h2>
  <table>
    <tr><th style="width:30%">유형</th><th>건수</th></tr>
    ${mediaRows || '<tr><td colspan="2">—</td></tr>'}
  </table>

  ${groups.length ? `
  <h2>중복 묶기 (관련 보도 ${groups.length}건)</h2>
  ${groups.slice(0, 8).map(g => `
    <div class="grp">
      <div><strong>${esc(g.leadTitle || '')}</strong> <span class="src">[${esc(g.leadSource || '')}]</span></div>
      <div class="src">관련 보도 ${g.count}건 · ${esc(g.sources.slice(0, 8).join(', '))}</div>
      ${safeUrl(g.leadUrl) ? `<div class="url">${esc(g.leadUrl)}</div>` : ''}
    </div>
  `).join('')}` : ''}

  <h2>주요 이슈 TOP ${top.length}</h2>
  <ol>
    ${top.map(a => `
      <li>
        <div>
          ${safeUrl(a.url)
            ? `<a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer"><strong>${esc(a.title || '')}</strong></a>`
            : `<strong>${esc(a.title || '')}</strong>`}
        </div>
        <div class="src">[${esc(a.source || '미상')}] ${esc(a.date || '')} · #${esc(a.keyword || '')} · ${esc(a.mediaType || '')} · <span class="${a.sentiment?.label === '긍정' ? 'pos' : a.sentiment?.label === '부정' ? 'neg' : ''}">${esc(a.sentiment?.label || '중립')}</span></div>
        ${a.summary ? `<div>${esc(a.summary)}</div>` : ''}
      </li>`).join('')}
  </ol>

  <h2>참고 기사 목록 (상위 ${refs.length}건)</h2>
  <table>
    <tr><th>제목</th><th style="width:18%">언론사</th><th style="width:14%">유형</th><th style="width:8%">감정</th></tr>
    ${refs.map(a => `
      <tr>
        <td>${safeUrl(a.url)
            ? `<a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.title || '')}</a>`
            : esc(a.title || '')}</td>
        <td>${esc(a.source || '')}</td>
        <td>${esc(a.mediaType || '')}</td>
        <td class="${a.sentiment?.label === '긍정' ? 'pos' : a.sentiment?.label === '부정' ? 'neg' : ''}">${esc(a.sentiment?.label || '')}</td>
      </tr>`).join('')}
  </table>

  <div class="footer">Trend Collector — 자동 생성 보고서</div>
</body></html>`;
}

// ── 메일 본문용 텍스트 (plain) ─────────────────
export function renderReportText(report) {
  const { keywords = [], articles = [], generatedAt, summaryText = '', sentiment = {}, mediaCounts = {} } = report;
  const lines = [];
  lines.push(`Trend Collector — 일일 언론보도 보고서`);
  lines.push(`발행: ${fmtKST(generatedAt)} · 총 ${articles.length}건`);
  lines.push(`키워드: ${keywords.join(', ')}`);
  if (summaryText) lines.push('', summaryText);
  lines.push('');
  if (sentiment.total) {
    lines.push(`감정: 긍정 ${sentiment.positive}(${sentiment.positivePct}%) / 부정 ${sentiment.negative}(${sentiment.negativePct}%) / 중립 ${sentiment.neutral}(${sentiment.neutralPct}%) → ${sentiment.overall}`);
  }
  const mediaLine = Object.entries(mediaCounts).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(', ');
  if (mediaLine) lines.push(`매체: ${mediaLine}`);
  lines.push('='.repeat(50));
  lines.push('');
  articles.slice(0, 30).forEach((a, i) => {
    lines.push(`${i + 1}. [${a.source || '미상'}] ${a.date || ''}  (${a.mediaType || ''}, ${a.sentiment?.label || ''})`);
    lines.push(`   ${a.title || ''}`);
    if (a.url) lines.push(`   ${a.url}`);
    lines.push('');
  });
  return lines.join('\n');
}

// ── 메일 임베드용 HTML ─────────────────────────
export function renderReportEmailHtml(report, baseUrl) {
  const {
    keywords = [], articles = [], generatedAt, summaryText = '', sentiment = {},
    mediaCounts = {}, trending = [],
  } = report;
  const top = articles.slice(0, 30);
  const reportLink = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/reports/${encodeURIComponent(report.id)}/html` : '';

  const sentLine = sentiment.total
    ? `긍정 ${sentiment.positive}(${sentiment.positivePct}%) · 부정 ${sentiment.negative}(${sentiment.negativePct}%) · 중립 ${sentiment.neutral}(${sentiment.neutralPct}%) — <b>${esc(sentiment.overall || '')}</b>`
    : '';
  const mediaLine = Object.entries(mediaCounts).filter(([, v]) => v > 0).map(([k, v]) => `${esc(k)} ${v}`).join(' · ');

  return /* html */ `<!doctype html>
<html><body style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif; color:#222; line-height:1.6;">
  <h2 style="margin:0 0 6px;">📰 Trend Collector — 일일 언론보도 보고서</h2>
  <div style="color:#666; font-size: 13px; margin-bottom: 12px;">
    📅 ${esc(fmtKST(generatedAt))} · 총 ${articles.length}건 · 키워드: ${keywords.map(esc).join(', ')}
  </div>
  ${summaryText ? `<div style="background:#f8f6f2; border-left:3px solid #0d1117; padding:10px 14px; margin:10px 0; font-size:14px;">📝 ${esc(summaryText)}</div>` : ''}
  ${trending.length ? `<div style="background:#fff7ed; border:1px solid #fdba74; color:#9a3412; padding:8px 12px; border-radius:6px; margin:10px 0; font-size:13px;">📈 <b>급상승</b>: ${trending.slice(0, 5).map(t => `${esc(t.keyword)} (${t.prev}→${t.curr})`).join(', ')}</div>` : ''}
  ${sentLine ? `<div style="font-size:13px; color:#444; margin: 8px 0;">감정: ${sentLine}</div>` : ''}
  ${mediaLine ? `<div style="font-size:13px; color:#444; margin: 8px 0;">매체: ${mediaLine}</div>` : ''}
  ${reportLink ? `<div style="margin: 14px 0;"><a href="${esc(reportLink)}" style="color:#2563eb;" target="_blank" rel="noopener noreferrer">→ 웹에서 전체 리포트 열기 / PDF 저장</a></div>` : ''}
  <ol style="padding-left: 20px;">
    ${top.map(a => `
      <li style="margin-bottom:10px;">
        <div>${safeUrl(a.url)
            ? `<a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" style="color:#0d1117; text-decoration:none;"><b>${esc(a.title || '')}</b></a>`
            : `<b>${esc(a.title || '')}</b>`}</div>
        <div style="color:#666; font-size: 12px;">[${esc(a.source || '')}] ${esc(a.date || '')} · #${esc(a.keyword || '')} · ${esc(a.mediaType || '')} · ${esc(a.sentiment?.label || '')}</div>
        ${a.summary ? `<div style="font-size:13px; color:#444;">${esc(a.summary)}</div>` : ''}
      </li>`).join('')}
  </ol>
  <hr/>
  <div style="color:#999; font-size: 11px;">Trend Collector — 자동 생성 메일</div>
</body></html>`;
}
