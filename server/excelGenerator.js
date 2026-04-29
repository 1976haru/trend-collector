// ─────────────────────────────────────────────
// excelGenerator.js — 보고서 → .xlsx (7 시트)
// 1) 요약  2) 전체 기사  3) 기관 배포자료  4) 언론 재인용 현황
// 5) 클릭 추적 현황  6) 부정 이슈  7) 부서별 대응
// 모든 데이터 시트는 자동 필터, 헤더 고정, 감정·위험도 색상, 자동 컬럼 폭 적용.
// ─────────────────────────────────────────────

import ExcelJS from 'exceljs';

function fmtKST(iso) {
  try { return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }); } catch { return iso || ''; }
}
function fmtDateOnly(iso) {
  try { return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }); } catch { return iso || ''; }
}

function applyHeaderStyle(row) {
  row.font   = { bold: true, color: { argb: 'FF0D1117' }, size: 11, name: 'Malgun Gothic' };
  row.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0EDE8' } };
  row.alignment = { vertical: 'middle', horizontal: 'left' };
  row.height = 22;
  row.eachCell(c => {
    c.border = {
      top:    { style: 'medium', color: { argb: 'FF0D1117' } },
      bottom: { style: 'medium', color: { argb: 'FF0D1117' } },
      left:   { style: 'thin',   color: { argb: 'FFD0D0D0' } },
      right:  { style: 'thin',   color: { argb: 'FFD0D0D0' } },
    };
  });
}

function sentimentArgb(label) {
  if (label === '긍정') return 'FF16A34A';
  if (label === '부정') return 'FFDC2626';
  return 'FF888888';
}
function priorityFill(p) {
  if (p === '긴급') return 'FFFEE2E2';
  if (p === '주의') return 'FFFEF3C7';
  return null;
}

function autoFitColumns(ws, samples = 4) {
  ws.columns.forEach(col => {
    let max = (col.header || '').length + 2;
    col.eachCell({ includeEmpty: false }, cell => {
      const v = cell.value;
      const s = v && typeof v === 'object' && v.text ? v.text
              : v == null ? '' : String(v);
      const len = Array.from(s).reduce((n, ch) => n + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);
      if (len > max) max = len;
    });
    col.width = Math.min(Math.max(max + 1, 8), 60);
  });
  // header 고정
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  // 자동 필터
  if (ws.rowCount >= 1 && ws.columnCount >= 1) {
    const lastCol = String.fromCharCode(64 + ws.columnCount);
    ws.autoFilter = { from: 'A1', to: `${lastCol}${ws.rowCount}` };
  }
}

// 공통 — 기사 시트 생성
function addArticleSheet(wb, name, articles) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: '날짜',     key: 'date',     width: 18 },
    { header: '제목',     key: 'title',    width: 60 },
    { header: '매체',     key: 'media',    width: 16 },
    { header: '유형',     key: 'mediaType',width: 12 },
    { header: '발행 주체', key: 'src',     width: 10 },
    { header: '키워드',   key: 'keyword',  width: 14 },
    { header: '감정',     key: 'sentiment',width: 8 },
    { header: '우선순위', key: 'priority', width: 8 },
    { header: '관련 부서', key: 'depts',   width: 22 },
    { header: '재인용',   key: 'recite',   width: 8 },
    { header: '평가',     key: 'rating',   width: 12 },
    { header: '링크',     key: 'url',      width: 50 },
  ];
  applyHeaderStyle(ws.getRow(1));

  for (const a of articles) {
    const row = ws.addRow({
      date:      a.date || fmtDateOnly(a.rawDate || ''),
      title:     a.title || '',
      media:     a.source || '',
      mediaType: a.mediaType || '',
      src:       a.articleSource === 'agency' ? '기관' : '언론',
      keyword:   a.keyword || '',
      sentiment: a.sentiment?.label || '',
      priority:  a.priority || '',
      depts:     (a.departments || []).map(d => d.name).join(', '),
      recite:    a.reCiteCount || 0,
      rating:    a.publicityRating || '',
      url:       a.url || '',
    });
    // 감정 색
    row.getCell('sentiment').font = { color: { argb: sentimentArgb(a.sentiment?.label) }, bold: true, name: 'Malgun Gothic' };
    // 위험도 행 배경
    const fillArgb = priorityFill(a.priority);
    if (fillArgb) {
      row.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
      });
    }
    // 링크
    if (a.url) {
      row.getCell('url').value = { text: a.url, hyperlink: a.url };
      row.getCell('url').font  = { color: { argb: 'FF2563EB' }, underline: true, name: 'Malgun Gothic' };
    }
  }
  autoFitColumns(ws);
  return ws;
}

