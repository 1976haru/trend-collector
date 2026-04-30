// ─────────────────────────────────────────────
// clippingTemplate.js — 편철형 출력물 (언론 스크랩철)
// 표지 → 언론사별 목차 → 언론사별 페이지 본문 → (선택)분석 부록
// 흑백 인쇄 최적화 · 명조 계열 · A4 세로 · 넓은 여백.
// 인쇄 직전 사용자가 setPrintSettings + applyOverrides 로 수정 가능.
// ─────────────────────────────────────────────

import sanitizeHtml from 'sanitize-html';
import { defaultPrintSettings } from './clippingPresets.js';
import { getKoreanFontFaceCss, FONT_STACK_SANS, FONT_STACK_SERIF } from './fonts.js';

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function safeUrl(u = '') {
  const s = String(u).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}
function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch { return iso || ''; }
}

// 본문 sanitize — reportTemplate 과 동일 정책 (단, 컬럼 본문은 흑백 인쇄 친화 폰트로 렌더)
const SAN_OPTS = {
  allowedTags:       ['p','br','strong','em','b','i','figure','figcaption','img','h2','h3','h4','ul','ol','li','blockquote','span'],
  allowedAttributes: { a: ['href'], img: ['src','alt'] },
  allowedSchemes:    ['http','https'],
  allowedSchemesByTag: { img: ['http','https','data'] },
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (_t, attribs) => {
      const href = /^https?:\/\//i.test(attribs.href || '') ? attribs.href : '';
      return { tagName: 'a', attribs: href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {} };
    },
    img: (_t, attribs) => {
      const src = /^https?:\/\//i.test(attribs.src || '') || /^data:image\//i.test(attribs.src || '') ? attribs.src : '';
      if (!src) return { tagName: 'span', attribs: {}, text: '' };
      return { tagName: 'img', attribs: { src, alt: (attribs.alt || '').slice(0,200), referrerpolicy: 'no-referrer', loading: 'lazy' } };
    },
    font: 'span', b: 'strong', i: 'em',
  },
};
function strictClean(html = '') { return sanitizeHtml(html, SAN_OPTS); }

