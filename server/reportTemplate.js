// ─────────────────────────────────────────────
// reportTemplate.js — PDF / 인쇄용 HTML, 메일 본문
// 공공기관 내부 업무용. 모든 사용자 데이터는 escape() 후 출력.
// ─────────────────────────────────────────────

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtKST(iso) {
  try { return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }); } catch { return iso; }
}

function fmtKSTDate(iso) {
  try { return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }); } catch { return iso; }
}

function safeUrl(u = '') {
  const s = String(u).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

// 추출된 본문 HTML 은 articleExtractor 가 이미 화이트리스트로 정리했지만
// 한 번 더 안전 차원에서 inline 위험 요소 제거.
function sanitizeContentHtml(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/ on[a-z]+="[^"]*"/gi, '')
    .replace(/ on[a-z]+='[^']*'/gi, '');
}

// ── 메인 보고서 HTML (Puppeteer 입력) ──────────
export function renderReportHtml(report) {
  const {
    id, keywords = [], excludes = [], articles = [], generatedAt,
    trigger = 'manual',
    mediaCounts = {}, sentiment = {}, trending = [], groups = [],
    summaryText = '', riskLevel = { level: '안정', reasons: [] },
    extractedCount = 0, extractionFailed = [],
  } = report;

  const total = articles.length;
  const dateStr = fmtKSTDate(generatedAt);

  const mediaRows = Object.entries(mediaCounts).filter(([, v]) => v > 0)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}건</td></tr>`).join('');

  // 목차 (TOC)
  const tocItems = articles.map((a, i) => `
    <li><a href="#a${i + 1}">[${i + 1}] ${esc(a.title || '')}</a> <span class="src">[${esc(a.source || '')}]</span></li>
  `).join('');

  // 기사 본문 섹션
  const bodySections = articles.map((a, i) => {
    const u = safeUrl(a.url);
    const sentLbl = a.sentiment?.label || '중립';
    const sentClass = sentLbl === '긍정' ? 'pos' : sentLbl === '부정' ? 'neg' : 'neu';
    let bodyHtml = '';
    if (a.contentHtml && a.extracted) {
      bodyHtml = `<div class="content">${sanitizeContentHtml(a.contentHtml)}</div>`;
    } else if (a.contentText && a.extracted) {
      bodyHtml = a.contentText.split(/\n+/).map(p => `<p>${esc(p)}</p>`).join('');
    } else {
      bodyHtml = `<p class="missing">⚠️ 본문 자동 추출 실패 — 원문 링크에서 직접 확인하세요. (${esc(a.extractionError || 'no body')})</p>` +
                 (a.summary ? `<p>${esc(a.summary)}</p>` : '');
    }
    return `
      <section class="article" id="a${i + 1}">
        <h3>[${i + 1}] ${esc(a.title || '제목 없음')}</h3>
        <table class="art-meta">
          <tr><th>언론사</th><td>${esc(a.source || '미상')}</td>
              <th>날짜</th><td>${esc(a.date || '')}</td></tr>
          <tr><th>유형</th><td>${esc(a.mediaType || '기타')}</td>
              <th>감정</th><td class="${sentClass}">${esc(sentLbl)}</td></tr>
          <tr><th>키워드</th><td>#${esc(a.keyword || '')}</td>
              <th>추출</th><td>${a.extracted ? '✅ 본문 추출 성공' : '⚠️ 추출 실패'}</td></tr>
          <tr><th colspan="1">원문</th>
              <td colspan="3" class="url">${u
                ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`
                : '—'}</td></tr>
        </table>
        ${a.summary ? `<div class="summary"><strong>요약:</strong> ${esc(a.summary)}</div>` : ''}
        <div class="bodyLabel"><strong>본문</strong></div>
        ${bodyHtml}
      </section>`;
  }).join('');

  const riskBadge = riskLevel.level === '긴급' ? `<span class="riskUrgent">🚨 긴급</span>`
                  : riskLevel.level === '주의' ? `<span class="riskCaution">⚠️ 주의</span>`
                  :                              `<span class="riskOk">✅ 안정</span>`;
  const riskReasons = riskLevel.reasons?.length
    ? `<div class="riskReasons">사유: ${riskLevel.reasons.map(esc).join(' · ')}</div>` : '';

  return /* html */ `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" />
<title>Trend Collector — ${esc(dateStr)}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  @page { size: A4; margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif; color:#0d1117; line-height:1.55; font-size:10.5pt; }
  h1 { font-size: 22pt; margin: 0 0 4pt; }
  h2 { font-size: 14pt; margin: 18pt 0 6pt; padding-bottom:3pt; border-bottom:1.5pt solid #0d1117; page-break-after: avoid; }
  h3 { font-size: 12pt; margin: 10pt 0 4pt; page-break-after: avoid; }
  p  { margin: 4pt 0; }

  /* 표지 */
  .cover { page-break-after: always; padding-top: 30mm; text-align: center; }
  .cover .brand { font-size: 12pt; color: #888; }
  .cover .title { font-size: 28pt; font-weight: 700; margin: 14pt 0 6pt; }
  .cover .sub   { font-size: 14pt; color: #555; }
  .cover dl { margin-top: 28mm; display: inline-block; text-align: left; font-size: 11pt; line-height: 1.9; }
  .cover dt { display: inline-block; width: 90pt; color: #666; }
  .cover dd { display: inline; margin: 0; }
  .cover dl br { display: block; }

  .pill { display:inline-block; padding:1pt 7pt; border:1pt solid #0d1117; border-radius:10pt; font-size:9.5pt; margin: 2pt 3pt 0 0; }
  .pillNeg { display:inline-block; padding:1pt 7pt; border:1pt solid #c53030; color:#c53030; border-radius:10pt; font-size:9.5pt; margin: 2pt 3pt 0 0; }

  table { width:100%; border-collapse: collapse; font-size:10pt; margin:6pt 0; }
  th, td { border-bottom: .5pt solid #ccc; padding: 4pt 6pt; vertical-align: top; text-align:left; }
  th { background:#f0ede8; }

  .lead   { background:#f8f6f2; border-left:3pt solid #0d1117; padding:8pt 12pt; margin:8pt 0; font-size:11pt; }
  .alert  { background:#fff7ed; border:1pt solid #fdba74; color:#9a3412; padding:7pt 10pt; border-radius:4pt; margin:6pt 0; font-size:10pt; }
  .grp    { background:#fafaf6; border:.5pt solid #d5d0c8; border-radius:4pt; padding:7pt 10pt; margin-bottom:6pt; font-size:10pt; }

  .pos { color:#16a34a; font-weight:700; }
  .neg { color:#dc2626; font-weight:700; }
  .neu { color:#888; }

  .riskOk      { display:inline-block; padding:3pt 12pt; border-radius:14pt; background:#dcfce7; color:#166534; font-weight:700; }
  .riskCaution { display:inline-block; padding:3pt 12pt; border-radius:14pt; background:#fef3c7; color:#92400e; font-weight:700; }
  .riskUrgent  { display:inline-block; padding:3pt 12pt; border-radius:14pt; background:#fee2e2; color:#991b1b; font-weight:700; }
  .riskReasons { color:#666; font-size:10pt; margin-top:4pt; }

  /* 목차 */
  .toc ol { padding-left: 18pt; }
  .toc li { margin-bottom: 2pt; font-size: 10pt; }
  .toc a  { color: #0d1117; text-decoration: none; }
  .toc .src { color: #888; font-size: 9.5pt; }

  /* 기사 섹션 */
  .article { page-break-before: always; padding-top: 4mm; }
  .article .art-meta { margin-bottom: 6pt; }
  .article .art-meta th { width: 14%; }
  .article .art-meta td { width: 36%; }
  .article .summary  { background:#f8f6f2; border-left:2pt solid #999; padding:6pt 10pt; margin:8pt 0; font-size:10pt; }
  .article .bodyLabel { font-size:10pt; color:#666; margin: 8pt 0 4pt; }
  .article .content   { font-size: 10.5pt; }
  .article .content p { margin: 4pt 0; }
  .article .content a { color:#2563eb; word-break: break-all; }
  .article .missing   { color:#dc2626; font-size: 10pt; }
  .article .url a     { color:#2563eb; word-break: break-all; }

  .footer { margin-top: 22pt; color:#999; font-size:9.5pt; text-align:center; border-top:.5pt solid #ccc; padding-top:6pt; }
</style></head><body>

  <!-- ── 표지 ── -->
  <section class="cover">
    <div class="brand">Trend Collector</div>
    <div class="title">일일 언론보도 보고서</div>
    <div class="sub">${esc(dateStr)} 작성</div>
    <dl>
      <dt>📅 생성 일시</dt><dd>${esc(fmtKST(generatedAt))}</dd><br/>
      <dt>🆔 보고서 ID</dt><dd>${esc(id || '')}</dd><br/>
      <dt>🔄 수집 모드</dt><dd>${trigger === 'scheduled' ? '예약 실행' : '수동 실행'}</dd><br/>
      <dt>🏷 검색 키워드</dt><dd>${keywords.map(esc).join(', ') || '—'}</dd><br/>
      <dt>🚫 제외 키워드</dt><dd>${excludes.map(esc).join(', ') || '—'}</dd><br/>
      <dt>📊 총 기사 수</dt><dd>${total}건 (본문 추출 ${extractedCount}/${total})</dd><br/>
      <dt>📌 위험 등급</dt><dd>${riskBadge}</dd>
    </dl>
  </section>

  <!-- ── 요약 섹션 ── -->
  <h2>📝 요약</h2>
  <div>${riskBadge} ${riskReasons}</div>
  ${summaryText ? `<div class="lead">${esc(summaryText)}</div>` : ''}

  ${trending.length ? `<div class="alert">📈 <strong>급상승 이슈</strong> — ${
    trending.slice(0, 5).map(t => `${esc(t.keyword)} (${t.prev}→${t.curr})`).join(', ')
  }</div>` : ''}

  <table>
    <tr><th style="width:30%">총 보도 건수</th><td>${total}건</td></tr>
    <tr><th>본문 추출</th><td>${extractedCount} / ${total} 성공</td></tr>
    <tr><th>키워드</th><td>${keywords.map(esc).join(', ') || '—'}</td></tr>
    <tr><th>감정 분석</th><td>긍정 ${sentiment.positive || 0}(${sentiment.positivePct || 0}%) · 부정 ${sentiment.negative || 0}(${sentiment.negativePct || 0}%) · 중립 ${sentiment.neutral || 0}(${sentiment.neutralPct || 0}%) — <strong>${esc(sentiment.overall || '')}</strong></td></tr>
  </table>

  <h2>📡 언론 유형별 건수</h2>
  <table>
    <tr><th style="width:30%">유형</th><th>건수</th></tr>
    ${mediaRows || '<tr><td colspan="2">—</td></tr>'}
  </table>

  ${groups.length ? `
    <h2>🧩 중복 묶기</h2>
    ${groups.slice(0, 8).map(g => `
      <div class="grp">
        <div><strong>${esc(g.leadTitle || '')}</strong> <span class="src">[${esc(g.leadSource || '')}]</span></div>
        <div class="src">관련 보도 ${g.count}건 · ${esc(g.sources.slice(0, 8).join(', '))}</div>
      </div>`).join('')}` : ''}

  <!-- ── 목차 ── -->
  <h2>📑 목차 (기사 ${total}건)</h2>
  <div class="toc"><ol>${tocItems}</ol></div>

  <!-- ── 본문 섹션 ── -->
  ${bodySections}

  <!-- ── 부록 ── -->
  <h2 style="page-break-before: always;">📎 부록</h2>
  <h3>전체 기사 목록</h3>
  <table>
    <tr><th>#</th><th>제목</th><th style="width:18%">언론사</th><th style="width:13%">유형</th><th style="width:8%">감정</th></tr>
    ${articles.map((a, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${safeUrl(a.url)
            ? `<a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.title || '')}</a>`
            : esc(a.title || '')}</td>
        <td>${esc(a.source || '')}</td>
        <td>${esc(a.mediaType || '')}</td>
        <td class="${a.sentiment?.label === '긍정' ? 'pos' : a.sentiment?.label === '부정' ? 'neg' : 'neu'}">${esc(a.sentiment?.label || '')}</td>
      </tr>`).join('')}
  </table>

  ${extractionFailed.length ? `
    <h3>본문 추출 실패 (${extractionFailed.length}건)</h3>
    <table>
      <tr><th>제목</th><th>URL</th><th style="width:20%">사유</th></tr>
      ${extractionFailed.map(f => `
        <tr>
          <td>${esc(f.title || '')}</td>
          <td class="src">${esc(f.url || '')}</td>
          <td>${esc(f.error || '')}</td>
        </tr>`).join('')}
    </table>` : ''}

  <div class="footer">Trend Collector — 자동 생성 보고서 (공공기관 내부 업무용 · 외부 공개 금지)</div>
