// ─────────────────────────────────────────────
// analysisTemplate.js — 분석형 보고서 (관리자/담당자용)
// 1. 1페이지 요약 → 2. 종합 분석 → 3. 주요 이슈 TOP5
// 4. 긍·부·중 → 5. 기관 배포 / 홍보 → 6. 언론 재인용 → 7. 클릭
// 8. 대응 필요사항 → 9. 모니터링 키워드 → 10. 붙임: 전체 기사
// 공공기관 보고 문체: ~임 / ~함 / ~판단됨 / ~필요함.
// ─────────────────────────────────────────────

import { getKoreanFontFaceCss, FONT_STACK_SANS } from './fonts.js';

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtKST(iso) {
  try { return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }); } catch { return iso || ''; }
}
function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch { return iso || ''; }
}

// 종결어미 통일 — '~임/~함/~됨/~필요함'
export function formalize(text) {
  if (!text) return '';
  let s = String(text).trim();
  s = s.replace(/입니다\./g, '임.').replace(/입니다/g, '임');
  s = s.replace(/합니다\./g, '함.').replace(/합니다/g, '함');
  s = s.replace(/됩니다\./g, '됨.').replace(/됩니다/g, '됨');
  s = s.replace(/있습니다\./g, '있음.').replace(/있습니다/g, '있음');
  s = s.replace(/없습니다\./g, '없음.').replace(/없습니다/g, '없음');
  s = s.replace(/것이다\./g, '것임.').replace(/것이다/g, '것임');
  s = s.replace(/되었다\./g, '되었음.').replace(/되었다/g, '되었음');
  s = s.replace(/하였다\./g, '하였음.').replace(/하였다/g, '하였음');
  s = s.replace(/필요합\b/g, '필요함').replace(/요구됩\b/g, '요구됨');
  return s;
}

function topNamesFrom(arr, n) {
  const m = {};
  for (const v of arr) if (v) m[v] = (m[v] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => ({ name: k, count: c }));
}

// 1페이지 요약 데이터 — excluded=true 기사는 모든 분석에서 자동 제외
export function buildOnePageSummary(report) {
  const total = (report.articles || []).filter(a => !a.excluded).length;
  const sent  = report.sentiment   || {};
  const ag    = report.agencyStats || {};
  const pub   = report.publicityStats || {};
  const acts  = report.actionRequired || [];
  const negs  = report.negativeIssues || [];
  return {
    totalArticles: total,
    sentiment:     `긍 ${sent.positive || 0} / 부 ${sent.negative || 0} / 중 ${sent.neutral || 0} (${sent.overall || '중립'})`,
    negativeCount: negs.length,
    actionCount:   acts.length,
    urgentCount:   acts.filter(a => a.priority === '긴급').length,
    agencyCount:   ag.agency || 0,
    pressCount:    ag.press || 0,
    reCites:       pub.totalReCites || 0,
    centralCoverage: pub.centralCoverage || 0,
    leadIssue:     negs[0]?.title || (report.trending?.[0] ? `${report.trending[0].keyword} 보도 급상승` : '없음'),
  };
}

// 주요 이슈 TOP 5 — 이슈 유형별 + 상위 매체 / 감정 / 대응 필요도
export function buildTopIssues(report, limit = 5) {
  const articles = (report.articles || []).filter(a => !a.excluded);
  const counts = {};
  for (const a of articles) {
    const t = a.sentiment?.issueType;
    if (t && t !== '기타') counts[t] = (counts[t] || 0) + 1;
  }
  const out = [];
  for (const [type, cnt] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit)) {
    const arts = articles.filter(a => a.sentiment?.issueType === type);
    const media = topNamesFrom(arts.map(a => a.source), 3).map(x => x.name).join(', ');
    const sents = arts.reduce((m, a) => { const l = a.sentiment?.label || '중립'; m[l] = (m[l] || 0) + 1; return m; }, {});
    const urgent = arts.filter(a => a.priority === '긴급').length;
    const watch  = arts.filter(a => a.priority === '주의').length;
    out.push({
      type, count: cnt,
      sentSummary: ['긍정', '부정', '중립'].filter(k => sents[k]).map(k => `${k} ${sents[k]}`).join(' · '),
      media,
      need: urgent ? `긴급 ${urgent}건` : watch ? `주의 ${watch}건` : '참고',
    });
  }
  return out;
}

