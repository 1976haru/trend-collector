// ─────────────────────────────────────────────
// reportTemplate.js — 법무부 일일보고 PDF / 메일 / 인쇄용 HTML
// 기사 본문은 sanitize-html 로 화이트리스트 정제.
// 기사 섹션은 신문 카드(원문형) 레이아웃.
// 루트에 id="report-pdf-root" 를 두어 Puppeteer 가 렌더링 완료를 감지.
// ─────────────────────────────────────────────

import sanitizeHtml from 'sanitize-html';
import { getKoreanFontFaceCss, FONT_STACK_SANS } from './fonts.js';
import { APP_NAME, getAppVersion } from './changelog.js';

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fmtKST(iso) {
  try { return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }); } catch { return iso; }
}
function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    });
  } catch { return iso; }
}
function safeUrl(u = '') {
  const s = String(u).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

// ── 본문 HTML 화이트리스트 정제 ─────────────────
// <font>, <a> 같은 태그가 텍스트로 새는 문제 차단.
const SAN_OPTS = {
  allowedTags:       ['p','br','strong','em','b','i','figure','figcaption','img','h2','h3','h4','ul','ol','li','blockquote','span'],
  allowedAttributes: {
    a:   ['href'],
    img: ['src', 'alt'],
  },
  allowedSchemes:    ['http', 'https'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  // 구식 / 위험 태그 통째 제거
  disallowedTagsMode: 'discard',
  exclusiveFilter: function (frame) {
    // 텍스트 0자 + 자식 0개인 빈 p 제거
    if (frame.tag === 'p' && !frame.text.trim() && !frame.tag.length) return true;
    return false;
  },
  transformTags: {
    a: (tagName, attribs) => {
      const href = attribs.href && /^https?:\/\//i.test(attribs.href) ? attribs.href : '';
      return {
        tagName: 'a',
        attribs: href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {},
      };
    },
    img: (tagName, attribs) => {
      const src = attribs.src && /^https?:\/\//i.test(attribs.src) ? attribs.src : '';
      if (!src) return { tagName: 'span', attribs: {}, text: '' };
      return {
        tagName: 'img',
        attribs: { src, alt: (attribs.alt || '').slice(0, 200), referrerpolicy: 'no-referrer', loading: 'lazy' },
      };
    },
    font: 'span',
    b:    'strong',
    i:    'em',
  },
  textFilter: (t) => t.replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' '),
};

function strictClean(html = '') {
  return sanitizeHtml(html, SAN_OPTS);
}

// 본문 텍스트 (paragraph 단위 분리)
// 안전 차원에서 텍스트 내부에 raw HTML 태그가 남아있으면 한 번 더 strip.
function paragraphsFromText(text = '') {
  return String(text)
    .split(/\n+/)
    .map(s => s
      .replace(/<[^>]+>/g, ' ')      // 잔존 raw 태그 제거
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);
}

function priorityBadge(p) {
  const map = {
    '긴급': { bg: '#fee2e2', fg: '#991b1b', icon: '🚨' },
    '주의': { bg: '#fef3c7', fg: '#92400e', icon: '⚠️' },
    '참고': { bg: '#dcfce7', fg: '#166534', icon: 'ℹ️' },
  };
  const v = map[p] || map['참고'];
  return `<span class="prio" style="background:${v.bg}; color:${v.fg};">${v.icon} ${p}</span>`;
}

function sentClass(label) {
  return label === '긍정' ? 'pos' : label === '부정' ? 'neg' : 'neu';
}

// ── 기사 한 건의 신문 카드 형태 섹션 ────────────
function renderArticleCard(a, i, includeImages = true) {
  const u        = safeUrl(a.url);
  const sLbl     = a.sentiment?.label || '중립';
  const reasons  = (a.sentiment?.reasons || []).join(' · ');
  const matchedNeg = (a.sentiment?.matchedKeywords?.negative || []).slice(0, 6);
  const matchedPos = (a.sentiment?.matchedKeywords?.positive || []).slice(0, 6);
  const depts    = (a.departments || []).map(d => d.name).join(', ');
  const issueType = a.sentiment?.issueType || '';

  // 본문 — 우선순위:
  //   ① 추출된 cleanHtml  ② contentText 문단  ③ synthesizedFallback (RSS 합성)
  //   ④ + fallbackScreenshot (스크린샷)
  let bodyHtml = '';
  if (a.contentHtml && a.extracted) {
    bodyHtml = strictClean(a.contentHtml);
  } else if (a.contentText && a.extracted) {
    bodyHtml = paragraphsFromText(a.contentText).map(p => `<p>${esc(p)}</p>`).join('');
  } else if (a.synthesizedFallback) {
    bodyHtml = `<div class="fallback-note">⚠️ 본문 자동 추출에 실패하여 RSS 메타데이터로 대체된 보고서 항목입니다.</div>`
            + paragraphsFromText(a.synthesizedFallback).map(p => `<p>${esc(p)}</p>`).join('');
  } else {
    bodyHtml = `<p class="missing">⚠️ 본문 자동 추출 실패 — 원문 링크에서 직접 확인하세요. (${esc(a.extractionError || 'no body')})</p>`
            + (a.summary ? `<p>${esc(a.summary)}</p>` : '');
  }
  // 스크린샷 fallback (data: URI) 이 있으면 본문 끝에 표시
  if (a.fallbackScreenshot && /^data:image\//i.test(a.fallbackScreenshot)) {
    bodyHtml += `
      <div class="screenshot-block">
        <div class="screenshot-label">📸 원문 페이지 스크린샷 (자동 추출 대체)</div>
        <img src="${esc(a.fallbackScreenshot)}" alt="원문 페이지 스크린샷" />
      </div>`;
  }

  // 대표 이미지 + 본문 이미지
  const lead   = (a.images && a.images[0]) || (a.leadImage ? { url: a.leadImage } : null);
  const inline = includeImages ? (a.images || []).slice(1, 3) : [];

  return `
    <section class="article" id="a${i + 1}">
      <div class="article-source">
        <span class="src-name">${esc(a.source || '미상')}</span>
        ${a.mediaType ? `<span class="src-tag">${esc(a.mediaType)}</span>` : ''}
        ${a.sourceProvider ? `<span class="src-provider">${a.sourceProvider === 'naver' ? '🇰🇷 Naver' : '🌍 Google'}</span>` : ''}
      </div>
      <h2 class="article-title">${esc(a.title || '제목 없음')}</h2>
      <div class="article-byline">
        ${a.reporter ? `<span>✍ ${esc(a.reporter)}</span>` : ''}
        ${a.date ? `<span>📅 ${esc(a.date)}</span>` : ''}
        <span class="kw-tag">#${esc(a.keyword || '')}</span>
        ${issueType ? `<span class="issue-tag">${esc(issueType)}</span>` : ''}
      </div>

      ${includeImages && lead && safeUrl(lead.url) ? `
        <figure class="lead-fig">
          <img src="${esc(safeUrl(lead.url))}" referrerpolicy="no-referrer" loading="lazy"
               onerror="this.style.display='none'; this.nextElementSibling && (this.nextElementSibling.style.display='none')" />
          ${lead.caption ? `<figcaption>${esc(lead.caption)}</figcaption>` : ''}
        </figure>` : ''}

      <div class="article-body">${bodyHtml}</div>

      ${inline.length ? `
        <div class="inline-imgs">
          ${inline.map(img => safeUrl(img.url) ? `
            <figure class="inline-fig">
              <img src="${esc(safeUrl(img.url))}" referrerpolicy="no-referrer" loading="lazy"
                   onerror="this.style.display='none'" />
              ${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ''}
            </figure>` : '').join('')}
        </div>` : ''}

      ${a.briefLine ? `<div class="brief-line">📝 <strong>보고용 한 줄:</strong> ${esc(a.briefLine)}</div>` : ''}

      <div class="analysis-box">
        <div class="analysis-row">
          <span><strong>감정:</strong> <span class="${sentClass(sLbl)}">${esc(sLbl)}</span> (${a.sentiment?.score ?? 0})</span>
          <span><strong>대응 우선순위:</strong> ${priorityBadge(a.priority || '참고')}</span>
        </div>
        <div class="analysis-row"><strong>판단 근거:</strong> ${esc(reasons || '—')}</div>
        ${matchedPos.length || matchedNeg.length ? `
          <div class="analysis-row" style="font-size:9.5pt;">
            ${matchedPos.length ? `<span class="pos">긍정: ${matchedPos.map(esc).join(', ')}</span>` : ''}
            ${matchedPos.length && matchedNeg.length ? ' · ' : ''}
            ${matchedNeg.length ? `<span class="neg">부정: ${matchedNeg.map(esc).join(', ')}</span>` : ''}
          </div>` : ''}
        <div class="analysis-row"><strong>관련 부서:</strong> ${esc(depts || '—')}</div>
      </div>

      <div class="source-link">
        ${u
          ? `<strong>원문:</strong> <a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`
          : '<strong>원문 링크 없음</strong>'}
      </div>
    </section>`;
}

// ── 메인 보고서 HTML ───────────────────────────
export function renderReportHtml(report, opts = {}) {
  const {
    id, title = '법무부 언론보도 모니터링 일일보고',
    keywords = [], excludes = [], articles: rawArticles = [], generatedAt,
    trigger = 'manual',
    mediaCounts = {}, sentiment = {}, trending = [], groups = [],
    riskLevel = { level: '안정', reasons: [] },
    extractedCount = 0, extractionFailed = [],
    period, departmentCounts = {},
    briefingText = {},
    negativeIssues = [], positiveIssues = [], neutralIssues = [],
    actionRequired = [],
    summaryText = '',
    sourceCounts = {},
    includeImages = true,
  } = report;

  // excluded=true 기사는 모든 출력에서 자동 제외
  const articles = rawArticles.filter(a => !a.excluded && a.relevancePassed !== false);
  const total = articles.length;
  const periodLabel = period
    ? `${fmtDate(period.from)} ~ ${fmtDate(period.to)}`
    : '미설정';

  const mediaRows = Object.entries(mediaCounts).filter(([, v]) => v > 0)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}건</td></tr>`).join('');
  const deptRows  = Object.entries(departmentCounts)
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}건</td></tr>`).join('');
  const sourceRows = Object.entries(sourceCounts).map(([k, v]) =>
    `<tr><td>${k === 'google' ? '🌍 Google News' : k === 'naver' ? '🇰🇷 Naver News' : esc(k)}</td><td>${v}건</td></tr>`
  ).join('');

  // 목차
  const tocItems = articles.map((a, i) => `
    <li>${priorityBadge(a.priority || '참고')}
      <a href="#a${i + 1}">[${i + 1}] ${esc(a.title || '')}</a>
      <span class="src">[${esc(a.source || '')}]</span>
      <span class="${sentClass(a.sentiment?.label)}">· ${esc(a.sentiment?.label || '')}</span>
    </li>
  `).join('');

  // 기사 카드 섹션 (원문형)
  const bodySections = articles.map((a, i) => renderArticleCard(a, i, includeImages !== false)).join('');

  const riskBadgeHtml = riskLevel.level === '긴급'
    ? `<span class="riskUrgent">🚨 긴급</span>`
    : riskLevel.level === '주의'
    ? `<span class="riskCaution">⚠️ 주의</span>`
    : `<span class="riskOk">✅ 안정</span>`;

  // 한글 폰트 base64 inline @font-face 임베드 (Render Linux 호환)
  const fontFaceCss = getKoreanFontFaceCss();

  return /* html */ `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  ${fontFaceCss}
  @page { size: A4; margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: ${FONT_STACK_SANS}; color:#0d1117; line-height:1.6; font-size:10.5pt; }
  h1 { font-size: 22pt; margin: 0 0 4pt; }
  h2 { font-size: 14pt; margin: 16pt 0 6pt; padding-bottom:3pt; border-bottom:1.5pt solid #0d1117; page-break-after: avoid; }
  h3 { font-size: 12pt; margin: 10pt 0 4pt; page-break-after: avoid; }
  p  { margin: 6pt 0; }

  /* 표지 */
  .cover { page-break-after: always; padding-top: 30mm; text-align: center; }
  .cover .brand { font-size: 12pt; color: #888; }
  .cover .title { font-size: 24pt; font-weight: 700; margin: 14pt 0 6pt; }
  .cover .sub   { font-size: 13pt; color: #555; }
  .cover dl { margin-top: 28mm; display: inline-block; text-align: left; font-size: 11pt; line-height: 1.9; }
  .cover dt { display: inline-block; width: 110pt; color: #666; }
  .cover dd { display: inline; margin: 0; }
  .cover dl br { display: block; }

  .pill   { display:inline-block; padding:1pt 7pt; border:1pt solid #0d1117; border-radius:10pt; font-size:9.5pt; margin: 2pt 3pt 0 0; }
  .pillNeg { display:inline-block; padding:1pt 7pt; border:1pt solid #c53030; color:#c53030; border-radius:10pt; font-size:9.5pt; margin: 2pt 3pt 0 0; }

  table { width:100%; border-collapse: collapse; font-size:10pt; margin:6pt 0; }
  th, td { border-bottom: .5pt solid #ccc; padding: 4pt 6pt; vertical-align: top; text-align:left; }
  th { background:#f0ede8; }

  .briefing { background:#f8f6f2; border-left:3pt solid #0d1117; padding:10pt 14pt; margin:8pt 0; font-size:11pt; }
  .briefing h4 { margin: 6pt 0 2pt; font-size: 11pt; color:#0d1117; }
  .briefing p { margin: 2pt 0 6pt; }

  .alert  { background:#fff7ed; border:1pt solid #fdba74; color:#9a3412; padding:7pt 10pt; border-radius:4pt; margin:6pt 0; font-size:10pt; }
  .grp    { background:#fafaf6; border:.5pt solid #d5d0c8; border-radius:4pt; padding:7pt 10pt; margin-bottom:6pt; font-size:10pt; }

  .pos { color:#16a34a; font-weight:600; }
  .neg { color:#dc2626; font-weight:600; }
  .neu { color:#888; }

  .prio { display:inline-block; padding:1pt 7pt; border-radius:10pt; font-size:9pt; font-weight:600; margin-right:3pt; }
  .riskOk      { display:inline-block; padding:3pt 12pt; border-radius:14pt; background:#dcfce7; color:#166534; font-weight:700; }
  .riskCaution { display:inline-block; padding:3pt 12pt; border-radius:14pt; background:#fef3c7; color:#92400e; font-weight:700; }
  .riskUrgent  { display:inline-block; padding:3pt 12pt; border-radius:14pt; background:#fee2e2; color:#991b1b; font-weight:700; }

  .toc ol { padding-left: 18pt; }
  .toc li { margin-bottom: 3pt; font-size: 10pt; }
  .toc a  { color: #0d1117; text-decoration: none; }
  .toc .src { color: #888; font-size: 9.5pt; }

  .issuesBox { background:#fafaf6; border:.5pt solid #d5d0c8; border-radius:4pt; padding:8pt 12pt; margin: 4pt 0 8pt; }
  .issuesBox h3 { margin: 0 0 4pt; font-size: 11pt; }
  .issuesBox ol { padding-left: 18pt; margin: 0; }
  .issuesBox li { margin-bottom: 3pt; font-size: 10pt; }

  /* ── 기사 원문형(신문 페이지 풍) ── */
  .article {
    page-break-before: always;
    padding: 6mm 4mm 8mm;
  }
  /* 신문 한판: 매체명 — 큰 보더 — 큰 제목 — byline — 본문 */
  .article-source {
    display: flex; gap: 8pt; align-items: center;
    padding-bottom: 4pt;
    border-bottom: .5pt solid #999;
    font-size: 10pt; color: #555;
  }
  .article-source .src-name { font-weight: 700; color:#0d1117; font-size: 13pt; letter-spacing: -.3pt; }
  .article-source .src-tag,
  .article-source .src-provider { padding: 1pt 6pt; border: .5pt solid #d5d0c8; border-radius: 8pt; font-size: 9pt; color:#666; background:#f8f6f2; }

  .article-title {
    font-family: 'Noto Serif KR', 'Noto Sans KR', serif;
    font-size: 24pt;
    font-weight: 700;
    color: #0d1117;
    letter-spacing: -.5pt;
    line-height: 1.25;
    margin: 12pt 0 6pt;
    page-break-after: avoid;
  }
  .article-byline {
    display: flex; flex-wrap: wrap; gap: 8pt;
    font-size: 9.5pt; color: #555;
    padding: 5pt 0 6pt;
    border-bottom: 1.2pt solid #0d1117;
    margin-bottom: 10pt;
  }
  .article-byline .kw-tag    { background:#0d1117; color:white; padding: 1pt 7pt; border-radius: 8pt; font-size: 9pt; }
  .article-byline .issue-tag { background:#e0f2fe; color:#075985; padding: 1pt 7pt; border-radius: 8pt; font-size: 9pt; }

  .lead-fig { margin: 8pt 0 10pt; }
  .lead-fig img {
    width: 100%; max-height: 105mm; object-fit: cover;
    border: .5pt solid #ddd;
  }
  .lead-fig figcaption { font-size: 9pt; color:#666; margin-top: 4pt; padding-left: 4pt; border-left: 2pt solid #ccc; }

  /* 본문 — serif, 신문 가독성 */
  .article-body {
    font-family: 'Noto Serif KR', 'Noto Sans KR', serif;
    font-size: 11pt;
    line-height: 1.85;
    color:#1a1a1a;
    text-align: justify;
    word-break: keep-all;
  }
  .article-body p:first-of-type::first-letter {
    font-size: 1.4em; font-weight: 700; color: #0d1117;
  }
  .article-body p { margin: 7pt 0 9pt; text-indent: 0; }
  .article-body a { color:#2563eb; word-break: break-all; }
  .article-body img { max-width: 100%; height: auto; border-radius: 2pt; margin: 6pt 0; border: .5pt solid #ddd; }
  .article-body figure { margin: 6pt 0; }
  .article-body figcaption { font-size: 9pt; color:#777; }
  .article-body .missing { color:#dc2626; }
  .article-body .fallback-note { background:#fff7ed; border:1pt solid #fdba74; color:#9a3412;
                                  padding:6pt 10pt; border-radius:4pt; font-size:10pt; margin-bottom:6pt; }
  .article-body .screenshot-block {
    margin: 10pt 0 0; padding: 6pt 0; border-top: .5pt dashed #999;
    page-break-inside: avoid;
  }
  .article-body .screenshot-label { font-size: 9.5pt; color:#666; margin-bottom: 4pt; }
  .article-body .screenshot-block img {
    width: 100%; max-height: 220mm; object-fit: contain; border: .5pt solid #ddd;
    background: #fafafa;
  }

  .inline-imgs { display: flex; flex-wrap: wrap; gap: 6pt; margin: 6pt 0; }
  .inline-imgs .inline-fig { flex: 1 1 45%; max-width: 47%; margin: 0; }
  .inline-imgs img { width: 100%; max-height: 60mm; object-fit: cover; border-radius: 3pt; }
  .inline-imgs figcaption { font-size: 8.5pt; color:#777; margin-top: 2pt; }

  .brief-line {
    background: #f8f6f2; border-left: 2pt solid #0d1117;
    padding: 6pt 10pt; margin: 10pt 0 6pt;
    font-size: 10.5pt; line-height: 1.6;
  }

  .analysis-box {
    background: #fafaf6; border: .5pt solid #d5d0c8; border-radius: 4pt;
    padding: 8pt 12pt; margin: 8pt 0;
    page-break-inside: avoid;
  }
  .analysis-row { display: flex; flex-wrap: wrap; gap: 12pt; font-size: 10pt; padding: 2pt 0; }

  .source-link { font-size: 9.5pt; color: #555; margin-top: 6pt; word-break: break-all; }
  .source-link a { color: #2563eb; }

  .footer { margin-top: 22pt; color:#999; font-size:9.5pt; text-align:center; border-top:.5pt solid #ccc; padding-top:6pt; }
</style></head><body>

<div id="report-pdf-root">
  <!-- 표지 -->
  <section class="cover">
    <div class="brand">Trend Collector</div>
    <div class="title">${esc(title)}</div>
    <div class="sub">${esc(fmtDate(generatedAt))} 작성</div>
    <dl>
      <dt>📅 생성 일시</dt><dd>${esc(fmtKST(generatedAt))}</dd><br/>
      <dt>📆 수집 기간</dt><dd>${esc(periodLabel)} (${esc(period?.label || '-')})</dd><br/>
      <dt>🆔 보고서 ID</dt><dd>${esc(id || '')}</dd><br/>
      <dt>🔄 수집 모드</dt><dd>${trigger === 'scheduled' ? '예약 실행' : '수동 실행'}</dd><br/>
      <dt>🏷 검색 키워드</dt><dd>${keywords.map(esc).join(', ') || '—'}</dd><br/>
      <dt>🚫 제외 키워드</dt><dd>${excludes.map(esc).join(', ') || '—'}</dd><br/>
      <dt>📊 총 기사 수</dt><dd>${total}건 (본문 추출 ${extractedCount}/${total})</dd><br/>
      <dt>🚮 기간 외 제외</dt><dd>${period?.outOfRange || 0}건 · 날짜 파싱 실패 ${period?.parseFailed || 0}건</dd><br/>
      <dt>📌 위험 등급</dt><dd>${riskBadgeHtml}</dd>
    </dl>
  </section>

  <h2>📝 총평 및 주요 동향</h2>
  <div>${riskBadgeHtml} ${riskLevel.reasons?.length ? `<span style="color:#666; font-size:10pt;">사유: ${riskLevel.reasons.map(esc).join(' · ')}</span>` : ''}</div>
  <div class="briefing">
    ${briefingText.총평 ? `<h4>총평</h4><p>${esc(briefingText.총평)}</p>` : ''}
    ${briefingText.주요보도동향 ? `<h4>주요 보도 동향</h4><p>${esc(briefingText.주요보도동향)}</p>` : ''}
    ${briefingText.대응필요이슈 ? `<h4>대응 필요 이슈</h4><p>${esc(briefingText.대응필요이슈)}</p>` : ''}
    ${briefingText.관련부서참고사항 ? `<h4>관련 부서 참고사항</h4><p>${esc(briefingText.관련부서참고사항)}</p>` : ''}
    ${!briefingText.총평 && summaryText ? `<p>${esc(summaryText)}</p>` : ''}
  </div>

  ${trending.length ? `<div class="alert">📈 <strong>급상승 이슈</strong> — ${trending.slice(0, 5).map(t => `${esc(t.keyword)} (${t.prev}→${t.curr})`).join(', ')}</div>` : ''}

  ${negativeIssues.length ? `
  <div class="issuesBox">
    <h3>🔴 부정 이슈 TOP ${negativeIssues.length}</h3>
    <ol>${negativeIssues.map(a => `<li>${priorityBadge(a.priority)} <strong>${esc(a.title)}</strong> <span class="src">[${esc(a.source || '')}]</span> — 근거: ${esc((a.sentiment?.matchedKeywords?.negative || []).slice(0, 4).join(', '))}</li>`).join('')}</ol>
  </div>` : ''}
  ${positiveIssues.length ? `
  <div class="issuesBox">
    <h3>🟢 긍정 이슈 TOP ${positiveIssues.length}</h3>
    <ol>${positiveIssues.map(a => `<li><strong>${esc(a.title)}</strong> <span class="src">[${esc(a.source || '')}]</span> — 근거: ${esc((a.sentiment?.matchedKeywords?.positive || []).slice(0, 4).join(', '))}</li>`).join('')}</ol>
  </div>` : ''}

  <h2>📊 요약 통계</h2>
  <table>
    <tr><th style="width:30%">총 보도 건수</th><td>${total}건</td></tr>
    <tr><th>본문 추출</th><td>${extractedCount} / ${total} 성공</td></tr>
    <tr><th>키워드</th><td>${keywords.map(esc).join(', ') || '—'}</td></tr>
    <tr><th>감정 분석</th><td>긍정 ${sentiment.positive || 0}(${sentiment.positivePct || 0}%) · 부정 ${sentiment.negative || 0}(${sentiment.negativePct || 0}%) · 중립 ${sentiment.neutral || 0}(${sentiment.neutralPct || 0}%) — <strong>${esc(sentiment.overall || '')}</strong></td></tr>
    <tr><th>대응 필요</th><td>${actionRequired.length}건 (긴급 ${actionRequired.filter(a => a.priority === '긴급').length} / 주의 ${actionRequired.filter(a => a.priority === '주의').length})</td></tr>
  </table>

  <h2>📡 언론 유형별 건수</h2>
  <table>
    <tr><th style="width:30%">유형</th><th>건수</th></tr>
    ${mediaRows || '<tr><td colspan="2">—</td></tr>'}
  </table>

  ${sourceRows ? `
  <h2>🌐 뉴스 소스별 수집량</h2>
  <table>
    <tr><th style="width:50%">소스</th><th>건수</th></tr>
    ${sourceRows}
  </table>` : ''}

  ${deptRows ? `
  <h2>🏛 관련 부서별 보도량</h2>
  <table>
    <tr><th style="width:50%">부서</th><th>건수</th></tr>
    ${deptRows}
  </table>` : ''}

  ${groups.length ? `
    <h2>🧩 중복 묶기</h2>
    ${groups.slice(0, 8).map(g => `
      <div class="grp">
        <div><strong>${esc(g.leadTitle || '')}</strong> <span class="src">[${esc(g.leadSource || '')}]</span></div>
        <div class="src">관련 보도 ${g.count}건 · ${esc((g.sources || []).slice(0, 8).join(', '))}</div>
      </div>`).join('')}` : ''}

  <h2>📑 목차 (기사 ${total}건)</h2>
  <div class="toc"><ol>${tocItems}</ol></div>

  <!-- 기사 원문형 카드 섹션 -->
  ${bodySections}

  <!-- 부록 -->
  <h2 style="page-break-before: always;">📎 부록</h2>
  <h3>전체 기사 목록</h3>
  <table>
    <tr><th>#</th><th>우선순위</th><th>제목</th><th style="width:18%">언론사</th><th style="width:13%">유형</th><th style="width:8%">감정</th></tr>
    ${articles.map((a, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${priorityBadge(a.priority || '참고')}</td>
        <td>${safeUrl(a.url)
            ? `<a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${esc(a.title || '')}</a>`
            : esc(a.title || '')}</td>
        <td>${esc(a.source || '')}</td>
        <td>${esc(a.mediaType || '')}</td>
        <td class="${sentClass(a.sentiment?.label)}">${esc(a.sentiment?.label || '')}</td>
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

  <div class="footer">법무부 언론보도 모니터링 — 자동 생성 보고서 (내부 업무용 · 외부 공개 금지) · ${APP_NAME} v${getAppVersion()}</div>
</div>
</body></html>`;
}

