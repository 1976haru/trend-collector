// ─────────────────────────────────────────────
// excelGenerator.js — 보고서 → .xlsx (7 시트)
// 1) 요약  2) 전체 기사  3) 기관 배포자료  4) 언론 재인용 현황
// 5) 클릭 추적 현황  6) 부정 이슈  7) 부서별 대응
// 모든 데이터 시트는 자동 필터, 헤더 고정, 감정·위험도 색상, 자동 컬럼 폭 적용.
// ─────────────────────────────────────────────

import ExcelJS from 'exceljs';
import { APP_NAME, getAppVersion } from './changelog.js';

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
    ['프로그램',      `${APP_NAME} v${getAppVersion()}`],
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

// 5) 클릭 추적 현황 — 추적방식(자동/수동) + 카테고리 컬럼 추가 (자동/수동 구분 표시)
function addClickSheet(wb, tracking) {
  const ws = wb.addWorksheet('5.클릭추적현황');
  ws.columns = [
    { header: '추적방식',  key: 'mode',    width: 10 },
    { header: '기관분류',  key: 'cat',     width: 16 },
    { header: '제목',      key: 'title',   width: 50 },
    { header: '기관/부서', key: 'agency',  width: 22 },
    { header: '클릭 수',   key: 'clicks',  width: 10 },
    { header: '최근 클릭', key: 'last',    width: 24 },
    { header: '생성일',    key: 'created', width: 24 },
    { header: '추적 ID',   key: 'tid',     width: 14 },
    { header: '원문 URL',  key: 'url',     width: 60 },
  ];
  applyHeaderStyle(ws.getRow(1));
  const items = (tracking?.items || []).slice().sort((a, b) => (b.clickCount || 0) - (a.clickCount || 0));
  for (const t of items) {
    const row = ws.addRow({
      mode:    t.trackingMode === 'auto' ? '자동' : '수동',
      cat:     t.agencyCategory || '',
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
    if (t.trackingMode === 'auto') {
      row.getCell('mode').font = { bold: true, color: { argb: 'FF1D4ED8' }, name: 'Malgun Gothic' };
    }
  }
  if (!items.length) ws.addRow({ mode: '', cat: '', title: '— 등록된 추적 링크 없음', agency: '', clicks: 0, last: '', created: '', tid: '', url: '' });
  autoFitColumns(ws);
}

// 6) 자동추적현황 — 기관 배포자료가 자동 등록된 항목 + 기관별 클릭 합계
function addAutoTrackingSheet(wb, tracking) {
  const ws = wb.addWorksheet('6.자동추적현황');
  ws.columns = [
    { header: '기관분류', key: 'cat',     width: 16 },
    { header: '기관',     key: 'agency',  width: 22 },
    { header: '제목',     key: 'title',   width: 50 },
    { header: '클릭 수',  key: 'clicks',  width: 10 },
    { header: '최근 클릭', key: 'last',   width: 24 },
    { header: '추적 URL', key: 'turl',    width: 50 },
    { header: '원문 URL', key: 'url',     width: 60 },
  ];
  applyHeaderStyle(ws.getRow(1));
  const auto = (tracking?.items || []).filter(t => t.trackingMode === 'auto')
    .sort((a, b) => (b.clickCount || 0) - (a.clickCount || 0));
  const baseUrl = process.env.BASE_URL || '';
  for (const t of auto) {
    const tUrl = `${baseUrl || ''}/r/${t.id}`;
    const row = ws.addRow({
      cat:     t.agencyCategory || '',
      agency:  t.agency || '',
      title:   t.title || '',
      clicks:  t.clickCount || 0,
      last:    t.lastClickedAt ? fmtKST(t.lastClickedAt) : '—',
      turl:    tUrl,
      url:     t.originalUrl || '',
    });
    row.getCell('turl').value = { text: tUrl, hyperlink: tUrl };
    row.getCell('turl').font  = { color: { argb: 'FF2563EB' }, underline: true, name: 'Malgun Gothic' };
    if (t.originalUrl) {
      row.getCell('url').value = { text: t.originalUrl, hyperlink: t.originalUrl };
      row.getCell('url').font  = { color: { argb: 'FF2563EB' }, underline: true, name: 'Malgun Gothic' };
    }
  }
  if (!auto.length) ws.addRow({ cat: '', agency: '', title: '— 자동 등록된 기관 배포자료 없음', clicks: 0, last: '', turl: '', url: '' });

  // 빈 줄 + 카테고리별 집계
  ws.addRow({});
  const head = ws.addRow({ cat: '카테고리별 집계', agency: '건수', title: '클릭 합계' });
  head.font = { bold: true, name: 'Malgun Gothic' };
  const byCat = {};
  for (const t of auto) {
    const k = t.agencyCategory || '미분류';
    if (!byCat[k]) byCat[k] = { count: 0, clicks: 0 };
    byCat[k].count  += 1;
    byCat[k].clicks += (t.clickCount || 0);
  }
  for (const [k, v] of Object.entries(byCat)) {
    ws.addRow({ cat: k, agency: v.count + '건', title: v.clicks + '회' });
  }
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

// ── 언론사별 목차 시트 ───────────────────────
function addMediaTocSheet(wb, report) {
  const ws = wb.addWorksheet('언론사별목차');
  ws.columns = [
    { header: '언론사',  key: 'media',  width: 18 },
    { header: '지면',    key: 'page',   width: 12 },
    { header: '제목',    key: 'title',  width: 70 },
    { header: '날짜',    key: 'date',   width: 16 },
    { header: '링크',    key: 'url',    width: 50 },
  ];
  applyHeaderStyle(ws.getRow(1));
  const overrides = report.articleOverrides || {};
  const rows = (report.articles || []).map(a => {
    const o = overrides[a.id] || {};
    return {
      a, o,
      media: o.source ?? a.source ?? '미상',
      page:  o.pageLabel ?? a.pageLabel ?? (a.url ? '온라인' : '-'),
      title: o.title ?? a.title ?? '',
      date:  o.publishedAt ?? a.date ?? '',
      url:   a.url || '',
      include: o.includeInClipping !== false,
    };
  }).filter(r => r.include);
  rows.sort((x, y) => {
    const m = (x.media || '').localeCompare(y.media || '', 'ko');
    if (m !== 0) return m;
    return String(x.date).localeCompare(String(y.date));
  });
  for (const r of rows) {
    const row = ws.addRow({ media: r.media, page: r.page, title: r.title, date: r.date, url: r.url });
    if (r.url) {
      row.getCell('url').value = { text: r.url, hyperlink: r.url };
      row.getCell('url').font = { color: { argb: 'FF2563EB' }, underline: true, name: 'Malgun Gothic' };
    }
  }
  if (!rows.length) ws.addRow({ media: '—', page: '', title: '편철 대상 기사 없음', date: '', url: '' });
  autoFitColumns(ws);
}

// ── 기사 편집용 시트 (출력 여부/순서/언론사/지면 등) ──
function addArticleEditSheet(wb, report) {
  const ws = wb.addWorksheet('기사편집용');
  ws.columns = [
    { header: '출력여부', key: 'inc',  width: 10 },
    { header: '순서',     key: 'order', width: 8 },
    { header: '언론사',   key: 'media', width: 16 },
    { header: '지면',     key: 'page',  width: 10 },
    { header: '제목',     key: 'title', width: 70 },
    { header: '분류',     key: 'cat',   width: 12 },
    { header: '감정',     key: 'sent',  width: 10 },
    { header: '관련부서', key: 'dept',  width: 24 },
    { header: '링크',     key: 'url',   width: 50 },
  ];
  applyHeaderStyle(ws.getRow(1));
  const overrides = report.articleOverrides || {};
  (report.articles || []).forEach((a, i) => {
    const o = overrides[a.id] || {};
    const row = ws.addRow({
      inc:   o.includeInClipping !== false ? 'Y' : 'N',
      order: Number.isFinite(o.printOrder) ? o.printOrder : i + 1,
      media: o.source ?? a.source ?? '',
      page:  o.pageLabel ?? a.pageLabel ?? '',
      title: o.title ?? a.title ?? '',
      cat:   o.category ?? a.mediaType ?? '',
      sent:  a.sentiment?.label || '',
      dept:  (a.departments || []).map(d => d.name).join(', '),
      url:   a.url || '',
    });
    if (a.url) {
      row.getCell('url').value = { text: a.url, hyperlink: a.url };
      row.getCell('url').font = { color: { argb: 'FF2563EB' }, underline: true, name: 'Malgun Gothic' };
    }
  });
  autoFitColumns(ws);
}

// ── 메인 ───────────────────────────────────
// excluded=true 기사는 모든 시트에서 자동 제외하고, 별도 "제외기사" 시트에 모아 보존.
export async function reportToXlsx(report, ctx = {}) {
  const tracking = ctx.tracking || { totalLinks: 0, totalClicks: 0, items: [] };
  const wb = new ExcelJS.Workbook();
  wb.creator   = 'Trend Collector';
  wb.created   = new Date();
  wb.title     = report.title || '법무부 언론보도 분석';

  // 활성/제외 기사 분리 — report 객체 자체는 변경하지 않는다
  const allArticles    = report.articles || [];
  const activeArticles = allArticles.filter(a => !a.excluded && a.relevancePassed !== false);
  const excludedArticles = allArticles.filter(a => a.excluded);
  const reportActive = { ...report, articles: activeArticles };

  addSummarySheet(wb, reportActive, tracking);
  addArticleSheet(wb, '2.전체기사', activeArticles);
  addMediaTocSheet(wb, reportActive);
  addArticleSheet(wb, '4.기관배포자료', activeArticles.filter(a => a.articleSource === 'agency'));
  addReCitationSheet(wb, reportActive);
  addClickSheet(wb, tracking);
  addAutoTrackingSheet(wb, tracking);
  addArticleSheet(wb, '7.부정이슈', activeArticles.filter(a => a.sentiment?.label === '부정'));
  addDeptResponseSheet(wb, reportActive);
  addArticleEditSheet(wb, reportActive);
  addExcludedSheet(wb, excludedArticles);
  addYouTubeInsightSheet(wb, reportActive);
  addYouTubeVideosSheet(wb, reportActive);
  addAgentAnalysisSheet(wb, reportActive);
  addAgentArticleScoresSheet(wb, reportActive);

  return wb.xlsx.writeBuffer().then(b => Buffer.from(b));
}

// ── 에이전트 분석 시트 ─────────────────────
function addAgentAnalysisSheet(wb, report) {
  const ws = wb.addWorksheet('에이전트분석');
  ws.columns = [
    { header: '에이전트', key: 'agent',   width: 16 },
    { header: '항목',     key: 'item',    width: 24 },
    { header: '값',       key: 'value',   width: 24 },
    { header: '비고',     key: 'note',    width: 80 },
  ];
  applyHeaderStyle(ws.getRow(1));
  const ar = report.agentResults;
  if (!ar) {
    ws.addRow({ agent: '—', item: '에이전트 결과 없음', value: '', note: '구버전 리포트이거나 에이전트가 비활성 상태입니다.' });
    autoFitColumns(ws);
    return;
  }
  const meta = ar.runMeta || {};
  ws.addRow({ agent: 'meta', item: 'LLM 활성',     value: meta.llmEnabled ? `예 (${meta.llmProvider || ''})` : '아니요', note: 'LLM_AGENT_ENABLED + API 키 모두 있을 때 활성' });
  ws.addRow({ agent: 'meta', item: '생성 시각',     value: meta.generatedAt || '', note: `${meta.durationMs || '?'}ms 소요` });

  // collection
  if (ar.collection && !ar.collection.skipped) {
    ws.addRow({ agent: 'collection', item: '총 수집 건수', value: ar.collection.rawCount || 0, note: ar.collection.collectionSummary || '' });
    for (const [k, v] of Object.entries(ar.collection.sourceCounts || {})) {
      ws.addRow({ agent: 'collection', item: `소스: ${k}`, value: v, note: '' });
    }
    if (ar.collection.unusedKeywords?.length) {
      ws.addRow({ agent: 'collection', item: '검색 누락 의심 키워드', value: ar.collection.unusedKeywords.length, note: ar.collection.unusedKeywords.join(', ') });
    }
  }
  // relevance
  if (ar.relevance && !ar.relevance.skipped) {
    ws.addRow({ agent: 'relevance', item: '관련성 통과율', value: `${ar.relevance.passRate || 0}%`, note: ar.relevance.summary });
    const d = ar.relevance.distribution || {};
    ws.addRow({ agent: 'relevance', item: '분포 (high/medium/low/none)', value: `${d.high || 0}/${d.medium || 0}/${d.low || 0}/${d.none || 0}`, note: '' });
    ws.addRow({ agent: 'relevance', item: '자동 제외 건수', value: ar.relevance.autoExcludedCount || 0, note: '도메인/노이즈 사전 매칭 + 점수 0 자동 처리' });
    ws.addRow({ agent: 'relevance', item: '공공기관 도메인 매칭', value: ar.relevance.publicDomainHits || 0, note: '법무·검찰·공공기관 단어가 본문에 있는 기사 수' });
  }
  // risk
  if (ar.risk && !ar.risk.skipped) {
    const lvlFill = ar.risk.level === '긴급' ? 'FFFEE2E2' : ar.risk.level === '주의' ? 'FFFEF3C7' : 'FFDCFCE7';
    const r1 = ws.addRow({ agent: 'risk', item: '위험 수준', value: ar.risk.level || '안정', note: ar.risk.summary });
    r1.getCell('value').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lvlFill } };
    ws.addRow({ agent: 'risk', item: '판단 근거', value: (ar.risk.reasons || []).length, note: (ar.risk.reasons || []).join(' / ') });
    ws.addRow({ agent: 'risk', item: '대응 필요 기사', value: ar.risk.urgentCount || 0, note: '긴급 + 주의 우선순위 기사 수' });
    ws.addRow({ agent: 'risk', item: '중앙·방송사 부정', value: ar.risk.centralNegativeCount || 0, note: '중앙언론 + 부정 라벨 기사 수' });
  }
  // report
  if (ar.report && !ar.report.skipped) {
    ws.addRow({ agent: 'report', item: '일일 보고', value: '', note: ar.report.dailyBrief || '' });
    if (ar.report.executiveSummary) {
      ws.addRow({ agent: 'report', item: '상급자 요약', value: '', note: ar.report.executiveSummary.replace(/\n/g, ' / ') });
    }
    if (ar.report.responseRecommendation) {
      ws.addRow({ agent: 'report', item: '대응 권고', value: '', note: ar.report.responseRecommendation.replace(/\n/g, ' / ') });
    }
    if (ar.report.monitoringKeywords?.length) {
      ws.addRow({ agent: 'report', item: '모니터링 키워드', value: ar.report.monitoringKeywords.length, note: ar.report.monitoringKeywords.join(', ') });
    }
  }
  // publicity
  if (ar.publicity && !ar.publicity.skipped) {
    ws.addRow({ agent: 'publicity', item: '기관 배포자료',     value: ar.publicity.officialReleaseCount || 0, note: '' });
    ws.addRow({ agent: 'publicity', item: '언론 재인용',       value: ar.publicity.recitationCount || 0, note: '' });
    ws.addRow({ agent: 'publicity', item: '중앙·방송사 노출', value: ar.publicity.centralCoverage || 0, note: '' });
    ws.addRow({ agent: 'publicity', item: '추적 클릭',         value: ar.publicity.clickCount || 0, note: '' });
    ws.addRow({ agent: 'publicity', item: '홍보 효과 등급',    value: ar.publicity.publicityRating || '일반', note: ar.publicity.publicityInsight || '' });
  }
  // quality
  if (ar.quality && !ar.quality.skipped) {
    const gradeFill = ar.quality.grade === '재검토 필요' ? 'FFFEE2E2'
      : ar.quality.grade === '주의' ? 'FFFEF3C7'
      : ar.quality.grade === '양호' ? 'FFDBEAFE' : 'FFDCFCE7';
    const r2 = ws.addRow({ agent: 'quality', item: '품질 점수', value: `${ar.quality.qualityScore || 0} (${ar.quality.grade || '—'})`, note: ar.quality.summary });
    r2.getCell('value').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: gradeFill } };
    ws.addRow({ agent: 'quality', item: '권장 다운로드', value: (ar.quality.recommendedDownloadType || '').toUpperCase(), note: ar.quality.pdfRisk ? `PDF 위험: ${ar.quality.pdfReasons.join(' / ')}` : '' });
    for (const w of (ar.quality.warnings || [])) {
      const r3 = ws.addRow({ agent: 'quality', item: `경고 [${w.level}]`, value: w.code, note: w.message });
      const fill = w.level === 'error' ? 'FFFEE2E2' : w.level === 'warn' ? 'FFFEF3C7' : 'FFEFF6FF';
      r3.getCell('item').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    }
  }
  // suggestion
  if (ar.suggestion && !ar.suggestion.skipped) {
    ws.addRow({ agent: 'suggestion', item: '요약', value: '', note: ar.suggestion.summary || '' });
    for (const w of (ar.suggestion.suggestedExcludeKeywords || [])) {
      ws.addRow({ agent: 'suggestion', item: '제외 키워드 제안', value: w.word, note: w.reason });
    }
    for (const d of (ar.suggestion.suggestedDomainRules || [])) {
      ws.addRow({ agent: 'suggestion', item: '도메인 룰 제안', value: d.domain, note: `${d.ruleType} · ${d.reason}` });
    }
    for (const k of (ar.suggestion.suggestedKeywordCheck || [])) {
      ws.addRow({ agent: 'suggestion', item: '검색 누락 의심', value: k.keyword, note: k.reason });
    }
  }
  autoFitColumns(ws);
}