function paragraphsFromText(text = '') {
  return String(text)
    .split(/\n+/)
    .map(s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// 기사 1건에 사용자가 입력한 override 를 덧입혀 반환
export function applyOverride(article, overrides = {}) {
  const o = overrides[article.id];
  if (!o) return { ...article, _include: true };
  return {
    ...article,
    title:        o.title       ?? article.title,
    subtitle:     o.subtitle    ?? article.subtitle,
    source:       o.source      ?? article.source,
    pageLabel:    o.pageLabel   ?? article.pageLabel,
    author:       o.author      ?? article.reporter ?? article.author,
    publishedAt:  o.publishedAt ?? article.date,
    category:     o.category    ?? article.mediaType,
    contentText:  o.contentText ?? article.contentText,
    _printOrder:  Number.isFinite(o.printOrder) ? o.printOrder : null,
    _include:     o.includeInClipping !== false,
    _leadImage:   o.leadImage   ?? null,
  };
}

// 편철용 정렬 + 필터
function buildPrintList(report, settings) {
  const overrides = report.articleOverrides || {};
  // excluded=true 기사는 모든 출력에서 자동 제외 (편철 PDF / Word / HTML)
  const sourceArticles = (report.articles || []).filter(a => !a.excluded);
  let list = sourceArticles.map(a => applyOverride(a, overrides)).filter(a => a._include);

  if (settings.sortBy === 'date') {
    list.sort((a, b) => String(a.publishedAt || '').localeCompare(String(b.publishedAt || '')));
  } else if (settings.sortBy === 'priority') {
    const ord = { 긴급: 0, 주의: 1, 참고: 2 };
    list.sort((a, b) => (ord[a.priority] ?? 3) - (ord[b.priority] ?? 3));
  } else {
    // media — 언론사별 묶음 (자동 그룹), 같은 언론사 내부에서는 날짜 → 제목 순
    list.sort((a, b) => {
      const sa = (a.source || 'ㅎ').localeCompare(b.source || 'ㅎ', 'ko');
      if (sa !== 0) return sa;
      return String(a.publishedAt || '').localeCompare(String(b.publishedAt || ''));
    });
  }
  // 사용자가 printOrder 를 지정한 항목은 그 순번에 우선 배치
  const ordered = list.filter(a => Number.isFinite(a._printOrder)).sort((a, b) => a._printOrder - b._printOrder);
  const rest    = list.filter(a => !Number.isFinite(a._printOrder));
  return [...ordered, ...rest];
}

function groupByMedia(list) {
  const map = new Map();
  for (const a of list) {
    const k = a.source || '미상';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(a);
  }
  // 언론사명 가나다 정렬
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ko'));
}

// 표지 — 사진 형태 (상단 박스 / 중앙 날짜·발행구분 / 중앙 큰 박스 / 하단 기관)
function renderCover(s) {
  return /* html */ `
    <section class="cl-cover">
      <div class="cl-top-box">${esc(s.title)}</div>
      <div class="cl-cover-spacer"></div>
      <div class="cl-cover-date">${esc(s.dateText)}${s.issueLabel ? ` ${esc(s.issueLabel)}` : ''}</div>
      <div class="cl-main-box">
        <div class="cl-main-title">${esc(s.mainBoxTitle)}</div>
        ${s.mainBoxSub ? `<div class="cl-main-sub">${esc(s.mainBoxSub)}</div>` : ''}
        <div class="cl-main-divider"></div>
        ${s.extraTag1 ? `<div class="cl-tag">${esc(s.extraTag1)}</div>` : ''}
        ${s.extraTag2 ? `<div class="cl-tag">${esc(s.extraTag2)}</div>` : ''}
      </div>
      <div class="cl-cover-spacer-lg"></div>
      <div class="cl-cover-org">${esc(s.organization)}</div>
    </section>
  `;
}

// 언론사별 목차 — 언론사 / 지면 / 제목 / 페이지
function renderToc(groups, pageMap) {
  const rows = [];
  for (const [media, arts] of groups) {
    rows.push(`<div class="cl-toc-media">${esc(media)}</div>`);
    for (const a of arts) {
      const page = pageMap.get(a.id) || '-';
      const pl = a.pageLabel || (a.url ? '온라인' : '-');
      rows.push(`
        <div class="cl-toc-row">
          <span class="cl-toc-page-label">${esc(pl)}</span>
          <span class="cl-toc-title"><a href="#cl-${esc(a.id)}">${esc(a.title || '제목 없음')}</a></span>
          <span class="cl-toc-leader"></span>
          <span class="cl-toc-page">${page}</span>
        </div>
      `);
    }
  }
  return /* html */ `
    <section class="cl-toc">
      <h2 class="cl-section-head">언론사별 목차</h2>
      ${rows.join('')}
    </section>
  `;
}

// 기사 1건 — 신문 스크랩형
function renderArticle(a, settings) {
  const u = safeUrl(a.url);
  const cols = Math.max(1, Math.min(3, Number(settings.columnCount) || 1));
  let bodyHtml = '';
  if (a.contentHtml && a.extracted) bodyHtml = strictClean(a.contentHtml);
  else if (a.contentText)            bodyHtml = paragraphsFromText(a.contentText).map(p => `<p>${esc(p)}</p>`).join('');
  else                               bodyHtml = `<p class="cl-missing">⚠️ 본문 자동 추출 실패 — 원문 링크에서 직접 확인하세요.</p>`;

  const lead = settings.imageMode !== 'none'
    && (a._leadImage || (a.images && a.images[0]) || (a.leadImage ? { url: a.leadImage } : null));

  const pl = a.pageLabel || (a.url ? '온라인' : '');
  const dateLabel = a.publishedAt || a.date || '';

  return /* html */ `
    <article class="cl-article col-${cols}" id="cl-${esc(a.id)}">
      <header class="cl-art-head">
        <div class="cl-art-media">${esc(a.source || '미상')}</div>
        <div class="cl-art-meta">
          ${pl ? `<span class="cl-page-label">${esc(pl)}</span>` : ''}
          ${a.category ? `<span class="cl-cat">${esc(a.category)}</span>` : ''}
          ${dateLabel ? `<span class="cl-date">${esc(dateLabel)}</span>` : ''}
        </div>
      </header>
      <h3 class="cl-art-title">${esc(a.title || '제목 없음')}</h3>
      ${a.subtitle ? `<div class="cl-art-subtitle">${esc(a.subtitle)}</div>` : ''}
      ${lead && safeUrl(lead.url) ? `
        <figure class="cl-art-lead">
          <img src="${esc(safeUrl(lead.url))}" referrerpolicy="no-referrer" loading="lazy"
               onerror="this.style.display='none'" />
          ${lead.caption ? `<figcaption>${esc(lead.caption)}</figcaption>` : ''}
        </figure>` : ''}
      <div class="cl-art-body">${bodyHtml}</div>
      ${a.author ? `<div class="cl-art-byline">— ${esc(a.author)}</div>` : ''}
      ${settings.showSourceLink && u ? `<div class="cl-art-link">원문: <a href="${esc(u)}">${esc(u)}</a></div>` : ''}
    </article>
  `;
}

// 분석 부록 — 편철 PDF 에 옵션으로 포함
function renderAnalysisAppendix(report) {
  const negs = report.negativeIssues || [];
  const poss = report.positiveIssues || [];
  const acts = report.actionRequired || [];
  const ag   = report.agencyStats || {};
  const dept = Object.entries(report.departmentCounts || {}).sort((a, b) => b[1] - a[1]);
  return /* html */ `
    <section class="cl-appendix">
      <h2 class="cl-section-head">분석 부록</h2>
      <h3 class="cl-h3">긍정 / 부정 / 중립 분석</h3>
      <p>긍정 ${(report.sentiment?.positive ?? 0)}건 · 부정 ${(report.sentiment?.negative ?? 0)}건 · 중립 ${(report.sentiment?.neutral ?? 0)}건 — ${esc(report.sentiment?.overall || '중립')}</p>
      ${negs.length ? `<h3 class="cl-h3">부정 이슈 (${negs.length})</h3><ol>${negs.map(a => `<li>${esc(a.title)} <span class="cl-mute">[${esc(a.source || '')}]</span></li>`).join('')}</ol>` : ''}
      ${poss.length ? `<h3 class="cl-h3">긍정 이슈 (${poss.length})</h3><ol>${poss.map(a => `<li>${esc(a.title)} <span class="cl-mute">[${esc(a.source || '')}]</span></li>`).join('')}</ol>` : ''}
      ${acts.length ? `<h3 class="cl-h3">대응 필요 기사 (${acts.length})</h3><ol>${acts.map(a => `<li>[${esc(a.priority || '참고')}] ${esc(a.title)} <span class="cl-mute">[${esc(a.source || '')}]</span></li>`).join('')}</ol>` : ''}
      ${dept.length ? `<h3 class="cl-h3">관련 부서</h3><ul>${dept.map(([k, v]) => `<li>${esc(k)} — ${v}건</li>`).join('')}</ul>` : ''}
      <h3 class="cl-h3">기관 배포자료 현황</h3>
      <p>기관 배포 ${ag.agency || 0}건 / 일반 언론보도 ${ag.press || 0}건 — 재인용 ${report.publicityStats?.totalReCites || 0}건 (중앙·방송 ${report.publicityStats?.centralCoverage || 0}건)</p>
      ${report.autoTrackingSync ? `<p>자동 추적 등록: 신규 ${report.autoTrackingSync.created}건 · 기존 ${report.autoTrackingSync.existing}건 (총 자동 ${report.autoTrackingSync.totalAutoLinks}건)</p>` : ''}
    </section>
  `;
}

// 출력 전 품질 점검 — 본문/이미지/제목/언론사/지면 누락 카운트
export function buildQualityReport(report) {
  const overrides = report.articleOverrides || {};
  const list = (report.articles || []).filter(a => !a.excluded)
    .map(a => applyOverride(a, overrides)).filter(a => a._include);
  const issues = {
    missingBody:    [],
    missingImage:   [],
    missingTitle:   [],
    missingSource:  [],
    missingPage:    [],
  };
  for (const a of list) {
    if (!a.contentText && !a.contentHtml) issues.missingBody.push({ id: a.id, title: a.title });
    if (!(a.images && a.images[0]) && !a.leadImage && !a._leadImage) issues.missingImage.push({ id: a.id, title: a.title });
    if (!a.title || !String(a.title).trim()) issues.missingTitle.push({ id: a.id, title: '(제목 없음)' });
    if (!a.source || !String(a.source).trim()) issues.missingSource.push({ id: a.id, title: a.title });
    if (!a.pageLabel) issues.missingPage.push({ id: a.id, title: a.title });
  }
  return {
    total: list.length,
    issues,
    counts: {
      missingBody:   issues.missingBody.length,
      missingImage:  issues.missingImage.length,
      missingTitle:  issues.missingTitle.length,
      missingSource: issues.missingSource.length,
      missingPage:   issues.missingPage.length,
    },
  };
}

// ── 메인 — 편철형 HTML ─────────────────────────
// opts.fast === true → 외부 폰트 link 제거 (Render 콜드 스타트 timeout 방지)
//                      + settings.imageMode 강제 'lead' (이미지 부담 최소화)
//                      + 분석 부록 자동 비활성 (필요 시 명시적 ON)
export function renderClippingHtml(report, opts = {}) {
  const settings = { ...defaultPrintSettings(report), ...(report.printSettings || {}), ...(opts.settings || {}) };
  if (opts.fast) {
    settings.imageMode = settings.imageMode === 'none' ? 'none' : 'lead';
    if (opts.includeAppendix === undefined) opts = { ...opts, includeAppendix: false };
  }
  const list     = buildPrintList(report, settings);
  const groups   = groupByMedia(list);

  // 페이지 번호 — 표지(1) + 목차(2) 다음부터 본문 시작 (대략 3p+)
  // 정확한 페이지는 실제 PDF 변환 시점에서만 알 수 있으므로 대략적으로 표시.
  const pageMap = new Map();
  let pageNum = 3;
  for (const [, arts] of groups) {
    for (const a of arts) {
      pageMap.set(a.id, pageNum);
      // pageLayout: media → 같은 언론사 안에서 2건/페이지 추정,
      //             article → 1건당 1페이지, compact → 3건/페이지 추정
      pageNum += settings.pageLayout === 'article' ? 1
              : settings.pageLayout === 'compact' ? (1 / 3)
              : (1 / 2);
    }
    pageNum = Math.ceil(pageNum); // 다른 언론사로 넘어갈 때 새 페이지
  }

  const cover  = renderCover(settings);
  const toc    = groups.length ? renderToc(groups, pageMap) : '';
  const body   = groups.map(([media, arts]) => /* html */ `
    <section class="cl-media-section" data-media="${esc(media)}">
      <div class="cl-media-divider">${esc(media)}</div>
      ${arts.map((a, idx) => renderArticle(a, settings) + (
        settings.pageLayout === 'article' ? '<div class="cl-pb"></div>' :
        settings.pageLayout === 'compact' && (idx + 1) % 3 === 0 ? '<div class="cl-pb"></div>' :
        settings.pageLayout === 'media'   && (idx + 1) % 2 === 0 ? '<div class="cl-pb"></div>' : ''
      )).join('')}
    </section>
  `).join('');

  const appendix = settings.includeAnalysisAppendix !== false && opts.includeAppendix !== false
    ? renderAnalysisAppendix(report)
    : '';

  // 한글 폰트는 base64 inline @font-face 로 임베드 — 외부 CDN 의존 X, Render Linux 호환.
  // fast 모드와 일반 모드 모두 동일하게 임베드한다 (한글 깨짐 방지가 최우선).
  const fontFaceCss = getKoreanFontFaceCss();

  return /* html */ `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" />
<title>${esc(settings.title)}</title>
<style>
  ${fontFaceCss}
  @page { size: A4 portrait; margin: 25mm 22mm; }
  * { box-sizing: border-box; }
  html, body { background: white; }
  body {
    font-family: ${FONT_STACK_SERIF};
    color: #000;
    line-height: 1.7;
    font-size: 10.5pt;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  a { color: inherit; text-decoration: none; }

  /* ── 표지 ───────────────────────────── */
  .cl-cover {
    page-break-after: always;
    min-height: 245mm;
    text-align: center;
    display: flex; flex-direction: column; align-items: center;
  }
  .cl-top-box {
    border: 1.6pt solid #000;
    padding: 8pt 26pt;
    font-size: 17pt; font-weight: 700; letter-spacing: 4pt;
    margin-bottom: 18mm; margin-top: 4mm;
  }
  .cl-cover-spacer    { height: 22mm; }
  .cl-cover-spacer-lg { flex: 1; min-height: 18mm; }
  .cl-cover-date { font-size: 13pt; margin-bottom: 14mm; letter-spacing: 1pt; }
  .cl-main-box {
    border: 2pt solid #000;
    padding: 22mm 12mm 16mm;
    width: 110mm; min-height: 95mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    margin-bottom: 12mm;
  }
  .cl-main-title { font-size: 32pt; font-weight: 700; letter-spacing: 8pt; padding-left: 8pt; }
  .cl-main-sub   { font-size: 16pt; margin-top: 6pt; letter-spacing: 2pt; }
  .cl-main-divider { width: 80%; height: 0; border-top: .8pt solid #000; margin: 12pt 0 6pt; }
  .cl-tag { font-size: 14pt; margin-top: 4pt; letter-spacing: 3pt; }
  .cl-cover-org {
    font-size: 16pt; font-weight: 700; letter-spacing: 4pt;
    border-top: 1pt solid #000; padding-top: 6pt; min-width: 60mm;
  }

  /* ── 섹션 헤더 ───────────────────────── */
  .cl-section-head {
    font-size: 16pt; font-weight: 700;
    border-bottom: 1.4pt solid #000;
    padding-bottom: 4pt; margin: 0 0 10pt;
    page-break-after: avoid;
  }
  .cl-h3 { font-size: 12pt; font-weight: 700; margin: 12pt 0 4pt; }

  /* ── 목차 ───────────────────────────── */
  .cl-toc { page-break-after: always; }
  .cl-toc-media { font-weight: 700; font-size: 12pt; margin: 10pt 0 3pt; padding-bottom: 2pt; border-bottom: .4pt solid #888; }
  .cl-toc-row {
    display: grid; grid-template-columns: 60pt 1fr 30pt;
    gap: 6pt; padding: 2pt 0; font-size: 10.5pt;
    align-items: baseline;
  }
  .cl-toc-row .cl-toc-page-label { color: #444; font-size: 9.5pt; }
  .cl-toc-row .cl-toc-title { overflow: hidden; }
  .cl-toc-row .cl-toc-title a { border-bottom: .3pt dotted #888; }
  .cl-toc-row .cl-toc-page { text-align: right; font-variant-numeric: tabular-nums; }
  .cl-toc-row .cl-toc-leader { display: none; }

  /* ── 언론사 섹션 / 페이지 분할 ───────────── */
  .cl-media-section { page-break-before: always; padding-top: 4mm; }
  .cl-media-divider {
    font-weight: 700; font-size: 13pt;
    border-bottom: 1.2pt solid #000; padding-bottom: 3pt;
    margin-bottom: 8pt; letter-spacing: 1pt;
  }
  .cl-pb { page-break-after: always; height: 0; }

  /* ── 기사 ───────────────────────────── */
  .cl-article {
    margin-bottom: 6mm; padding-bottom: 4mm;
    border-bottom: .3pt dashed #999;
    page-break-inside: avoid;
  }
  .cl-art-head {
    display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: .4pt solid #000; padding-bottom: 2pt; margin-bottom: 4pt;
    font-size: 9.5pt;
  }
  .cl-art-media { font-weight: 700; font-size: 11pt; letter-spacing: 1pt; }
  .cl-art-meta  { display: flex; gap: 8pt; color: #333; }
  .cl-art-meta  .cl-page-label { border: .3pt solid #000; padding: 0 4pt; font-size: 9pt; }
  .cl-art-title { font-size: 17pt; font-weight: 700; line-height: 1.3; margin: 6pt 0 4pt; letter-spacing: -.3pt; }
  .cl-art-subtitle { font-size: 11pt; color: #222; margin-bottom: 6pt; }
  .cl-art-lead { margin: 4pt 0 6pt; }
  .cl-art-lead img {
    width: 100%; max-height: 80mm; object-fit: cover;
    border: .4pt solid #888;
  }
  .cl-art-lead figcaption { font-size: 9pt; color: #444; margin-top: 2pt; }
  .cl-art-body { font-size: 10.5pt; line-height: 1.85; text-align: justify; word-break: keep-all; }
  .cl-art-body p { margin: 4pt 0 6pt; text-indent: 8pt; }
  .cl-art-body img { max-width: 100%; }

  /* ── 출력 색상 모드 ─────────────────────
   * body class 로 분기:
   *   .clipping-bw            — 모든 이미지 흑백 (기본, 공공기관 인쇄)
   *   .clipping-color-images  — 표지/목차는 흑백 유지, 이미지만 컬러
   *   .clipping-full-color    — 이미지 + 분석 배지 모두 컬러
   */
  body.clipping-bw .cl-art-lead img,
  body.clipping-bw .cl-art-body img,
  body.clipping-bw .cl-cover img {
    filter: grayscale(100%) contrast(1.05);
  }
  body.clipping-color-images .cl-art-lead img,
  body.clipping-color-images .cl-art-body img,
  body.clipping-full-color .cl-art-lead img,
  body.clipping-full-color .cl-art-body img {
    filter: none;
  }
  /* full-color 모드 — 분석 부록의 감정/중요도 배지 색상 표시 */
  body.clipping-full-color .cl-appendix .cl-h3   { color: #1d4ed8; }
  body.clipping-full-color .cl-mute              { color: #6b7280; }

  /* PDF 색상 강제 — Chromium 이 인쇄 시 색상 보존하도록 */
  @media print {
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  .cl-art-body .cl-missing { color: #555; font-style: italic; }
  .cl-art-byline { text-align: right; font-size: 9.5pt; color: #444; margin-top: 4pt; }
  .cl-art-link { font-size: 8.5pt; color: #555; margin-top: 4pt; word-break: break-all; }

  /* 본문 단수 — 1단(기본) / 2단 / 3단 */
  .cl-article.col-2 .cl-art-body { column-count: 2; column-gap: 7mm; column-rule: .3pt solid #ccc; }
  .cl-article.col-3 .cl-art-body { column-count: 3; column-gap: 6mm; column-rule: .3pt solid #ccc; }

  /* ── 분석 부록 ───────────────────────── */
  .cl-appendix { page-break-before: always; }
  .cl-mute { color: #666; font-size: 9.5pt; }

  @media print {
    body { font-size: 10.5pt; }
  }
</style></head><body class="clipping-${['bw', 'color-images', 'full-color'].includes(settings.colorMode) ? settings.colorMode : 'bw'}">
<div id="report-pdf-root">
  ${cover}
  ${toc}
  ${body}
  ${appendix}
</div>
</body></html>`;
}