// ── 메일 본문 (text) ────────────────────────────
export function renderReportText(report) {
  const { keywords = [], articles: rawArticles = [], generatedAt, briefingText = {}, sentiment = {}, mediaCounts = {}, riskLevel = {} } = report;
  const articles = rawArticles.filter(a => !a.excluded && a.relevancePassed !== false);
  const lines = [];
  lines.push(report.title || '법무부 언론보도 모니터링 일일보고');
  lines.push(`발행: ${fmtKST(generatedAt)} · 총 ${articles.length}건`);
  if (riskLevel.level) lines.push(`위험 등급: ${riskLevel.level}${riskLevel.reasons?.length ? ` (${riskLevel.reasons.join(', ')})` : ''}`);
  lines.push(`키워드: ${keywords.join(', ')}`);
  if (briefingText.총평) lines.push('', briefingText.총평);
  if (briefingText.주요보도동향) lines.push(briefingText.주요보도동향);
  if (briefingText.대응필요이슈) lines.push(briefingText.대응필요이슈);
  lines.push('');
  if (sentiment.total) {
    lines.push(`감정: 긍정 ${sentiment.positive}(${sentiment.positivePct}%) / 부정 ${sentiment.negative}(${sentiment.negativePct}%) / 중립 ${sentiment.neutral}(${sentiment.neutralPct}%) → ${sentiment.overall}`);
  }
  const mediaLine = Object.entries(mediaCounts).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(', ');
  if (mediaLine) lines.push(`매체: ${mediaLine}`);
  lines.push('='.repeat(50));
  lines.push('');
  articles.slice(0, 30).forEach((a, i) => {
    lines.push(`[${i + 1}] [${a.source || '미상'}] ${a.date || ''}  (${a.mediaType || ''}, ${a.sentiment?.label || ''}, ${a.priority || ''})`);
    lines.push(`    ${a.title || ''}`);
    if (a.briefLine) lines.push(`    📝 ${a.briefLine}`);
    if (a.url) lines.push(`    ${a.url}`);
    lines.push('');
  });
  return lines.join('\n');
}