</body></html>`;
}

// ── 메일 본문 (text) ────────────────────────────
export function renderReportText(report) {
  const { keywords = [], articles = [], generatedAt, summaryText = '', sentiment = {}, mediaCounts = {}, riskLevel = {} } = report;
  const lines = [];
  lines.push(`Trend Collector — 일일 언론보도 보고서`);
  lines.push(`발행: ${fmtKST(generatedAt)} · 총 ${articles.length}건`);
  if (riskLevel.level) lines.push(`위험 등급: ${riskLevel.level}${riskLevel.reasons?.length ? ` (${riskLevel.reasons.join(', ')})` : ''}`);
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
    lines.push(`[${i + 1}] [${a.source || '미상'}] ${a.date || ''}  (${a.mediaType || ''}, ${a.sentiment?.label || ''})`);
    lines.push(`    ${a.title || ''}`);
    if (a.url) lines.push(`    ${a.url}`);
    lines.push('');
  });
  return lines.join('\n');
}

// ── 메일 본문 (HTML, 요약만 — PDF 는 첨부) ──────
export function renderReportEmailHtml(report, baseUrl) {
  const {
    keywords = [], articles = [], generatedAt, summaryText = '', sentiment = {},
    mediaCounts = {}, trending = [], riskLevel = { level: '안정', reasons: [] },
  } = report;
  const top = articles.slice(0, 10);
  const reportLink = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/reports/${encodeURIComponent(report.id)}/html` : '';
  const pdfLink    = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/reports/${encodeURIComponent(report.id)}/pdf`  : '';

  const sentLine = sentiment.total
    ? `긍정 ${sentiment.positive}(${sentiment.positivePct}%) · 부정 ${sentiment.negative}(${sentiment.negativePct}%) · 중립 ${sentiment.neutral}(${sentiment.neutralPct}%) — <b>${esc(sentiment.overall || '')}</b>`
    : '';
  const mediaLine = Object.entries(mediaCounts).filter(([, v]) => v > 0).map(([k, v]) => `${esc(k)} ${v}`).join(' · ');
  const riskBadge = riskLevel.level === '긴급' ? `<span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:10px; font-weight:700;">🚨 긴급</span>`
                  : riskLevel.level === '주의' ? `<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:10px; font-weight:700;">⚠️ 주의</span>`
                  :                              `<span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:10px; font-weight:700;">✅ 안정</span>`;

  return /* html */ `<!doctype html>
<html><body style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif; color:#222; line-height:1.6;">
  <h2 style="margin:0 0 6px;">📰 Trend Collector — 일일 언론보도 보고서</h2>
  <div style="color:#666; font-size: 13px; margin-bottom: 12px;">
    📅 ${esc(fmtKST(generatedAt))} · 총 ${articles.length}건 · 키워드: ${keywords.map(esc).join(', ')}
  </div>
  <div style="margin: 8px 0;">위험 등급 ${riskBadge}${riskLevel.reasons?.length ? ` <span style="color:#666; font-size:12px;">(${riskLevel.reasons.map(esc).join(', ')})</span>` : ''}</div>
  ${summaryText ? `<div style="background:#f8f6f2; border-left:3px solid #0d1117; padding:10px 14px; margin:10px 0; font-size:14px;">📝 ${esc(summaryText)}</div>` : ''}
  ${trending.length ? `<div style="background:#fff7ed; border:1px solid #fdba74; color:#9a3412; padding:8px 12px; border-radius:6px; margin:10px 0; font-size:13px;">📈 <b>급상승</b>: ${trending.slice(0, 5).map(t => `${esc(t.keyword)} (${t.prev}→${t.curr})`).join(', ')}</div>` : ''}
  ${sentLine ? `<div style="font-size:13px; color:#444; margin: 8px 0;">감정: ${sentLine}</div>` : ''}
  ${mediaLine ? `<div style="font-size:13px; color:#444; margin: 8px 0;">매체: ${mediaLine}</div>` : ''}
  <div style="margin: 14px 0;">
    ${pdfLink    ? `<a href="${esc(pdfLink)}" style="color:#2563eb; margin-right:14px;" target="_blank" rel="noopener noreferrer">→ 전체 PDF 다운로드</a>` : ''}
    ${reportLink ? `<a href="${esc(reportLink)}" style="color:#2563eb;" target="_blank" rel="noopener noreferrer">→ 웹에서 리포트 열기</a>` : ''}
  </div>

  <h3 style="font-size:14px; margin:18px 0 6px;">주요 이슈 TOP ${top.length}</h3>
  <ol style="padding-left: 20px;">
    ${top.map(a => `
      <li style="margin-bottom:8px;">
        <div>${safeUrl(a.url)
            ? `<a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" style="color:#0d1117; text-decoration:none;"><b>${esc(a.title || '')}</b></a>`
            : `<b>${esc(a.title || '')}</b>`}</div>
        <div style="color:#666; font-size: 12px;">[${esc(a.source || '')}] ${esc(a.date || '')} · #${esc(a.keyword || '')} · ${esc(a.mediaType || '')} · ${esc(a.sentiment?.label || '')}</div>
      </li>`).join('')}
  </ol>
  <hr/>
  <div style="color:#999; font-size: 11px;">Trend Collector — 자동 생성 메일 · 공공기관 내부 업무용</div>
</body></html>`;
}