// 기사별 에이전트 점수 시트 — 관련성/위험/홍보/품질 핵심 지표를 한 행에
function addAgentArticleScoresSheet(wb, report) {
  const ws = wb.addWorksheet('기사별에이전트점수');
  ws.columns = [
    { header: '#',             key: 'idx',     width: 5 },
    { header: '제목',          key: 'title',   width: 60 },
    { header: '매체',          key: 'source',  width: 16 },
    { header: '키워드',        key: 'kw',      width: 14 },
    { header: '관련성 점수',   key: 'rscore',  width: 12 },
    { header: '관련성 등급',   key: 'rlevel',  width: 12 },
    { header: '위험도',        key: 'prio',    width: 10 },
    { header: '감정',          key: 'sent',    width: 10 },
    { header: '홍보 등급',     key: 'rating',  width: 12 },
    { header: '재인용',        key: 'recite',  width: 10 },
    { header: '본문 추출',     key: 'extr',    width: 10 },
    { header: '공공기관 매칭', key: 'pub',     width: 12 },
  ];
  applyHeaderStyle(ws.getRow(1));
  const articles = (report.articles || []);
  articles.forEach((a, i) => {
    const row = ws.addRow({
      idx: i + 1,
      title: a.title || '',
      source: a.source || '',
      kw: a.keyword || '',
      rscore: a.relevanceScore ?? 0,
      rlevel: a.relevanceLevel || '—',
      prio: a.priority || '참고',
      sent: a.sentiment?.label || '',
      rating: a.publicityRating || '—',
      recite: a.reCiteCount || 0,
      extr: a.extracted ? '✓' : '×',
      pub: a.publicDomainHit ? '✓' : '',
    });
    const pf = priorityFill(a.priority);
    if (pf) row.getCell('prio').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pf } };
    row.getCell('sent').font = { color: { argb: sentimentArgb(a.sentiment?.label) }, name: 'Malgun Gothic' };
  });
  if (!articles.length) ws.addRow({ idx: '—', title: '활성 기사 없음', source: '', kw: '', rscore: '', rlevel: '', prio: '', sent: '', rating: '', recite: '', extr: '', pub: '' });
  autoFitColumns(ws);
}

