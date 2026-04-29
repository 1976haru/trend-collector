// ─────────────────────────────────────────────
// excelGenerator.js — 보고서 → .xlsx
// 시트 1: 기관 배포 자료 (홍보 실적)
// 시트 2: 일반 언론 보도
// 시트 3: 매체별 집계 + 기관별 집계
// ─────────────────────────────────────────────

import ExcelJS from 'exceljs';

function fmtKST(iso) {
  try { return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }); } catch { return iso || ''; }
}
function fmtDateOnly(iso) {
  try { return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }); } catch { return iso || ''; }
}

function applyHeaderStyle(row) {
  row.font   = { bold: true, color: { argb: 'FF0D1117' }, size: 11 };
  row.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0EDE8' } };
  row.alignment = { vertical: 'middle', horizontal: 'left' };
  row.height = 22;
}

function sentimentColor(label) {
  if (label === '긍정') return 'FF16A34A';
  if (label === '부정') return 'FFDC2626';
  return 'FF888888';
}

function addArticleSheet(wb, name, articles) {
  const ws = wb.addWorksheet(name);
  ws.columns = [
    { header: '날짜',   key: 'date',     width: 18 },
    { header: '기관',   key: 'agency',   width: 18 },
    { header: '제목',   key: 'title',    width: 60 },
    { header: '매체',   key: 'media',    width: 18 },
    { header: '키워드', key: 'keyword',  width: 14 },
    { header: '감정',   key: 'sentiment',width: 10 },
    { header: '우선순위', key: 'priority', width: 10 },
    { header: '링크',   key: 'url',      width: 60 },
  ];
  applyHeaderStyle(ws.getRow(1));

  for (const a of articles) {
    const row = ws.addRow({
      date:      a.date || fmtDateOnly(a.rawDate || ''),
      agency:    a.articleSource === 'agency' ? (a.source || '미상') : '—',
      title:     a.title || '',
      media:     a.source || '',
      keyword:   a.keyword || '',
      sentiment: a.sentiment?.label || '',
      priority:  a.priority || '',
      url:       a.url || '',
    });
    // 감정 색
    const sCell = row.getCell('sentiment');
    sCell.font = { color: { argb: sentimentColor(a.sentiment?.label) }, bold: true };
    // 링크
    const uCell = row.getCell('url');
    if (a.url) {
      uCell.value = { text: a.url, hyperlink: a.url };
      uCell.font  = { color: { argb: 'FF2563EB' }, underline: true };
    }
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

function addSummarySheet(wb, report) {
  const ws = wb.addWorksheet('요약');
  ws.columns = [
    { header: '항목', key: 'k', width: 24 },
    { header: '내용', key: 'v', width: 60 },
  ];
  applyHeaderStyle(ws.getRow(1));
  const sent  = report.sentiment || {};
  const ag    = report.agencyStats || {};
  const total = (report.articles || []).length;

  const rows = [
    ['보고서 ID',     report.id || ''],
    ['생성 일시',     fmtKST(report.generatedAt)],
    ['수집 기간',     `${fmtDateOnly(report.period?.from)} ~ ${fmtDateOnly(report.period?.to)} (${report.period?.label || '-'})`],
    ['검색 키워드',   (report.keywords || []).join(', ') || '—'],
    ['총 기사 수',    `${total}건`],
    ['긍정 / 부정 / 중립', `${sent.positive || 0} / ${sent.negative || 0} / ${sent.neutral || 0} (${sent.overall || ''})`],
    ['기관 배포 / 언론 보도', `${ag.agency || 0}건 / ${ag.press || 0}건`],
    ['위험 등급',     `${report.riskLevel?.level || ''} ${report.riskLevel?.reasons?.length ? '(' + report.riskLevel.reasons.join(', ') + ')' : ''}`],
  ];
  rows.forEach(r => ws.addRow({ k: r[0], v: r[1] }));

  // 매체별
  ws.addRow([]);
  const h2 = ws.addRow({ k: '언론 유형', v: '건수' });
  applyHeaderStyle(h2);
  Object.entries(report.mediaCounts || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => ws.addRow({ k, v: `${v}건` }));

  // 기관별
  ws.addRow([]);
  const h3 = ws.addRow({ k: '기관 (배포자료)', v: '건수' });
  applyHeaderStyle(h3);
  const byAgency = Object.entries(ag.byAgency || {}).sort((a, b) => b[1] - a[1]);
  if (byAgency.length) {
    byAgency.forEach(([k, v]) => ws.addRow({ k, v: `${v}건` }));
  } else {
    ws.addRow({ k: '—', v: '기관 배포자료 없음' });
  }
}

export async function reportToXlsx(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator   = 'Trend Collector';
  wb.created   = new Date();
  wb.title     = report.title || '법무부 언론보도 분석';

  addSummarySheet(wb, report);

  const articles = report.articles || [];
  const agency = articles.filter(a => a.articleSource === 'agency');
  const press  = articles.filter(a => a.articleSource !== 'agency');

  addArticleSheet(wb, '기관 배포 자료', agency);
  addArticleSheet(wb, '언론 보도',     press);
  addArticleSheet(wb, '전체 기사',     articles);

  return wb.xlsx.writeBuffer().then(b => Buffer.from(b));
}