// 시사점 / 향후 모니터링 키워드
export function buildImplications(report) {
  const action   = report.actionRequired || [];
  const trending = report.trending || [];
  const out = { positive: [], negative: [], depts: [], watch: [] };
  if ((report.positiveIssues || []).length) {
    out.positive.push(`긍정 보도 ${report.positiveIssues.length}건은 정책 홍보 자료로 활용 가능함.`);
    const top = report.positiveIssues[0]?.title?.slice(0, 60);
    if (top) out.positive.push(`특히 「${top}」 보도의 SNS·홈페이지 재공유를 검토할 필요가 있음.`);
  } else {
    out.positive.push('금일 별도의 긍정 활용 가능 이슈는 식별되지 않았음.');
  }
  const urgent = action.filter(a => a.priority === '긴급');
  const watch  = action.filter(a => a.priority === '주의');
  if (urgent.length) {
    out.negative.push(`긴급 대응 이슈 ${urgent.length}건에 대해 사실관계 확인 후 보도해명 또는 입장 정리가 즉시 요구됨.`);
    urgent.slice(0, 3).forEach(a => out.negative.push(`「${(a.title || '').slice(0, 70)}」 — [${a.source || '미상'}]`));
  }
  if (watch.length) out.negative.push(`주의 단계 이슈 ${watch.length}건은 추이 관찰 후 추가 확산 시 대응 자료 준비가 필요함.`);
  if (!urgent.length && !watch.length) out.negative.push('금일 즉각 대응이 필요한 부정 이슈는 식별되지 않았음.');

  const dept = Object.entries(report.departmentCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (dept.length) {
    out.depts.push(`주요 관계 부서별 보도량: ${dept.map(([k, v]) => `${k} ${v}건`).join(', ')}.`);
    out.depts.push('각 관계 부서는 해당 보도 내용을 검토하여 필요 시 추가 자료 준비가 요구됨.');
  } else {
    out.depts.push('관계 부서 분류 결과가 없어 향후 부서 매칭 사전 보강이 필요함.');
  }

  if (trending.length) out.watch.push(`급상승 키워드 ${trending.slice(0, 5).map(t => t.keyword).join(', ')} 모니터링 강화가 요구됨.`);
  const negKws = [...new Set((action || []).flatMap(a => a.sentiment?.matchedKeywords?.negative || []))].slice(0, 8);
  if (negKws.length) out.watch.push(`반복 등장한 부정 키워드(${negKws.join(', ')})는 알림 등록 검토가 필요함.`);
  if (!out.watch.length) out.watch.push('금일 추가 모니터링이 요구되는 신규 키워드는 식별되지 않았음.');
  return out;
}

// ── 분석 보고서 HTML ───────────────────────────
export function renderAnalysisHtml(report, opts = {}) {
  const meta = report.reportMeta || opts.reportMeta || {};
  const today = fmtDate(report.generatedAt);
  const sum = buildOnePageSummary(report);
  const top = buildTopIssues(report);
  const imp = buildImplications(report);
  const ag  = report.agencyStats || {};
  const pub = report.publicityStats || {};
  const sent = report.sentiment || {};
  const tlinks = opts.tracking?.items || [];
  const tracking = opts.tracking || { totalLinks: 0, totalClicks: 0, items: [] };

  const titleStr = `${today} ${meta.organization || '법무부'} 언론보도 모니터링 분석보고`;

  const overviewSentences = [
    `금일 ${(report.keywords || []).join('·')} 관련 언론보도는 총 ${sum.totalArticles}건으로 집계됨.`,
    sent.total ? `감정 분포는 ${sum.sentiment} 으로, 전반적 분위기는 ${sent.overall || '중립'} 으로 판단됨.` : '',
    `발행 주체별로는 기관 배포자료 ${ag.agency || 0}건, 일반 언론보도 ${ag.press || 0}건으로 구성됨.`,
    pub.totalReCites > 0 ? `기관 배포자료의 언론 재인용은 ${pub.totalReCites}건이며, 중앙·방송사 인용은 ${pub.centralCoverage || 0}건임.` : '',
    sum.urgentCount ? `긴급 대응 이슈 ${sum.urgentCount}건이 식별되어 신속한 대응이 요구됨.` : '긴급 대응이 요구되는 이슈는 식별되지 않았음.',
  ].filter(Boolean);

  // 한글 폰트는 base64 inline @font-face 로 임베드 — Render Linux 호환.
  const fontFaceCss = getKoreanFontFaceCss();

  return /* html */ `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" />
<title>${esc(titleStr)}</title>
<style>
  ${fontFaceCss}
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: ${FONT_STACK_SANS}; color:#0d1117; line-height:1.7; font-size:10.5pt; }
  h1 { font-size: 18pt; border-bottom: 1.5pt solid #0d1117; padding-bottom: 4pt; margin: 18pt 0 8pt; page-break-after: avoid; }
  h2 { font-size: 13pt; margin: 14pt 0 6pt; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 10pt 0 4pt; }
  table { width:100%; border-collapse: collapse; font-size: 10pt; margin: 6pt 0; }
  th, td { border: .5pt solid #999; padding: 4pt 6pt; vertical-align: top; text-align: left; }
  th { background: #f0ede8; }
  ul, ol { padding-left: 18pt; }
  li { margin: 3pt 0; }

  .a-cover { text-align: center; padding: 30mm 0 22mm; page-break-after: always; }
  .a-cover .cls { color:#991b1b; font-weight:700; font-size: 11pt; }
  .a-cover .org { color:#555; font-size: 14pt; margin-top: 8pt; }
  .a-cover .ttl { font-size: 24pt; font-weight: 700; margin: 10pt 0 8pt; }
  .a-cover .sub { color:#666; font-size: 12pt; }

  .a-summary {
    border: 1.2pt solid #0d1117;
    padding: 12pt 16pt;
    margin: 0 0 10pt;
    background: #fafaf6;
  }
  .a-summary h2 { margin-top: 0; }
  .a-summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin-top: 6pt; }
  .a-cell { background: white; border: .5pt solid #d5d0c8; border-radius: 4pt; padding: 6pt 8pt; }
  .a-cell .lab { font-size: 9pt; color: #666; font-weight: 600; }
  .a-cell .val { font-size: 14pt; font-weight: 800; }
  .a-cell .sub { font-size: 9pt; color: #888; margin-top: 2pt; }

  .a-narrative p { margin: 4pt 0; }

  .a-pos { color: #16a34a; font-weight: 600; }
  .a-neg { color: #dc2626; font-weight: 600; }
  .a-neu { color: #888; }

  .a-section { page-break-inside: avoid; }
  .a-mute { color:#666; font-size: 9.5pt; }
  .a-bullet li { list-style: none; position: relative; padding-left: 12pt; }
  .a-bullet li::before { content:"○"; position: absolute; left: 0; color: #0d1117; font-size: 9pt; }
</style></head><body>
<div id="report-pdf-root">
  <section class="a-cover">
    <div class="cls">${esc(meta.classification || '내부 검토용')}</div>
    <div class="org">${esc(meta.organization || '법무부')}</div>
    <div class="ttl">${esc(titleStr)}</div>
    <div class="sub">${esc(today)} · ${esc(meta.department || '대변인실')}</div>
  </section>

  <!-- ① 상급자 보고용 1페이지 요약 -->
  <section class="a-summary">
    <h2>📌 상급자 보고용 1페이지 요약</h2>
    <div class="a-summary-grid">
      <div class="a-cell"><div class="lab">총 보도</div><div class="val">${sum.totalArticles}건</div><div class="sub">${esc(sum.sentiment)}</div></div>
      <div class="a-cell"><div class="lab">부정 이슈</div><div class="val a-neg">${sum.negativeCount}건</div><div class="sub">긴급 ${sum.urgentCount}건</div></div>
      <div class="a-cell"><div class="lab">대응 필요</div><div class="val">${sum.actionCount}건</div><div class="sub">우선 검토 요</div></div>
      <div class="a-cell"><div class="lab">홍보 성과</div><div class="val">${sum.reCites}건</div><div class="sub">기관 배포 ${sum.agencyCount}건</div></div>
    </div>
    <p style="margin-top:8pt;"><strong>오늘의 핵심 이슈:</strong> ${esc(sum.leadIssue)}</p>
  </section>

  <!-- ② 보고 개요 -->
  <h1>1. 보고 개요</h1>
  <table>
    <tr><th style="width:25%">수집 목적</th><td>${esc(formalize(meta.purpose || '주요 정책 및 업무 관련 언론 보도 동향을 파악하여 신속한 대응자료로 활용함.'))}</td></tr>
    <tr><th>수집 기간</th><td>${esc(fmtDate(report.period?.from))} ~ ${esc(fmtDate(report.period?.to))} (${esc(report.period?.label || '-')})</td></tr>
    <tr><th>수집 키워드</th><td>${(report.keywords || []).map(esc).join(', ') || '—'}</td></tr>
    <tr><th>수집 매체</th><td>구글 뉴스(전 세계), 네이버 뉴스(국내)</td></tr>
    <tr><th>총 수집 건수</th><td>${sum.totalArticles}건 (본문 추출 ${report.extractedCount || 0}건)</td></tr>
  </table>

  <!-- ③ 종합 분석 -->
  <h1>2. 종합 분석</h1>
  <div class="a-narrative">
    <ul class="a-bullet">${overviewSentences.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  </div>

  <!-- ④ 주요 이슈 TOP 5 -->
  <h1>3. 주요 이슈 TOP 5</h1>
  ${top.length ? `<table>
    <tr><th>#</th><th>이슈</th><th>건수</th><th>주요 매체</th><th>감정</th><th>대응 필요도</th></tr>
    ${top.map((t, i) => `<tr><td>${i+1}</td><td>${esc(t.type)}</td><td>${t.count}건</td><td>${esc(t.media || '—')}</td><td>${esc(t.sentSummary || '—')}</td><td>${esc(t.need)}</td></tr>`).join('')}
  </table>` : '<p>— 분류된 이슈 없음.</p>'}

  <!-- ⑤ 긍·부·중 -->
  <h1>4. 긍정 · 부정 · 중립 분석</h1>
  <p>전체 ${sum.totalArticles}건 중 긍정 ${sent.positive || 0}건(${sent.positivePct || 0}%), 부정 ${sent.negative || 0}건(${sent.negativePct || 0}%), 중립 ${sent.neutral || 0}건(${sent.neutralPct || 0}%) 으로 집계되었으며, 전반적 분위기는 <strong>${esc(sent.overall || '중립')}</strong> 으로 판단됨.</p>
  ${(sent.negativePct || 0) >= 50 ? `<p class="a-neg">※ 부정 보도 비율이 ${sent.negativePct}% 로 위험 수위를 상회하므로, 비판 논점에 대한 대응 메시지 정리가 필요함.</p>` : ''}
  ${(report.negativeIssues || []).length ? `<h3>부정 이슈 (${report.negativeIssues.length})</h3>
  <ol>${report.negativeIssues.slice(0, 8).map(a => `<li><strong>${esc(a.title)}</strong> <span class="a-mute">[${esc(a.source || '')}]</span> — 근거: ${esc((a.sentiment?.matchedKeywords?.negative || []).slice(0, 4).join(', '))}</li>`).join('')}</ol>` : ''}
  ${(report.positiveIssues || []).length ? `<h3>긍정 이슈 (${report.positiveIssues.length})</h3>
  <ol>${report.positiveIssues.slice(0, 8).map(a => `<li><strong>${esc(a.title)}</strong> <span class="a-mute">[${esc(a.source || '')}]</span></li>`).join('')}</ol>` : ''}

  <!-- ⑥ 기관 배포 / 홍보 실적 -->
  <h1>5. 기관 배포자료 및 홍보 실적</h1>
  <p>기관에서 배포한 보도자료는 총 <strong>${pub.agencyDistributed || 0}건</strong>, 언론 재인용은 <strong>${pub.totalReCites || 0}건</strong>, 중앙언론·방송사 보도 포함은 <strong>${pub.centralCoverage || 0}건</strong>으로 집계됨.</p>
  ${(pub.topAgencyItems || []).length ? `<table>
    <tr><th>기관</th><th>주요 제목</th><th>재인용</th><th>평가</th></tr>
    ${pub.topAgencyItems.slice(0, 8).map(it => `<tr><td>${esc(it.agency || it.source || '—')}</td><td>${esc((it.title || '').slice(0, 80))}</td><td>${it.reCiteCount || 0}건</td><td>${esc(it.rating || '일반')}</td></tr>`).join('')}
  </table>` : '<p class="a-mute">— 식별된 기관 배포자료 없음. 추가 매체 등록 또는 키워드 보강 필요함.</p>'}

  <!-- ⑦ 언론 재인용 -->
  <h1>6. 언론 재인용 현황</h1>
  ${(report.groups || []).length ? `<table>
    <tr><th>대표 제목</th><th>대표 매체</th><th>재인용</th><th>주요 매체</th></tr>
    ${(report.groups || []).slice(0, 10).map(g => `<tr><td>${esc((g.leadTitle || '').slice(0, 80))}</td><td>${esc(g.leadSource || '')}</td><td>${g.count || 0}건</td><td class="a-mute">${esc((g.sources || []).slice(0, 6).join(', '))}</td></tr>`).join('')}
  </table>` : '<p class="a-mute">— 동일 이슈 묶음 없음.</p>'}

  <!-- ⑧ 클릭 추적 / 관심도 지표 -->
  <h1>7. 클릭 추적 · 관심도 지표</h1>
  <p>등록된 추적 링크 ${tracking.totalLinks || 0}건의 누적 클릭은 <strong>${tracking.totalClicks || 0}회</strong>임. 매체 다양성 ${Object.keys(report.sourceCounts || {}).length}종, 동일 이슈 묶음 ${(report.groups || []).length}건이 확인됨.</p>
  ${tlinks.length ? `<table>
    <tr><th>제목</th><th>기관/부서</th><th>클릭</th><th>최근 클릭</th></tr>
    ${tlinks.slice().sort((a, b) => (b.clickCount || 0) - (a.clickCount || 0)).slice(0, 8).map(t => `<tr><td>${esc((t.title || '').slice(0, 80))}</td><td>${esc(t.agency || t.department || '—')}</td><td>${t.clickCount || 0}회</td><td class="a-mute">${t.lastClickedAt ? esc(fmtKST(t.lastClickedAt)) : '—'}</td></tr>`).join('')}
  </table>` : ''}

  <!-- ⑨ 대응 필요사항 -->
  <h1>8. 대응 필요사항</h1>
  <h3>가. 긍정 이슈 활용 방안</h3>
  <ul class="a-bullet">${imp.positive.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  <h3>나. 부정 이슈 대응</h3>
  <ul class="a-bullet">${imp.negative.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  <h3>다. 관계 부서 참고사항</h3>
  <ul class="a-bullet">${imp.depts.map(s => `<li>${esc(s)}</li>`).join('')}</ul>

  <!-- ⑩ 향후 모니터링 키워드 -->
  <h1>9. 향후 모니터링 필요 키워드</h1>
  <ul class="a-bullet">${imp.watch.map(s => `<li>${esc(s)}</li>`).join('')}</ul>

  <!-- 붙임: 전체 기사 목록 (제외 기사 자동 제외) -->
  <h1>붙임. 전체 기사 목록</h1>
  ${sum.totalArticles ? `<table>
    <tr><th>#</th><th>날짜</th><th>제목</th><th>매체</th><th>유형</th><th>감정</th></tr>
    ${(report.articles || []).filter(a => !a.excluded).map((a, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(a.date || '')}</td>
      <td>${esc((a.title || '').slice(0, 90))}</td>
      <td>${esc(a.source || '')}</td>
      <td>${esc(a.mediaType || '')}</td>
      <td>${esc(a.sentiment?.label || '')}</td>
    </tr>`).join('')}
  </table>` : '<p class="a-mute">— 수집된 기사가 없음.</p>'}

  <p style="text-align:center; color:#888; font-size: 9.5pt; margin-top: 14pt;">
    — Trend Collector 자동 생성 분석 보고 — 내부 업무용 ·  ${esc(fmtKST(report.generatedAt))} —
  </p>
</div>
</body></html>`;
}