// YouTube 관심도 — 키워드별 요약
function addYouTubeInsightSheet(wb, report) {
  const ws = wb.addWorksheet('YouTube관심도');
  ws.columns = [
    { header: '키워드',     key: 'kw',     width: 18 },
    { header: '관련 영상',  key: 'count',  width: 12 },
    { header: '누적 조회수', key: 'views', width: 16 },
    { header: '댓글',       key: 'comm',   width: 12 },
    { header: '좋아요',     key: 'likes',  width: 12 },
    { header: '관심도 등급', key: 'level',  width: 12 },
    { header: '설명',       key: 'text',   width: 70 },
  ];
  applyHeaderStyle(ws.getRow(1));
  const items = report.youtubeInsights?.items || [];
  for (const it of items) {
    ws.addRow({
      kw:    it.keyword,
      count: it.videoCount || 0,
      views: it.totalViews || 0,
      comm:  it.totalComments || 0,
      likes: it.totalLikes || 0,
      level: it.interestLevel || '미미',
      text:  it.insightText || (it.error ? `⚠️ ${it.error}` : ''),
    });
  }
  if (!items.length) ws.addRow({ kw: '', count: 0, views: 0, comm: 0, likes: 0, level: '', text: 'YouTube 분석이 비활성화되어 있거나 결과가 없습니다.' });
  autoFitColumns(ws);
}

