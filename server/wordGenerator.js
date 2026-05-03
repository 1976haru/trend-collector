// ─────────────────────────────────────────────
// wordGenerator.js — 기관 제출용 Word(.docx) 보고서
// 표지 → 1.보고개요 → 2.종합분석 → 3.주요이슈 → 4.세부보도현황
//      → 5.기관배포자료 홍보실적 → 6.국민관심도/조회지표
//      → 7.시사점및대응방향 → 8.붙임
// 문체: '~임 / ~함 / ~판단됨 / ~필요함' (공공기관 보고문)
// ─────────────────────────────────────────────

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, convertInchesToTwip,
} from 'docx';
import { APP_NAME, getAppVersion } from './changelog.js';

// Word docx 폰트 — 클라이언트 OS 의 폰트 매칭에 의존.
// 한국어 Windows: 맑은 고딕 / macOS: Apple SD Gothic Neo / Linux: Noto Sans CJK KR.
// docx 라이브러리는 단일 font name 만 지원하므로 가장 보편적인 '맑은 고딕' 사용.
// (사용자가 폰트가 없는 환경에서 열면 OS 기본 한글 폰트로 자동 fallback)
const FONT = 'Malgun Gothic';

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
function fmtDateTitle(iso) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, '0')}월 ${String(d.getDate()).padStart(2, '0')}일`;
  } catch { return ''; }
}

// 공공기관 문체 변환 — 종결어미를 '~임/~함' 으로 통일
function formalize(text) {
  if (!text) return '';
  let s = String(text).trim();
  s = s.replace(/입니다\./g, '임.').replace(/입니다/g, '임');
  s = s.replace(/합니다\./g, '함.').replace(/합니다/g, '함');
  s = s.replace(/됩니다\./g, '됨.').replace(/됩니다/g, '됨');
  s = s.replace(/있습니다\./g, '있음.').replace(/있습니다/g, '있음');
  s = s.replace(/없습니다\./g, '없음.').replace(/없습니다/g, '없음');
  s = s.replace(/이었습니다\./g, '이었음.').replace(/이었습니다/g, '이었음');
  s = s.replace(/였습니다\./g, '였음.').replace(/였습니다/g, '였음');
  s = s.replace(/것이다\./g, '것임.').replace(/것이다/g, '것임');
  s = s.replace(/되었다\./g, '되었음.').replace(/되었다/g, '되었음');
  s = s.replace(/하였다\./g, '하였음.').replace(/하였다/g, '하였음');
  s = s.replace(/필요합\b/g, '필요함');
  s = s.replace(/요구됩\b/g, '요구됨');
  s = s.replace(/주의해야 ?합니다\.?/g, '주의가 요구됨.');
  s = s.replace(/많이 나왔습니다\.?/g, '다수 보도됨.');
  s = s.replace(/좋아요/g, '긍정 반응');
  return s;
}

function P(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing:   { before: opts.before ?? 60, after: opts.after ?? 60, line: 320 },
    indent:    opts.indent ? { left: opts.indent } : undefined,
    children: [
      new TextRun({
        text:  String(text ?? ''),
        font:  FONT,
        size:  opts.size  || 22,
        bold:  !!opts.bold,
        color: opts.color || undefined,
        italics: !!opts.italic,
      }),
    ],
  });
}

function H1(text) {
  return new Paragraph({
    heading:  HeadingLevel.HEADING_1,
    spacing:  { before: 320, after: 140, line: 320 },
    children: [new TextRun({ text: String(text), font: FONT, size: 30, bold: true, color: '0d1117' })],
  });
}
function H2(text) {
  return new Paragraph({
    heading:  HeadingLevel.HEADING_2,
    spacing:  { before: 220, after: 100, line: 320 },
    children: [new TextRun({ text: String(text), font: FONT, size: 26, bold: true, color: '0d1117' })],
  });
}

function bulletItem(text, opts = {}) {
  return new Paragraph({
    bullet:   { level: opts.level ?? 0 },
    spacing:  { before: 30, after: 30, line: 300 },
    children: [new TextRun({ text: String(text), font: FONT, size: 22 })],
  });
}

function dashItem(text) {
  return new Paragraph({
    spacing:  { before: 30, after: 30, line: 300 },
    indent:   { left: 200 },
    children: [new TextRun({ text: `○ ${text}`, font: FONT, size: 22 })],
  });
}

function cell(text, opts = {}) {
  return new TableCell({
    width:   opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.header ? { type: ShadingType.SOLID, color: 'F0EDE8', fill: 'F0EDE8' } : undefined,
    children: [
      new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        children:  [new TextRun({ text: String(text ?? ''), font: FONT, size: opts.size || 20, bold: !!opts.bold, color: opts.color || undefined })],
      }),
    ],
  });
}

function makeTable(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => cell(h, { header: true, bold: true, width: widths?.[i], align: AlignmentType.CENTER })),
  });
  const bodyRows = rows.map(r => new TableRow({
    children: r.map((c, i) => cell(c, { width: widths?.[i] })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 8,  color: '0D1117' },
      bottom: { style: BorderStyle.SINGLE, size: 8,  color: '0D1117' },
      left:   { style: BorderStyle.SINGLE, size: 4,  color: 'CCCCCC' },
      right:  { style: BorderStyle.SINGLE, size: 4,  color: 'CCCCCC' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' },
      insideVertical:   { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' },
    },
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// 감정/우선순위/평가 라벨 → 한국어 표기 (기관 보고용)
function sentLabel(l)     { return l || '중립'; }
function priorityLabel(p) { return p || '참고'; }
function ratingLabel(r)   { return r || '일반'; }

// ── 종합 분석 — 본문 문장 (공공기관 문체) ─────
function buildOverviewSentences(report) {
  const total = (report.articles || []).length;
  const sent  = report.sentiment   || {};
  const ag    = report.agencyStats || { agency: 0, press: total, byAgency: {} };
  const pub   = report.publicityStats || {};
  const trend = report.trending || [];
  const lines = [];

  lines.push(`금일 ${(report.keywords || []).join('·')} 관련 언론보도는 총 ${total}건으로 확인되었음.`);
  if (sent.total) {
    lines.push(`감정 분포는 긍정 ${sent.positive}건(${sent.positivePct}%), 부정 ${sent.negative}건(${sent.negativePct}%), 중립 ${sent.neutral}건(${sent.neutralPct}%)으로 집계되었으며, 전반적 분위기는 ${sent.overall || '중립'} 으로 판단됨.`);
  }
  lines.push(`발행 주체별로는 기관 배포자료 ${ag.agency}건, 일반 언론보도 ${ag.press}건으로 구성됨.`);
  if (pub.totalReCites > 0) {
    lines.push(`기관 배포자료의 언론 재인용 건수는 총 ${pub.totalReCites}건이며, 이 중 중앙언론·방송사 인용 건수는 ${pub.centralCoverage}건임.`);
  }
  if (trend.length > 0) {
    const list = trend.slice(0, 3).map(t => `${t.keyword}(${t.prev}→${t.curr})`).join(', ');
    lines.push(`전일 대비 보도량이 급증한 키워드로는 ${list} 등이 식별됨.`);
  } else {
    lines.push('전일 대비 보도량이 급증한 키워드는 관측되지 않았음.');
  }
  if ((sent.negativePct || 0) >= 50) {
    lines.push(`다만 부정 보도 비율이 ${sent.negativePct}% 로 위험 수위를 상회하므로, 비판 논점에 대한 대응 메시지 정리가 필요함.`);
  }
  return lines;
}

// ── 7. 시사점 및 대응 방향 ─────────────────────
function buildImplications(report) {
  const sent     = report.sentiment   || {};
  const action   = report.actionRequired || [];
  const trending = report.trending || [];
  const out = { positive: [], negative: [], depts: [], watch: [] };

  // 긍정 활용
  if ((report.positiveIssues || []).length > 0) {
    const top = (report.positiveIssues[0]?.title || '').slice(0, 60);
    out.positive.push(`긍정 보도(${(report.positiveIssues || []).length}건)는 정책 홍보 자료로 적극 활용 가능함.`);
    if (top) out.positive.push(`특히 「${top}」 보도의 SNS·홈페이지 재공유를 통해 대국민 인지도 제고가 기대됨.`);
  } else {
    out.positive.push('금일 별도의 긍정 활용 가능 이슈는 식별되지 않았음.');
  }

  // 부정 대응
  const urgent = action.filter(a => a.priority === '긴급');
  const watch  = action.filter(a => a.priority === '주의');
  if (urgent.length > 0) {
    out.negative.push(`긴급 대응 이슈 ${urgent.length}건에 대해 사실관계 확인 후 보도해명 또는 입장 정리가 즉시 요구됨.`);
    urgent.slice(0, 3).forEach(a => {
      out.negative.push(`「${(a.title || '').slice(0, 70)}」 — [${a.source || '미상'}] (${a.sentiment?.label || ''})`);
    });
  }
  if (watch.length > 0) {
    out.negative.push(`주의 단계 이슈 ${watch.length}건은 추이를 관찰하며 추가 확산 시 대응 자료 준비가 필요함.`);
  }
  if (urgent.length === 0 && watch.length === 0) {
    out.negative.push('금일 즉각 대응이 필요한 부정 이슈는 식별되지 않았음.');
  }

  // 관계 부서
  const dept = Object.entries(report.departmentCounts || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (dept.length) {
    out.depts.push(`주요 관계 부서별 보도량은 ${dept.map(([k, v]) => `${k} ${v}건`).join(', ')} 임.`);
    out.depts.push('각 관계 부서는 해당 보도 내용을 검토하여 필요 시 추가 자료 준비가 요구됨.');
  } else {
    out.depts.push('관계 부서 분류 결과가 없으므로 향후 부서 매칭 사전 보강이 필요함.');
  }

  // 향후 모니터링 키워드
  const negKws = [...new Set((action || []).flatMap(a => a.sentiment?.matchedKeywords?.negative || []))].slice(0, 8);
  if (trending.length > 0) {
    out.watch.push(`급상승 키워드 ${trending.slice(0, 5).map(t => t.keyword).join(', ')} 에 대한 모니터링 강화가 요구됨.`);
  }
  if (negKws.length > 0) {
    out.watch.push(`반복 등장한 부정 키워드(${negKws.join(', ')})는 향후 알림 등록을 검토할 필요가 있음.`);
  }
  if (!out.watch.length) {
    out.watch.push('금일 추가 모니터링이 요구되는 신규 키워드는 식별되지 않았음.');
  }
  return out;
}

// ── 메인 — 보고서 → docx Buffer ────────────────
// excluded=true 기사는 모든 출력에서 자동 제외 — 진입점에서 한 번에 필터링한 r 사본 사용
export async function reportToDocx(report, ctx = {}) {
  const _r          = report || {};
  const r           = { ..._r, articles: (_r.articles || []).filter(a => !a.excluded && a.relevancePassed !== false) };
  const meta        = ctx.reportMeta || r.reportMeta || {};
  const trackingTotals = ctx.trackingTotals || { totalLinks: 0, totalClicks: 0, items: [] };
  const total       = (r.articles || []).length;
  const sentiment   = r.sentiment    || {};
  const briefing    = r.briefingText || {};
  const trending    = r.trending     || [];
  const mediaCounts = r.mediaCounts  || {};
  const ag          = r.agencyStats  || { agency: 0, press: total, byAgency: {} };
  const pub         = r.publicityStats || { agencyDistributed: 0, totalReCites: 0, centralCoverage: 0, topAgencyItems: [] };
  const today       = fmtDateTitle(r.generatedAt);
  const titleStr    = `${today} ${meta.organization || '법무부'} 언론보도 모니터링 결과보고`;
  const overview    = buildOverviewSentences(r);
  const implications = buildImplications(r);

  const children = [];

  // ────────────────────────────────────────────
  // [표지]
  // ────────────────────────────────────────────
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing:   { before: 1200, after: 200 },
    children:  [new TextRun({ text: meta.classification || '내부 검토용', font: FONT, size: 22, bold: true, color: '991B1B' })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing:   { before: 200, after: 120 },
    children:  [new TextRun({ text: meta.organization || '법무부', font: FONT, size: 28, color: '555555' })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing:   { before: 120, after: 600 },
    children:  [new TextRun({ text: titleStr, font: FONT, size: 44, bold: true, color: '0d1117' })],
  }));
  children.push(makeTable(
    ['구분', '내용'],
    [
      ['작성일',     fmtDate(r.generatedAt)],
      ['수집 기간',  `${fmtDate(r.period?.from)} ~ ${fmtDate(r.period?.to)} (${r.period?.label || '-'})`],
      ['담당 부서',  meta.department || '대변인실'],
      ['작성자',     meta.author     || '(자동 생성)'],
      ['보안 등급',  meta.classification || '내부 검토용'],
      ['보고서 ID',  r.id || ''],
      ['프로그램',   `${APP_NAME} v${getAppVersion()}`],
    ],
    [25, 75],
  ));
  children.push(P(' ', { size: 18 }));
  children.push(P('※ 본 자료는 자동 수집·분석된 내부 검토용 자료이며, 외부 공개 시 사전 확인이 필요함.', {
    align: AlignmentType.CENTER, size: 20, color: '777777',
  }));
  children.push(pageBreak());

  // ────────────────────────────────────────────
  // 1. 보고 개요
  // ────────────────────────────────────────────
  children.push(H1('1. 보고 개요'));
  children.push(makeTable(
    ['항목', '내용'],
    [
      ['수집 목적',   formalize(meta.purpose || '주요 정책 및 업무 관련 언론 보도 동향을 파악하여 신속한 대응자료로 활용함.')],
      ['수집 기간',   `${fmtDate(r.period?.from)} ~ ${fmtDate(r.period?.to)}`],
      ['수집 키워드', (r.keywords || []).join(', ') || '—'],
      ['수집 매체',   '구글 뉴스(전 세계 검색), 네이버 뉴스(국내 검색)' + (r.sourceCounts ? ` · 매체 다양성 ${Object.keys(r.sourceCounts).length}종` : '')],
      ['총 수집 건수', `${total}건 (본문 추출 ${r.extractedCount || 0}건)`],
    ],
    [25, 75],
  ));

  // ────────────────────────────────────────────
  // 2. 종합 분석
  // ────────────────────────────────────────────
  children.push(H1('2. 종합 분석'));
  overview.forEach(line => children.push(dashItem(line)));

  children.push(H2('가. 발행 주체별 분포'));
  children.push(makeTable(
    ['구분', '건수', '비율'],
    [
      ['기관 배포자료', `${ag.agency}건`,  `${total ? Math.round(ag.agency / total * 100) : 0}%`],
      ['일반 언론보도', `${ag.press}건`,   `${total ? Math.round(ag.press / total * 100) : 0}%`],
      ['합계',         `${total}건`, '100%'],
    ],
    [40, 30, 30],
  ));

  children.push(H2('나. 매체 유형별 분포'));
  const mediaRows = Object.entries(mediaCounts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (mediaRows.length) {
    children.push(makeTable(
      ['매체 유형', '건수', '비율'],
      mediaRows.map(([k, v]) => [k, `${v}건`, `${total ? Math.round(v / total * 100) : 0}%`]),
      [40, 30, 30],
    ));
  } else {
    children.push(P('— 분류된 매체 정보 없음.', { size: 20 }));
  }

  // ────────────────────────────────────────────
  // 3. 주요 이슈
  // ────────────────────────────────────────────
  children.push(H1('3. 주요 이슈'));
  // 이슈 유형 집계
  const issueCounts = {};
  for (const a of (r.articles || [])) {
    const t = a.sentiment?.issueType;
    if (t && t !== '기타') issueCounts[t] = (issueCounts[t] || 0) + 1;
  }
  const issueRows = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([type, cnt], i) => {
    // 이슈에 해당하는 매체 / 감정 / 대응
    const arts = (r.articles || []).filter(a => a.sentiment?.issueType === type);
    const topMedia = topNamesFrom(arts.map(a => a.source).filter(Boolean), 3).join(', ');
    const sents = arts.reduce((m, a) => { const l = a.sentiment?.label || '중립'; m[l] = (m[l] || 0) + 1; return m; }, {});
    const sentStr = ['긍정', '부정', '중립'].filter(k => sents[k]).map(k => `${k}${sents[k]}`).join('/');
    const urgent = arts.filter(a => a.priority === '긴급').length;
    const watch  = arts.filter(a => a.priority === '주의').length;
    const need   = urgent ? `긴급(${urgent})` : watch ? `주의(${watch})` : '참고';
    return [String(i + 1), type, `${cnt}건`, topMedia || '—', sentStr || '—', need];
  });
  if (issueRows.length) {
    children.push(makeTable(
      ['순번', '이슈', '관련 기사 수', '주요 매체', '감정', '대응 필요도'],
      issueRows,
      [6, 22, 14, 28, 16, 14],
    ));
  } else {
    children.push(P('— 이슈 분야로 분류된 기사가 없음.', { size: 20 }));
  }

  // ────────────────────────────────────────────
  // 4. 세부 보도 현황
  // ────────────────────────────────────────────
  children.push(pageBreak());
  children.push(H1('4. 세부 보도 현황'));
  if (total > 0) {
    const detailRows = (r.articles || []).map((a, i) => [
      String(i + 1),
      a.date || '',
      truncate(a.title, 80),
      a.source || '',
      a.mediaType || '',
      sentLabel(a.sentiment?.label),
      truncate((a.departments || []).map(d => d.name).join(', '), 30) || '—',
      truncate(a.url || '', 60),
    ]);
    children.push(makeTable(
      ['#', '날짜', '제목', '매체', '유형', '감정', '관련 부서', '링크'],
      detailRows,
      [4, 12, 30, 12, 10, 8, 12, 12],
    ));
  } else {
    children.push(P('— 수집된 기사가 없음.', { size: 20 }));
  }

  // ────────────────────────────────────────────
  // 5. 기관 배포자료 홍보 실적
  // ────────────────────────────────────────────
  children.push(pageBreak());
  children.push(H1('5. 기관 배포자료 홍보 실적'));
  children.push(P(`기관에서 배포한 보도자료는 총 ${pub.agencyDistributed}건이며, 언론 재인용은 ${pub.totalReCites}건, 중앙언론·방송사 보도 포함 건수는 ${pub.centralCoverage}건으로 집계됨.`));
  if (pub.topAgencyItems?.length) {
    const rows = pub.topAgencyItems.map(it => {
      const posCount = (it.sentiment === '긍정') ? 1 : 0;
      const negCount = (it.sentiment === '부정') ? 1 : 0;
      return [
        it.agency || it.source || '—',
        '1건',
        `${it.reCiteCount}건`,
        `${posCount}건`,
        `${negCount}건`,
        truncate(it.title, 60),
      ];
    });
    children.push(makeTable(
      ['기관/부서', '배포자료 수', '언론 재인용', '긍정 보도', '부정 보도', '주요 제목'],
      rows,
      [16, 10, 12, 10, 10, 42],
    ));
  } else {
    children.push(P('— 기관 배포자료가 식별되지 않음. 추가 매체 등록 또는 키워드 보강 필요함.', { size: 20 }));
  }

  // 기관별 합계
  const byAgency = Object.entries(ag.byAgency || {}).sort((a, b) => b[1] - a[1]);
  if (byAgency.length) {
    children.push(H2('기관별 배포 건수 합계'));
    children.push(makeTable(
      ['기관', '배포 건수'],
      byAgency.map(([k, v]) => [k, `${v}건`]),
      [70, 30],
    ));
  }

  // 자동 추적 결과 — trackingMode='auto' 만 별도 집계
  const tItems = trackingTotals.items || [];
  const autoItems = tItems.filter(t => t.trackingMode === 'auto');
  if (autoItems.length) {
    children.push(H2('자동 추적 결과 (기관 배포자료)'));
    const autoClicks = autoItems.reduce((s, l) => s + (l.clickCount || 0), 0);
    children.push(P(`자동 등록된 기관 배포자료 ${autoItems.length}건의 누적 클릭 수는 ${autoClicks}회로 집계됨. 이는 사용자가 별도 등록하지 않아도 시스템이 도메인·매체명·제목 기반으로 식별한 결과임.`, { size: 22 }));
    // 카테고리별 집계
    const byCat = {};
    for (const t of autoItems) {
      const k = t.agencyCategory || '미분류';
      if (!byCat[k]) byCat[k] = { count: 0, clicks: 0 };
      byCat[k].count  += 1;
      byCat[k].clicks += (t.clickCount || 0);
    }
    children.push(makeTable(
      ['기관 분류', '자동 등록 건수', '누적 클릭'],
      Object.entries(byCat).sort((a, b) => b[1].clicks - a[1].clicks).map(([k, v]) => [k, `${v.count}건`, `${v.clicks}회`]),
      [40, 30, 30],
    ));
  }

  // ────────────────────────────────────────────
  // 6. 국민 관심도 / 조회 지표
  // ────────────────────────────────────────────
  children.push(H1('6. 국민 관심도 · 조회 지표'));
  children.push(P('외부 언론사 기사의 직접 조회수는 공개 API 미제공으로 확보가 어려운 환경이므로, 다음 대체 지표를 활용하여 관심도를 산출함.', { size: 22 }));
  children.push(dashItem(`기관 배포자료 평균 중요도 점수: ${pub.averageImportance}`));
  children.push(dashItem(`전체 매체 다양성: ${Object.keys(r.sourceCounts || {}).length}종 (Google / Naver 등)`));
  children.push(dashItem(`중앙언론·방송사 인용 건수: ${pub.centralCoverage}건`));
  children.push(dashItem(`동일 이슈 묶음 수: ${(r.groups || []).length}건 (재인용 확산 척도)`));

  // 추적 링크 클릭 (외부 자료 기준)
  children.push(H2('가. 추적 링크 클릭 현황'));
  if (trackingTotals.totalLinks > 0) {
    children.push(P(`등록된 추적 링크 ${trackingTotals.totalLinks}건의 누적 클릭 수는 ${trackingTotals.totalClicks}회임.`));
    const top = (trackingTotals.items || [])
      .slice()
      .sort((a, b) => (b.clickCount || 0) - (a.clickCount || 0))
      .slice(0, 8);
    if (top.length) {
      children.push(makeTable(
        ['배포자료', '기관/부서', '클릭 수', '최근 클릭'],
        top.map(t => [
          truncate(t.title, 60),
          t.agency || t.department || '—',
          `${t.clickCount || 0}회`,
          t.lastClickedAt ? fmtKST(t.lastClickedAt) : '—',
        ]),
        [50, 20, 12, 18],
      ));
    }
  } else {
    children.push(P('— 등록된 추적 링크가 없음. 향후 보도자료 배포 시 추적 링크를 사용하여 클릭 지표를 확보할 필요가 있음.', { size: 20 }));
  }

  // ────────────────────────────────────────────
  // 6.5 YouTube 관심도 및 국민 반응 분석 (활성 시)
  // ────────────────────────────────────────────
  const yt = r.youtubeInsights;
  const ytItems = (yt?.items || []).filter(x => (x.videoCount || 0) > 0 || x.error);
  if (ytItems.length) {
    children.push(H2('마. YouTube 관심도 · 국민 반응 분석'));
    children.push(P('YouTube Data API 의 영상 검색 결과 (조회수 / 댓글 / 좋아요) 와 Google Trends YouTube Search 의 상대 관심도 (0~100) 를 결합한 국민 반응 분석임. 검색량은 정확한 횟수가 아닌 상대 지표임을 유의하여 해석함.', { size: 22 }));
    const totalVideos   = ytItems.reduce((s, x) => s + (x.videoCount    || 0), 0);
    const totalViews    = ytItems.reduce((s, x) => s + (x.totalViews    || 0), 0);
    const totalComments = ytItems.reduce((s, x) => s + (x.totalComments || 0), 0);
    children.push(P(`최근 30일 기준, 분석된 ${ytItems.length}개 키워드의 YouTube 관련 영상은 총 ${totalVideos}건, 누적 조회수 ${totalViews.toLocaleString('ko-KR')}회, 댓글 ${totalComments.toLocaleString('ko-KR')}건으로 집계됨.`));
    children.push(makeTable(
      ['키워드', '관련 영상', '누적 조회수', '댓글', '관심도 등급'],
      ytItems.map(it => [
        it.keyword,
        `${it.videoCount || 0}건`,
        `${(it.totalViews || 0).toLocaleString('ko-KR')}회`,
        `${(it.totalComments || 0).toLocaleString('ko-KR')}건`,
        it.interestLevel || '미미',
      ]),
      [22, 13, 25, 15, 25],
    ));
    // 상위 영상 TOP 5
    const allVideos = ytItems.flatMap(x => (x.topVideos || []).map(v => ({ ...v, _kw: x.keyword })))
      .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
      .slice(0, 5);
    if (allVideos.length) {
      children.push(H2('마-1. 주요 관련 영상 TOP 5'));
      children.push(makeTable(
        ['키워드', '제목', '채널', '조회수'],
        allVideos.map(v => [
          v._kw,
          truncate(v.title, 60),
          v.channelTitle || '—',
          `${(v.viewCount || 0).toLocaleString('ko-KR')}회`,
        ]),
        [16, 50, 18, 16],
      ));
    }
  }

  // ────────────────────────────────────────────
  // 7. 시사점 및 대응 방향
  // ────────────────────────────────────────────
  children.push(pageBreak());
  children.push(H1('7. 시사점 및 대응 방향'));
  children.push(H2('가. 긍정 이슈 활용 방안'));
  implications.positive.forEach(line => children.push(dashItem(line)));
  children.push(H2('나. 부정 이슈 대응 필요사항'));
  implications.negative.forEach(line => children.push(dashItem(line)));
  children.push(H2('다. 관계 부서 참고사항'));
  implications.depts.forEach(line => children.push(dashItem(line)));
  children.push(H2('라. 향후 모니터링 필요 키워드'));
  implications.watch.forEach(line => children.push(dashItem(line)));

  // ────────────────────────────────────────────
  // 8. 붙임
  // ────────────────────────────────────────────
  children.push(pageBreak());
  children.push(H1('8. 붙임'));

  children.push(H2('붙임 1. 전체 기사 목록'));
  if (total > 0) {
    children.push(makeTable(
      ['#', '제목', '매체', '감정'],
      (r.articles || []).map((a, i) => [
        String(i + 1),
        truncate(a.title, 90),
        a.source || '—',
        sentLabel(a.sentiment?.label),
      ]),
      [6, 64, 20, 10],
    ));
  } else {
    children.push(P('— 해당 사항 없음.', { size: 20 }));
  }

  children.push(H2('붙임 2. 부정 이슈 목록'));
  const negs = (r.negativeIssues || []);
  if (negs.length) {
    children.push(makeTable(
      ['#', '제목', '매체', '대응 필요도'],
      negs.map((a, i) => [
        String(i + 1),
        truncate(a.title, 90),
        a.source || '—',
        priorityLabel(a.priority),
      ]),
      [6, 64, 20, 10],
    ));
  } else {
    children.push(P('— 부정으로 분류된 이슈 없음.', { size: 20 }));
  }

  children.push(H2('붙임 3. 기관 배포자료 목록'));
  const agencyArts = (r.articles || []).filter(a => a.articleSource === 'agency');
  if (agencyArts.length) {
    children.push(makeTable(
      ['#', '제목', '기관', '재인용', '평가'],
      agencyArts.map((a, i) => [
        String(i + 1),
        truncate(a.title, 80),
        a.source || '—',
        `${a.reCiteCount || 0}건`,
        ratingLabel(a.publicityRating),
      ]),
      [6, 54, 16, 12, 12],
    ));
  } else {
    children.push(P('— 식별된 기관 배포자료 없음.', { size: 20 }));
  }

  // ────────────────────────────────────────────
  // 9. 에이전트 종합 판단 (agentResults 가 있을 때만)
  // ────────────────────────────────────────────
  if (r.agentResults) {
    children.push(pageBreak());
    children.push(H1('9. 에이전트 종합 판단'));
    appendAgentSections(children, r.agentResults);
  }

  // 푸터 마무리
  children.push(P(' ', { size: 18 }));
  children.push(P('— 본 보고서는 Trend Collector 가 자동 생성한 내부 업무용 자료이며, 외부 배포 시 검토가 필요함. —', {
    align: AlignmentType.CENTER, size: 18, color: '888888',
  }));

  const doc = new Document({
    creator: 'Trend Collector',
    title:   titleStr,
    description: '기관 제출용 언론보도 모니터링 결과보고',
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{
      properties: {
        page: {
          margin: {
            top:    convertInchesToTwip(0.8),
            right:  convertInchesToTwip(0.7),
            bottom: convertInchesToTwip(0.8),
            left:   convertInchesToTwip(0.7),
          },
        },
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}

// ── 에이전트 결과 — Word 섹션 ────────────────
function appendAgentSections(children, ar) {
  if (!ar) return;
  const meta = ar.runMeta || {};
  children.push(P(`(${meta.llmEnabled ? `LLM ${meta.llmProvider || ''} 보강 모드` : 'LLM 비활성 — 규칙 기반'} · 생성 시각 ${meta.generatedAt || '—'} · 소요 ${meta.durationMs || '?'}ms)`, { size: 20, color: '666666' }));

  // 가. 에이전트 종합 판단 (수집 + 관련성 + 위험 + 보고서 요약)
  children.push(H2('가. 종합 판단'));
  if (ar.collection?.collectionSummary) children.push(dashItem(`수집: ${ar.collection.collectionSummary}`));
  if (ar.relevance?.summary)            children.push(dashItem(`관련성: ${ar.relevance.summary}`));
  if (ar.report?.dailyBrief)            children.push(dashItem(`일일 보고: ${ar.report.dailyBrief}`));
  if (ar.report?.executiveSummary) {
    children.push(P(' ', { size: 18 }));
    children.push(P('상급자 보고 요약', { bold: true, size: 22 }));
    for (const line of String(ar.report.executiveSummary).split('\n')) {
      if (line.trim()) children.push(P(line, { size: 21 }));
    }
  }

  // 나. 주요 위험 이슈
  children.push(H2('나. 주요 위험 이슈'));
  if (ar.risk && !ar.risk.skipped) {
    children.push(dashItem(`위험 수준: ${ar.risk.level}`));
    if (ar.risk.reasons?.length) children.push(dashItem(`판단 근거: ${ar.risk.reasons.join(' / ')}`));
    if (ar.risk.urgentArticles?.length) {
      children.push(makeTable(
        ['우선순위', '제목', '매체', '부정 키워드'],
        ar.risk.urgentArticles.slice(0, 8).map(a => [
          a.priority || '참고',
          truncate(a.title, 70),
          a.source || '—',
          (a.negKeywords || []).slice(0, 4).join(', ') || '—',
        ]),
        [12, 50, 18, 20],
      ));
    } else {
      children.push(P('— 대응 필요 기사 없음.', { size: 20 }));
    }
  } else {
    children.push(P('— 위험 감지 에이전트 비활성화됨.', { size: 20 }));
  }

  // 다. 대응 권고
  children.push(H2('다. 대응 권고'));
  if (ar.report && !ar.report.skipped && ar.report.responseRecommendation) {
    for (const line of String(ar.report.responseRecommendation).split('\n')) {
      if (line.trim()) children.push(dashItem(line));
    }
  } else {
    children.push(P('— 보고서 작성 에이전트 비활성화 또는 권고 없음.', { size: 20 }));
  }
  if (ar.report?.monitoringKeywords?.length) {
    children.push(P(`모니터링 키워드: ${ar.report.monitoringKeywords.join(', ')}`, { size: 21 }));
  }

  // 라. 홍보성과 평가
  children.push(H2('라. 홍보성과 평가'));
  if (ar.publicity && !ar.publicity.skipped) {
    const p = ar.publicity;
    children.push(makeTable(
      ['지표', '값'],
      [
        ['기관 배포자료',     `${p.officialReleaseCount || 0}건`],
        ['언론 재인용',       `${p.recitationCount || 0}건`],
        ['중앙·방송사 노출', `${p.centralCoverage || 0}건`],
        ['추적 클릭',         `${p.clickCount || 0}회`],
        ['홍보 효과 등급',    p.publicityRating || '일반'],
      ],
      [40, 60],
    ));
    if (p.publicityInsight) children.push(P(p.publicityInsight, { size: 21 }));
  } else {
    children.push(P('— 홍보성과 에이전트 비활성화됨.', { size: 20 }));
  }

  // 마. 품질 점검 결과
  children.push(H2('마. 품질 점검 결과'));
  if (ar.quality && !ar.quality.skipped) {
    const q = ar.quality;
    children.push(P(`품질 점수: ${q.qualityScore || 0}점 (${q.grade || '—'}) · 권장 다운로드: ${(q.recommendedDownloadType || '').toUpperCase()}`, { size: 22, bold: true }));
    if (q.warnings?.length) {
      for (const w of q.warnings) {
        children.push(dashItem(`[${w.level.toUpperCase()}] ${w.message}`));
      }
    } else {
      children.push(P('— 특이 경고 없음.', { size: 20 }));
    }
  } else {
    children.push(P('— 품질 점검 에이전트 비활성화됨.', { size: 20 }));
  }

  // 바. 개선 제안 (suggestion)
  if (ar.suggestion && !ar.suggestion.skipped) {
    children.push(H2('바. 개선 제안'));
    if (ar.suggestion.summary) children.push(P(ar.suggestion.summary, { size: 21 }));
    if (ar.suggestion.suggestedExcludeKeywords?.length) {
      children.push(dashItem(`제외 키워드 추천: ${ar.suggestion.suggestedExcludeKeywords.map(w => `${w.word}(×${w.count})`).join(', ')}`));
    }
    if (ar.suggestion.suggestedDomainRules?.length) {
      children.push(dashItem(`도메인 룰 제안: ${ar.suggestion.suggestedDomainRules.length}건 — 첫 도메인 ${ar.suggestion.suggestedDomainRules[0].domain}`));
    }
    if (ar.suggestion.suggestedKeywordCheck?.length) {
      children.push(dashItem(`검색 누락 의심: ${ar.suggestion.suggestedKeywordCheck.map(k => k.keyword).join(', ')}`));
    }
  }
}

// ── 헬퍼 ────────────────────────────────────
function topNamesFrom(arr, n) {
  const m = {};
  for (const v of arr) m[v] = (m[v] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}
function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ──────────────────────────────────────────────
// 편철형 Word — 표지 → 언론사별 목차 → 언론사별 본문 → (선택) 분석 부록
// ──────────────────────────────────────────────
import { defaultPrintSettings } from './clippingPresets.js';
import { applyOverride } from './clippingTemplate.js';

function paraCenter(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: opts.before ?? 100, after: opts.after ?? 100 },
    border: opts.box ? {
      top:    { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      left:   { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      right:  { style: BorderStyle.SINGLE, size: 12, color: '000000' },
    } : undefined,
    children: [new TextRun({
      text:  String(text ?? ''),
      font:  opts.font || FONT,
      size:  opts.size || 24,
      bold:  !!opts.bold,
      characterSpacing: opts.spacing,
    })],
  });
}

function articleHeading(media, pageLabel, dateText) {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' } },
    children: [
      new TextRun({ text: `${media}  `, font: FONT, size: 22, bold: true }),
      pageLabel ? new TextRun({ text: `[${pageLabel}]  `, font: FONT, size: 18 }) : new TextRun({ text: '', font: FONT }),
      dateText ? new TextRun({ text: dateText, font: FONT, size: 18, color: '555555' }) : new TextRun({ text: '', font: FONT }),
    ],
  });
}

function articleTitle(text) {
  return new Paragraph({
    spacing: { before: 120, after: 60 },
    children: [new TextRun({ text: String(text || '제목 없음'), font: 'Batang', size: 32, bold: true })],
  });
}

function articleBodyParagraph(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60, line: 320 },
    indent:  { firstLine: 240 },
    alignment: AlignmentType.BOTH,
    children: [new TextRun({ text: String(text), font: 'Batang', size: 22 })],
  });
}

function tocLine(media, pageLabel, title, page) {
  // 언론사명 │ 지면 │ 제목 ......... 페이지
  return new Paragraph({
    spacing: { before: 30, after: 30 },
    children: [
      new TextRun({ text: media.padEnd(8, ' '), font: FONT, size: 20, bold: true }),
      new TextRun({ text: `  ${pageLabel || '-'}   `, font: FONT, size: 18, color: '555555' }),
      new TextRun({ text: String(title), font: FONT, size: 20 }),
      new TextRun({ text: ' ' + '·'.repeat(20) + ' ', font: FONT, size: 18, color: '888888' }),
      new TextRun({ text: String(page), font: FONT, size: 20, bold: true }),
    ],
  });
}

export async function clippingToDocx(report, ctx = {}) {
  const settings = { ...defaultPrintSettings(report), ...(report.printSettings || {}), ...(ctx.settings || {}) };
  const overrides = report.articleOverrides || {};
  // excluded=true 기사는 편철 출력에서 자동 제외
  const sourceArts = (report.articles || []).filter(a => !a.excluded && a.relevancePassed !== false);
  const list = sourceArts.map(a => applyOverride(a, overrides)).filter(a => a._include);

  // 언론사별 그룹
  const byMedia = new Map();
  for (const a of list) {
    const k = a.source || '미상';
    if (!byMedia.has(k)) byMedia.set(k, []);
    byMedia.get(k).push(a);
  }
  const groups = [...byMedia.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));

  // 페이지 추정 (대략)
  const pageMap = new Map();
  let pn = 3;
  for (const [, arts] of groups) {
    for (const a of arts) {
      pageMap.set(a.id, pn);
      pn += settings.pageLayout === 'article' ? 1 : settings.pageLayout === 'compact' ? (1 / 3) : (1 / 2);
    }
    pn = Math.ceil(pn);
  }

  const children = [];

  // 표지 ────────────────────────────────────
  children.push(paraCenter(' ', { size: 14, before: 600 }));
  children.push(paraCenter(settings.title, { size: 30, bold: true, spacing: 120, before: 120, after: 600, box: true }));
  children.push(paraCenter(' ', { before: 400 }));
  children.push(paraCenter(`${settings.dateText || ''}${settings.issueLabel ? ' ' + settings.issueLabel : ''}`, { size: 26, before: 200 }));
  children.push(paraCenter(' ', { before: 300 }));
  children.push(paraCenter(settings.mainBoxTitle, { size: 60, bold: true, spacing: 240, box: true, before: 300, after: 100 }));
  if (settings.mainBoxSub)  children.push(paraCenter(settings.mainBoxSub, { size: 28 }));
  if (settings.extraTag1)   children.push(paraCenter(settings.extraTag1, { size: 26 }));
  if (settings.extraTag2)   children.push(paraCenter(settings.extraTag2, { size: 26 }));
  children.push(paraCenter(' ', { before: 800 }));
  children.push(paraCenter(settings.organization, { size: 28, bold: true, before: 600 }));
  children.push(pageBreak());

  // 목차 ────────────────────────────────────
  children.push(H1('언론사별 목차'));
  for (const [media, arts] of groups) {
    children.push(P(media, { bold: true, size: 24, before: 160, after: 60 }));
    for (const a of arts) {
      children.push(tocLine(media, a.pageLabel || (a.url ? '온라인' : '-'), a.title || '제목 없음', pageMap.get(a.id) || '-'));
    }
  }
  children.push(pageBreak());

  // 기사 ────────────────────────────────────
  for (const [media, arts] of groups) {
    children.push(H1(`■ ${media}`));
    arts.forEach((a, idx) => {
      children.push(articleHeading(media, a.pageLabel, a.publishedAt || a.date || ''));
      children.push(articleTitle(a.title));
      if (a.subtitle) children.push(P(a.subtitle, { size: 22, color: '333333' }));
      const paragraphs = String(a.contentText || '')
        .split(/\n+/).map(s => s.trim()).filter(Boolean);
      if (paragraphs.length) {
        paragraphs.forEach(p => children.push(articleBodyParagraph(p)));
      } else {
        children.push(P('⚠️ 본문 자동 추출 실패 — 원문 링크에서 직접 확인하세요.', { size: 20, color: '999999' }));
      }
      if (a.author) children.push(P(`— ${a.author}`, { size: 20, color: '555555', align: AlignmentType.RIGHT }));
      if (settings.showSourceLink && a.url) children.push(P(`원문: ${a.url}`, { size: 18, color: '666666' }));

      // 페이지 분할
      const breakHere = settings.pageLayout === 'article'
                     || (settings.pageLayout === 'compact' && (idx + 1) % 3 === 0)
                     || (settings.pageLayout === 'media'   && (idx + 1) % 2 === 0);
      if (breakHere && idx < arts.length - 1) children.push(pageBreak());
    });
    children.push(pageBreak()); // 다른 언론사로 넘어가면 새 페이지
  }

  // 분석 부록 (선택) ─────────────────────────
  if (settings.includeAnalysisAppendix !== false) {
    children.push(H1('분석 부록'));
    const sent = report.sentiment || {};
    children.push(P(`긍정 ${sent.positive || 0}건 / 부정 ${sent.negative || 0}건 / 중립 ${sent.neutral || 0}건 — ${sent.overall || '중립'}`, { size: 22 }));
    if ((report.negativeIssues || []).length) {
      children.push(H2(`부정 이슈 (${report.negativeIssues.length})`));
      report.negativeIssues.forEach(a => children.push(dashItem(`${truncate(a.title, 80)} [${a.source || ''}]`)));
    }
    if ((report.actionRequired || []).length) {
      children.push(H2(`대응 필요 기사 (${report.actionRequired.length})`));
      report.actionRequired.forEach(a => children.push(dashItem(`[${a.priority || '참고'}] ${truncate(a.title, 80)} [${a.source || ''}]`)));
    }
  }

  const doc = new Document({
    creator: 'Trend Collector',
    title:   settings.title || '언론 스크랩철',
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: convertInchesToTwip(1), right: convertInchesToTwip(0.9), bottom: convertInchesToTwip(1), left: convertInchesToTwip(0.9) } } },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}

// 분석형 Word — 기존 reportToDocx 가 이미 분석형 문체이므로 alias 로 노출.
export async function analysisToDocx(report, ctx = {}) {
  return reportToDocx(report, ctx);
}
