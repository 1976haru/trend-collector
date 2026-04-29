// ─────────────────────────────────────────────
// wordGenerator.js — 보고서 → .docx 변환
// 표지 → 요약(서론) → 본론(주요 이슈/기사) → 분석 → 결론 (기승전결)
// PDF 가 실패해도 동일한 보고서를 Word 로 안정 생성한다.
// ─────────────────────────────────────────────

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  PageBreak, LevelFormat, convertInchesToTwip,
} from 'docx';

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

function P(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing:   { before: opts.before ?? 60, after: opts.after ?? 60, line: 320 },
    children: [
      new TextRun({
        text:  String(text ?? ''),
        font:  FONT,
        size:  opts.size  || 22,            // half-points (22 = 11pt)
        bold:  !!opts.bold,
        color: opts.color || undefined,
      }),
    ],
  });
}

function H(text, level = HeadingLevel.HEADING_1) {
  const size = level === HeadingLevel.HEADING_1 ? 32
             : level === HeadingLevel.HEADING_2 ? 28
             : 24;
  return new Paragraph({
    heading:  level,
    spacing:  { before: 240, after: 120, line: 320 },
    children: [new TextRun({ text: String(text), font: FONT, size, bold: true, color: '0d1117' })],
  });
}

function bulletItem(text) {
  return new Paragraph({
    bullet:   { level: 0 },
    spacing:  { before: 30, after: 30, line: 300 },
    children: [new TextRun({ text: String(text), font: FONT, size: 22 })],
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
    children: headers.map((h, i) => cell(h, { header: true, bold: true, width: widths?.[i], align: AlignmentType.LEFT })),
  });
  const bodyRows = rows.map(r => new TableRow({
    children: r.map((c, i) => cell(c, { width: widths?.[i] })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 6,  color: 'CCCCCC' },
      bottom: { style: BorderStyle.SINGLE, size: 6,  color: 'CCCCCC' },
      left:   { style: BorderStyle.SINGLE, size: 6,  color: 'CCCCCC' },
      right:  { style: BorderStyle.SINGLE, size: 6,  color: 'CCCCCC' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' },
      insideVertical:   { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' },
    },
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// 결론 자동 생성 (rule 기반)
function buildConclusion(report) {
  const r       = report || {};
  const total   = (r.articles || []).length;
  const sent    = r.sentiment || {};
  const action  = r.actionRequired || [];
  const trending= r.trending || [];
  const lines   = [];

  if (total === 0) {
    lines.push('금일은 수집된 보도가 없어 별도의 대응 사항이 없습니다.');
    return lines;
  }

  if (action.length === 0) {
    lines.push(`총 ${total}건의 보도 중 즉각적인 대응이 필요한 이슈는 없습니다. 일상 모니터링을 유지합니다.`);
  } else {
    const urgent = action.filter(a => a.priority === '긴급').length;
    const watch  = action.filter(a => a.priority === '주의').length;
    lines.push(`대응 필요 이슈는 총 ${action.length}건 (긴급 ${urgent}건, 주의 ${watch}건) 으로 식별되었습니다.`);
    if (urgent > 0) lines.push('• 긴급 이슈에 대해서는 관계 부서의 사실관계 확인 및 입장 정리가 즉시 권고됩니다.');
    if (watch > 0)  lines.push('• 주의 이슈는 추이 관찰 및 필요 시 보도해명 준비가 권고됩니다.');
  }

  if ((sent.negativePct || 0) >= 50) {
    lines.push(`⚠️ 부정 보도 비율이 ${sent.negativePct}% 로 절반을 넘어 위험 수위에 있습니다. 비판 논점에 대한 대응 메시지 정리가 필요합니다.`);
  } else if ((sent.negativePct || 0) >= 30) {
    lines.push(`부정 보도 비율 ${sent.negativePct}% 로 평소 대비 부담이 높은 편입니다.`);
  }

  if (trending.length > 0) {
    const list = trending.slice(0, 3).map(t => `${t.keyword}(${t.prev}→${t.curr})`).join(', ');
    lines.push(`📈 급상승 키워드: ${list}. 관련 부서의 모니터링 강화가 권고됩니다.`);
  }

  lines.push('본 보고는 자동 수집 결과를 기반으로 하며, 세부 사실관계는 원문 확인이 필요합니다.');
  return lines;
}

// 본론 — 주요 이슈 TOP
function buildKeyIssuesSection(report) {
  const blocks = [];
  const negs = (report.negativeIssues || []).slice(0, 5);
  const poss = (report.positiveIssues || []).slice(0, 5);

  blocks.push(H('Ⅲ. 본론 — 주요 이슈 및 기사', HeadingLevel.HEADING_1));

  if (negs.length) {
    blocks.push(H(`🔴 부정 이슈 TOP ${negs.length}`, HeadingLevel.HEADING_2));
    negs.forEach((a, i) => {
      blocks.push(P(`${i + 1}) [${a.priority || '참고'}] ${a.title || ''}`, { bold: true, size: 22 }));
      blocks.push(P(`매체: ${a.source || '미상'}  ·  키워드: ${a.keyword || ''}  ·  감정: ${a.sentiment?.label || ''}`, { size: 20, color: '555555' }));
      const neg = (a.sentiment?.matchedKeywords?.negative || []).slice(0, 6).join(', ');
      if (neg) blocks.push(P(`근거: ${neg}`, { size: 20, color: '555555' }));
      if (a.briefLine) blocks.push(P(`📝 ${a.briefLine}`, { size: 20 }));
    });
  }
  if (poss.length) {
    blocks.push(H(`🟢 긍정 이슈 TOP ${poss.length}`, HeadingLevel.HEADING_2));
    poss.forEach((a, i) => {
      blocks.push(P(`${i + 1}) ${a.title || ''}`, { bold: true, size: 22 }));
      blocks.push(P(`매체: ${a.source || '미상'}  ·  키워드: ${a.keyword || ''}`, { size: 20, color: '555555' }));
      if (a.briefLine) blocks.push(P(`📝 ${a.briefLine}`, { size: 20 }));
    });
  }
  if (!negs.length && !poss.length) {
    blocks.push(P('주요 이슈로 분류된 기사가 없습니다.', { size: 22 }));
  }
  return blocks;
}

// 기사 전체 표
function buildArticleTable(articles) {
  const headers = ['#', '우선순위', '제목', '매체', '감정', '발행처'];
  const widths  = [4, 10, 50, 16, 10, 10];
  const rows = articles.map((a, i) => [
    String(i + 1),
    a.priority || '참고',
    (a.title || '').slice(0, 120),
    a.source || '미상',
    a.sentiment?.label || '',
    a.articleSource === 'agency' ? '기관' : '언론',
  ]);
  return makeTable(headers, rows, widths);
}

// ── 메인 — 보고서 → docx Buffer ────────────────
export async function reportToDocx(report) {
  const r = report || {};
  const total       = (r.articles || []).length;
  const sentiment   = r.sentiment   || {};
  const briefing    = r.briefingText || {};
  const trending    = r.trending    || [];
  const mediaCounts = r.mediaCounts || {};
  const agency      = r.agencyStats || { agency: 0, press: total, byAgency: {} };
  const conclusion  = buildConclusion(r);
  const today       = fmtDate(r.generatedAt);
  const titleStr    = r.title || `${today} 법무부 언론보도 분석 보고`;

  const children = [];

  // [1] 표지
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing:   { before: 720, after: 240 },
    children:  [new TextRun({ text: 'Trend Collector', font: FONT, size: 24, color: '888888' })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing:   { before: 120, after: 120 },
    children:  [new TextRun({ text: titleStr, font: FONT, size: 40, bold: true, color: '0d1117' })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing:   { before: 120, after: 600 },
    children:  [new TextRun({ text: `${today} 작성`, font: FONT, size: 22, color: '555555' })],
  }));
  children.push(makeTable(
    ['항목', '내용'],
    [
      ['생성 일시',    fmtKST(r.generatedAt)],
      ['수집 기간',    `${fmtDate(r.period?.from)} ~ ${fmtDate(r.period?.to)} (${r.period?.label || '-'})`],
      ['검색 키워드',  (r.keywords || []).join(', ') || '—'],
      ['총 기사 수',   `${total}건 (본문 추출 ${r.extractedCount || 0}/${total})`],
      ['위험 등급',    `${r.riskLevel?.level || '-'} ${r.riskLevel?.reasons?.length ? '(' + r.riskLevel.reasons.join(', ') + ')' : ''}`],
      ['보고서 ID',    r.id || ''],
    ],
    [25, 75],
  ));
  children.push(pageBreak());

  // [2] 요약 (서론)
  children.push(H('Ⅰ. 요약 (서론)', HeadingLevel.HEADING_1));
  children.push(P(briefing.총평 || r.summaryText || `금일 키워드(${(r.keywords||[]).join(', ')}) 관련 보도는 총 ${total}건이 수집되었습니다.`));
  if (sentiment.total) {
    children.push(P(
      `감정 분포: 긍정 ${sentiment.positive}건(${sentiment.positivePct}%) · 부정 ${sentiment.negative}건(${sentiment.negativePct}%) · 중립 ${sentiment.neutral}건(${sentiment.neutralPct}%) — 전반: ${sentiment.overall || ''}`,
      { size: 20 },
    ));
  }
  children.push(P(`기관 배포 ${agency.agency}건 · 언론 보도 ${agency.press}건`, { size: 20 }));
  if (trending.length) {
    children.push(P(`📈 급상승 키워드: ${trending.slice(0, 5).map(t => `${t.keyword}(${t.prev}→${t.curr})`).join(', ')}`, { size: 20, color: '9a3412' }));
  }

  // [3] 주요 보도 동향
  children.push(H('Ⅱ. 주요 보도 동향', HeadingLevel.HEADING_1));
  if (briefing.주요보도동향) children.push(P(briefing.주요보도동향));
  const mediaRows = Object.entries(mediaCounts).filter(([, v]) => v > 0);
  if (mediaRows.length) {
    children.push(H('언론 유형별 건수', HeadingLevel.HEADING_3));
    children.push(makeTable(['유형', '건수'], mediaRows.map(([k, v]) => [k, `${v}건`]), [70, 30]));
  }
  const byAgency = Object.entries(agency.byAgency || {}).sort((a, b) => b[1] - a[1]);
  if (byAgency.length) {
    children.push(H('기관 배포자료 — 매체별', HeadingLevel.HEADING_3));
    children.push(makeTable(['매체', '건수'], byAgency.map(([k, v]) => [k, `${v}건`]), [70, 30]));
  }

  // [4] 본론 — 주요 이슈
  children.push(...buildKeyIssuesSection(r));

  // [5] 기사 전체 표
  children.push(H('Ⅳ. 전체 기사 목록', HeadingLevel.HEADING_1));
  if (total > 0) {
    children.push(buildArticleTable(r.articles || []));
  } else {
    children.push(P('수집된 기사가 없습니다.'));
  }

  // [6] 분석
  children.push(H('Ⅴ. 분석', HeadingLevel.HEADING_1));
  if (briefing.대응필요이슈) {
    children.push(H('대응 필요 이슈', HeadingLevel.HEADING_2));
    children.push(P(briefing.대응필요이슈));
  }
  if (briefing.관련부서참고사항) {
    children.push(H('관련 부서 참고사항', HeadingLevel.HEADING_2));
    children.push(P(briefing.관련부서참고사항));
  }
  // 부서별 분포
  const dept = Object.entries(r.departmentCounts || {}).sort((a, b) => b[1] - a[1]);
  if (dept.length) {
    children.push(H('관련 부서별 보도량', HeadingLevel.HEADING_3));
    children.push(makeTable(['부서', '건수'], dept.map(([k, v]) => [k, `${v}건`]), [70, 30]));
  }

  // [7] 결론 / 권고
  children.push(H('Ⅵ. 결론 및 권고', HeadingLevel.HEADING_1));
  conclusion.forEach(line => children.push(bulletItem(line)));

  // 푸터 마무리
  children.push(P(' ', { size: 18 }));
  children.push(P('— 본 보고서는 Trend Collector 가 자동 생성한 내부 업무용 자료입니다. —', {
    align: AlignmentType.CENTER, size: 18, color: '888888',
  }));

  const doc = new Document({
    creator: 'Trend Collector',
    title:   titleStr,
    description: '법무부 언론보도 일일 분석 보고서',
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top:    convertInchesToTwip(0.7),
            right:  convertInchesToTwip(0.7),
            bottom: convertInchesToTwip(0.7),
            left:   convertInchesToTwip(0.7),
          },
        },
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}