// YouTube 영상 목록 — 키워드별 topVideos 합쳐서
function addYouTubeVideosSheet(wb, report) {
  const ws = wb.addWorksheet('YouTube영상목록');
  ws.columns = [
    { header: '키워드',   key: 'kw',      width: 16 },
    { header: '제목',     key: 'title',   width: 60 },
    { header: '채널',     key: 'channel', width: 24 },
    { header: '업로드',   key: 'pub',     width: 22 },
    { header: '조회수',   key: 'views',   width: 14 },
    { header: '댓글',     key: 'comm',    width: 12 },
    { header: '좋아요',   key: 'likes',   width: 12 },
    { header: 'Shorts',   key: 'sh',      width: 8 },
    { header: 'URL',      key: 'url',     width: 50 },
  ];
  applyHeaderStyle(ws.getRow(1));
  const items = report.youtubeInsights?.items || [];
  let total = 0;
  for (const it of items) {
    for (const v of (it.topVideos || [])) {
      const row = ws.addRow({
        kw:      it.keyword,
        title:   v.title || '',
        channel: v.channelTitle || '',
        pub:     v.publishedAt ? fmtKST(v.publishedAt) : '',
        views:   v.viewCount || 0,
        comm:    v.commentCount || 0,
        likes:   v.likeCount || 0,
        sh:      v.shortform ? 'Y' : '',
        url:     v.url || '',
      });
      if (v.url) {
        row.getCell('url').value = { text: v.url, hyperlink: v.url };
        row.getCell('url').font  = { color: { argb: 'FFDC2626' }, underline: true, name: 'Malgun Gothic' };
      }
      total++;
    }
  }
  if (total === 0) ws.addRow({ kw: '', title: 'YouTube 영상이 없습니다 (API 미설정 또는 결과 없음)', channel: '', pub: '', views: 0, comm: 0, likes: 0, sh: '', url: '' });
  autoFitColumns(ws);
}