// 1) 요약
function addSummarySheet(wb, report, tracking) {
  const ws = wb.addWorksheet('1.요약');
  ws.columns = [
    { header: '항목', key: 'k', width: 26 },
    { header: '내용', key: 'v', width: 70 },
  ];
  applyHeaderStyle(ws.getRow(1));

  const sent  = report.sentiment   || {};
  const ag    = report.agencyStats || {};
  const pub   = report.publicityStats || {};
  const total = (report.articles || []).length;

  const rows = [
    ['보고서 ID',     report.id || ''],
    ['생성 일시',     fmtKST(report.generatedAt)],
    ['수집 기간',     `${fmtDateOnly(report.period?.from)} ~ ${fmtDateOnly(report.period?.to)} (${report.period?.label || '-'})`],
    ['검색 키워드',   (report.keywords || []).join(', ') || '—'],
    ['총 기사 수',    `${total}건`],
    ['긍정/부정/중립', `${sent.positive || 0} / ${sent.negative || 0} / ${sent.neutral || 0} (${sent.overall || ''})`],
    ['기관 배포 / 언론 보도', `${ag.agency || 0}건 / ${ag.press || 0}건`],
    ['기관 자료 평균 중요도', `${pub.averageImportance || 0}`],
    ['언론 재인용 합계',     `${pub.totalReCites || 0}건`],
    ['중앙언론 인용',       `${pub.centralCoverage || 0}건`],
    ['추적 링크 수 / 클릭', `${tracking?.totalLinks || 0} / ${tracking?.totalClicks || 0}회`],
    ['위험 등급',     `${report.riskLevel?.level || ''} ${report.riskLevel?.reasons?.length ? '(' + report.riskLevel.reasons.join(', ') + ')' : ''}`],
  ];
  rows.forEach(r => ws.addRow({ k: r[0], v: r[1] }));

  // 매체 유형
  ws.addRow([]);
  const h2 = ws.addRow({ k: '언론 유형', v: '건수' });
  applyHeaderStyle(h2);
  Object.entries(report.mediaCounts || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => ws.addRow({ k, v: `${v}건` }));

  ws.columns.forEach(c => { c.width = c.width || 26; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// 4) 언론 재인용 현황 — 그룹 단위
function addReCitationSheet(wb, report) {
  const ws = wb.addWorksheet('4.언론재인용현황');
  ws.columns = [
    { header: '대표 제목',  key: 'title',  width: 60 },
    { header: '대표 매체',  key: 'lead',   width: 18 },
    { header: '재인용 건수', key: 'count', width: 12 },
    { header: '인용 매체 수', key: 'srcs', width: 12 },
    { header: '주요 매체',  key: 'list',   width: 50 },
    { header: '대표 키워드', key: 'kw',    width: 14 },
  ];
  applyHeaderStyle(ws.getRow(1));
  const groups = (report.groups || []).slice().sort((a, b) => (b.count || 0) - (a.count || 0));
  for (const g of groups) {
    ws.addRow({
      title: g.leadTitle || '',
      lead:  g.leadSource || '',
      count: g.count || 0,
      srcs:  (g.sources || []).length,
      list:  (g.sources || []).join(', '),
      kw:    g.leadKeyword || '',
    });
  }
  if (!groups.length) ws.addRow({ title: '— 재인용 그룹 없음', lead: '', count: 0, srcs: 0, list: '', kw: '' });
  autoFitColumns(ws);
}

// 5) 클릭 추적 현황
function addClickSheet(wb, tracking) {
  const ws = wb.addWorksheet('5.클릭추적현황');
  ws.columns = [
    { header: '제목',     key: 'title',   width: 50 },
    { header: '기관/부서', key: 'agency', width: 22 },
    { header: '클릭 수',  key: 'clicks',  width: 10 },
    { header: '최근 클릭', key: 'last',   width: 24 },
    { header: '생성일',   key: 'created', width: 24 },
    { header: '추적 ID',  key: 'tid',     width: 14 },
    { header: '원문 URL', key: 'url',     width: 60 },
  ];
  applyHeaderStyle(ws.getRow(1));
  const items = (tracking?.items || []).slice().sort((a, b) => (b.clickCount || 0) - (a.clickCount || 0));
  for (const t of items) {
    const row = ws.addRow({
      title:   t.title || '',
      agency:  t.agency || t.department || '',
      clicks:  t.clickCount || 0,
      last:    t.lastClickedAt ? fmtKST(t.lastClickedAt) : '—',
      created: fmtKST(t.createdAt),
      tid:     t.id,
      url:     t.originalUrl || '',
    });
    if (t.originalUrl) {
      row.getCell('url').value = { text: t.originalUrl, hyperlink: t.originalUrl };
      row.getCell('url').font  = { color: { argb: 'FF2563EB' }, underline: true, name: 'Malgun Gothic' };
    }
    if ((t.clickCount || 0) >= 100) {
      row.getCell('clicks').font = { bold: true, color: { argb: 'FF16A34A' }, name: 'Malgun Gothic' };
    }
  }
  if (!items.length) ws.addRow({ title: '— 등록된 추적 링크 없음', agency: '', clicks: 0, last: '', created: '', tid: '', url: '' });
  autoFitColumns(ws);
}

// 7) 부서별 대응 목록
function addDeptResponseSheet(wb, report) {
  const ws = wb.addWorksheet('7.부서별대응');
  ws.columns = [
    { header: '관련 부서', key: 'dept',   width: 24 },
    { header: '제목',     key: 'title',   width: 60 },
    { header: '매체',     key: 'media',   width: 18 },
    { header: '감정',     key: 'sent',    width: 10 },
    { header: '우선순위', key: 'priority',width: 10 },
    { header: '재인용',   key: 'recite',  width: 10 },
    { header: '링크',     key: 'url',     width: 50 },
  ];
  applyHeaderStyle(ws.getRow(1));
  const arts = (report.articles || [])
    .filter(a => (a.priority === '긴급' || a.priority === '주의') || (a.departments || []).length > 0)
    .sort((a, b) => {
      const order = { '긴급': 0, '주의': 1, '참고': 2 };
      return (order[a.priority] || 3) - (order[b.priority] || 3);
    });
  for (const a of arts) {
    const row = ws.addRow({
      dept:    (a.departments || []).map(d => d.name).join(', ') || '—',
      title:   a.title || '',
      media:   a.source || '',
      sent:    a.sentiment?.label || '',
      priority: a.priority || '',
      recite:  a.reCiteCount || 0,
      url:     a.url || '',
    });
    row.getCell('sent').font = { color: { argb: sentimentArgb(a.sentiment?.label) }, bold: true, name: 'Malgun Gothic' };
    const fillArgb = priorityFill(a.priority);
    if (fillArgb) {
      row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }; });
    }
    if (a.url) {
      row.getCell('url').value = { text: a.url, hyperlink: a.url };
      row.getCell('url').font  = { color: { argb: 'FF2563EB' }, underline: true, name: 'Malgun Gothic' };
    }
  }
  if (!arts.length) ws.addRow({ dept: '—', title: '대응 필요 기사 없음', media: '', sent: '', priority: '', recite: '', url: '' });
  autoFitColumns(ws);
}

// ── 메인 ───────────────────────────────────
export async function reportToXlsx(report, ctx = {}) {
  const tracking = ctx.tracking || { totalLinks: 0, totalClicks: 0, items: [] };
  const wb = new ExcelJS.Workbook();
  wb.creator   = 'Trend Collector';
  wb.created   = new Date();
  wb.title     = report.title || '법무부 언론보도 분석';

  addSummarySheet(wb, report, tracking);

  const articles = report.articles || [];
  addArticleSheet(wb, '2.전체기사', articles);
  addArticleSheet(wb, '3.기관배포자료', articles.filter(a => a.articleSource === 'agency'));
  addReCitationSheet(wb, report);
  addClickSheet(wb, tracking);
  addArticleSheet(wb, '6.부정이슈', articles.filter(a => a.sentiment?.label === '부정'));
  addDeptResponseSheet(wb, report);

  return wb.xlsx.writeBuffer().then(b => Buffer.from(b));
}