// ── 메일 본문 (HTML) ────────────────────────────
export function renderReportEmailHtml(report, baseUrl) {
  const {
    keywords = [], articles: rawArticles = [], generatedAt, briefingText = {}, sentiment = {},
    mediaCounts = {}, trending = [], riskLevel = { level: '안정', reasons: [] },
  } = report;
  const articles = rawArticles.filter(a => !a.excluded && a.relevancePassed !== false);
  const top = articles.slice(0, 10);
  const previewLink  = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/reports/${encodeURIComponent(report.id)}/pdf/preview`  : '';
  const downloadLink = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/reports/${encodeURIComponent(report.id)}/pdf/download` : '';

  const sentLine = sentiment.total
    ? `긍정 ${sentiment.positive}(${sentiment.positivePct}%) · 부정 ${sentiment.negative}(${sentiment.negativePct}%) · 중립 ${sentiment.neutral}(${sentiment.neutralPct}%) — <b>${esc(sentiment.overall || '')}</b>`
    : '';
  const mediaLine = Object.entries(mediaCounts).filter(([, v]) => v > 0).map(([k, v]) => `${esc(k)} ${v}`).join(' · ');
  const riskBadge = riskLevel.level === '긴급'
    ? `<span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:10px; font-weight:700;">🚨 긴급</span>`
    : riskLevel.level === '주의'
    ? `<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:10px; font-weight:700;">⚠️ 주의</span>`
    : `<span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:10px; font-weight:700;">✅ 안정</span>`;

  return /* html */ `<!doctype html>
<html><body style="font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif; color:#222; line-height:1.6;">
  <h2 style="margin:0 0 6px;">📰 ${esc(report.title || '법무부 언론보도 모니터링 일일보고')}</h2>
  <div style="color:#666; font-size: 13px; margin-bottom: 12px;">
    📅 ${esc(fmtKST(generatedAt))} · 총 ${articles.length}건 · 키워드: ${keywords.map(esc).join(', ')}
  </div>
  <div style="margin: 8px 0;">위험 등급 ${riskBadge}${riskLevel.reasons?.length ? ` <span style="color:#666; font-size:12px;">(${riskLevel.reasons.map(esc).join(', ')})</span>` : ''}</div>
  ${briefingText.총평 ? `<div style="background:#f8f6f2; border-left:3px solid #0d1117; padding:10px 14px; margin:10px 0; font-size:14px;">📝 ${esc(briefingText.총평)}<br/><br/>${esc(briefingText.주요보도동향 || '')}<br/><br/><strong>${esc(briefingText.대응필요이슈 || '')}</strong></div>` : ''}
  ${trending.length ? `<div style="background:#fff7ed; border:1px solid #fdba74; color:#9a3412; padding:8px 12px; border-radius:6px; margin:10px 0; font-size:13px;">📈 <b>급상승</b>: ${trending.slice(0, 5).map(t => `${esc(t.keyword)} (${t.prev}→${t.curr})`).join(', ')}</div>` : ''}
  ${sentLine ? `<div style="font-size:13px; color:#444; margin: 8px 0;">감정: ${sentLine}</div>` : ''}
  ${mediaLine ? `<div style="font-size:13px; color:#444; margin: 8px 0;">매체: ${mediaLine}</div>` : ''}
  <div style="margin: 14px 0;">
    ${downloadLink ? `<a href="${esc(downloadLink)}" style="color:#2563eb; margin-right:14px;" target="_blank" rel="noopener noreferrer">→ PDF 다운로드</a>` : ''}
    ${previewLink ? `<a href="${esc(previewLink)}" style="color:#2563eb;" target="_blank" rel="noopener noreferrer">→ PDF 미리보기</a>` : ''}
  </div>

  <h3 style="font-size:14px; margin:18px 0 6px;">주요 이슈 TOP ${top.length}</h3>
  <ol style="padding-left: 20px;">
    ${top.map(a => `
      <li style="margin-bottom:8px;">
        <div>${safeUrl(a.url)
            ? `<a href="${esc(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer" style="color:#0d1117; text-decoration:none;"><b>${esc(a.title || '')}</b></a>`
            : `<b>${esc(a.title || '')}</b>`}</div>
        <div style="color:#666; font-size: 12px;">[${esc(a.source || '')}] ${esc(a.date || '')} · #${esc(a.keyword || '')} · ${esc(a.mediaType || '')} · ${esc(a.sentiment?.label || '')} · ${esc(a.priority || '')}</div>
        ${a.briefLine ? `<div style="color:#0d1117; font-size:12px; margin-top:3px;">📝 ${esc(a.briefLine)}</div>` : ''}
      </li>`).join('')}
  </ol>
  <hr/>
  <div style="color:#999; font-size: 11px;">법무부 언론보도 모니터링 — 자동 생성 메일 · 내부 업무용</div>
</body></html>`;
}