// 제외 기사 시트 — 사용자가 제외 처리한 기사들의 사유 / 매체 / URL / 매칭 키워드
function addExcludedSheet(wb, excludedArticles) {
  const ws = wb.addWorksheet('제외기사');
  ws.columns = [
    { header: '제외 사유',     key: 'reason',  width: 16 },
    { header: '제외 시간',     key: 'at',      width: 22 },
    { header: '제목',          key: 'title',   width: 60 },
    { header: '언론사',        key: 'source',  width: 18 },
    { header: '원래 감정',     key: 'sent',    width: 10 },
    { header: '관련성 점수',   key: 'rscore',  width: 12 },
    { header: '매칭 키워드',   key: 'matched', width: 30 },
    { header: 'URL',          key: 'url',     width: 60 },
  ];
  applyHeaderStyle(ws.getRow(1));
  for (const a of excludedArticles) {
    const row = ws.addRow({
      reason:  a.excludedReason || '미분류',
      at:      a.excludedAt ? fmtKST(a.excludedAt) : '',
      title:   a.title || '',
      source:  a.source || '',
      sent:    a.sentiment?.label || '',
      rscore:  a.relevanceScore ?? '',
      matched: (a.matchedKeywords || []).join(', '),
      url:     a.url || '',
    });
    if (a.url) {
      row.getCell('url').value = { text: a.url, hyperlink: a.url };
      row.getCell('url').font  = { color: { argb: 'FF2563EB' }, underline: true, name: 'Malgun Gothic' };
    }
  }
  if (!excludedArticles.length) ws.addRow({ reason: '—', at: '', title: '제외된 기사 없음', source: '', sent: '', rscore: '', matched: '', url: '' });
  autoFitColumns(ws);
}
