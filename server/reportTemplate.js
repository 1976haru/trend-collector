// ─────────────────────────────────────────────
// reportTemplate.js — 리포트 HTML / 텍스트 / 메일 본문 렌더러
// "요약 / 주요 이슈 / 시사점 / 참고 링크" 일일 업무보고용 템플릿
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

/**
 * 리포트의 인쇄(또는 PDF 저장) 친화적 HTML.
 * 한글 글꼴은 OS 기본을 사용 → 깨지지 않음.
 */
export function renderReportHtml(report) {
  const {
    keywords = [], articles = [], generatedAt, reportType = 'daily', trigger = 'manual',
  } = report;
  const total = articles.length;
  const top   = articles.slice(0, 10);
  const refs  = articles.slice(0, 30);

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
  table { width:100%; border-collapse: collapse; font-size:10.5pt; margin:6pt 0; }
  th, td { border-bottom: .5pt solid #ccc; padding: 4pt 6pt; vertical-align: top; text-align:left; }
  th { background:#f0ede8; }
  ol { padding-left: 18pt; } li { margin-bottom: 3pt; }
  .src { color:#666; font-size: 10pt; }
  .url { color:#2563eb; font-size: 9.5pt; word-break: break-all; }
  .footer { margin-top: 22pt; color:#999; font-size:9.5pt; text-align:center; border-top:.5pt solid #ccc; padding-top:6pt; }
  .toolbar { margin: 6pt 0 14pt; }
  .toolbar button { padding: 6pt 14pt; font-size: 11pt; cursor: pointer; }
  @media print { .toolbar { display: none; } }
</style></head><body>
  <div class="toolbar"><button onclick="window.print()">📄 PDF 로 저장 / 인쇄</button></div>
  <h1>Trend Collector — ${reportType === 'weekly' ? '주간' : '일간'} 언론보도 보고서</h1>
  <div class="meta">발행: ${esc(fmtKST(generatedAt))} · 수집 ${trigger === 'scheduled' ? '예약 실행' : '수동 실행'} · 총 ${total}건</div>
  <div>${keywords.map(k => `<span class="pill">${esc(k)}</span>`).join('')}</div>

  <h2>요약</h2>
  <table>
    <tr><th style="width:30%">구분</th><th>내용</th></tr>
    <tr><td>총 보도 건수</td><td>${total}건</td></tr>
    <tr><td>키워드</td><td>${keywords.map(esc).join(', ') || '—'}</td></tr>
    <tr><td>리포트 ID</td><td>${esc(report.id)}</td></tr>
  </table>

  <h2>주요 이슈 (상위 ${top.length}건)</h2>
  <ol>
    ${top.map(a => `
      <li>
        <div><strong>${esc(a.title || '')}</strong></div>
        <div class="src">[${esc(a.source || '미상')}] ${esc(a.date || '')} · #${esc(a.keyword || '')}</div>
        ${a.summary ? `<div>${esc(a.summary)}</div>` : ''}
      </li>`).join('')}
  </ol>

  <h2>시사점</h2>
  <ol>
    ${keywords[0]
      ? `<li>키워드 ‘${esc(keywords[0])}’ 관련 보도가 ${articles.filter(a => a.keyword === keywords[0]).length}건으로 비중 최다.</li>`
      : ''}
    <li>중복 / 광고성 기사 자동 필터 적용 후 ${total}건이 본 보고서에 포함되었습니다.</li>
  </ol>

  <h2>참고 링크 (상위 ${refs.length}건)</h2>
  <ol>
    ${refs.map(a => `
      <li>
        <div>${esc(a.title || '')} <span class="src">[${esc(a.source || '')}]</span></div>
        ${a.url ? `<div class="url">${esc(a.url)}</div>` : ''}
      </li>`).join('')}
  </ol>

  <div class="footer">Trend Collector — 자동 생성 보고서</div>
</body></html>`;
}

/**
 * 메일 본문용 텍스트 (HTML 미지원 클라이언트 대비)
 */
export function renderReportText(report) {
  const { keywords = [], articles = [], generatedAt, reportType = 'daily' } = report;
  const lines = [];
  lines.push(`Trend Collector — ${reportType === 'weekly' ? '주간' : '일간'} 언론보도 보고서`);
  lines.push(`발행: ${fmtKST(generatedAt)} · 총 ${articles.length}건`);
  lines.push(`키워드: ${keywords.join(', ')}`);
  lines.push('='.repeat(50));
  lines.push('');
  articles.slice(0, 30).forEach((a, i) => {
    lines.push(`${i + 1}. [${a.source || '미상'}] ${a.date || ''}`);
    lines.push(`   ${a.title || ''}`);
    if (a.url) lines.push(`   ${a.url}`);
    lines.push('');
  });
  return lines.join('\n');
}

/**
 * 메일에 임베드되는 HTML (인라인 스타일, 인쇄용 PDF 와는 별개)
 */
export function renderReportEmailHtml(report, baseUrl) {
  const { keywords = [], articles = [], generatedAt, reportType = 'daily' } = report;
  const top = articles.slice(0, 30);
  const link = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/reports/${encodeURIComponent(report.id)}/html` : '';

  return /* html */ `<!doctype html>
<html><body style="font-family: 'Apple SD Gothic Neo','Malgun Gothic',sans-serif; color:#222; line-height:1.6;">
  <h2 style="margin:0 0 6px;">📰 Trend Collector — ${reportType === 'weekly' ? '주간' : '일간'} 보고서</h2>
  <div style="color:#666; font-size: 13px; margin-bottom: 12px;">
    ${esc(fmtKST(generatedAt))} · 총 ${articles.length}건 · 키워드: ${keywords.map(esc).join(', ')}
  </div>
  ${link ? `<div style="margin-bottom:14px;"><a href="${esc(link)}" style="color:#2563eb;">→ 웹에서 전체 리포트 열기 / PDF 저장</a></div>` : ''}
  <ol style="padding-left: 20px;">
    ${top.map(a => `
      <li style="margin-bottom:10px;">
        <div><strong>${esc(a.title || '')}</strong></div>
        <div style="color:#666; font-size: 12px;">[${esc(a.source || '')}] ${esc(a.date || '')} · #${esc(a.keyword || '')}</div>
        ${a.summary ? `<div style="font-size:13px; color:#444;">${esc(a.summary)}</div>` : ''}
        ${a.url ? `<div style="font-size:12px;"><a href="${esc(a.url)}" style="color:#2563eb;">원문 보기</a></div>` : ''}
      </li>`).join('')}
  </ol>
  <hr/>
  <div style="color:#999; font-size: 11px;">Trend Collector — 자동 생성 메일</div>
</body></html>`;
}
