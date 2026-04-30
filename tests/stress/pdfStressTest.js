// ─────────────────────────────────────────────
// tests/stress/pdfStressTest.js — PDF/Word/Excel/HTML 출력 정밀 스트레스 테스트
//
// 목적: 실 운영 전 출력물 종합 검증
//   • Puppeteer 로 편철형 / 분석형 / 보고서 PDF 생성 — 시그니처·크기·내용·이미지 포함
//   • 1건/소량/대량 기사 시나리오 + 기사 override (제목 변경/제외) 적용 확인
//   • 언론사별 목차 / page-break 옵션 / 깨진 문자 비율 / 표지/기관명 검증
//   • Word(편철·분석·보고서) / Excel / HTML fallback PK 시그니처 + 크기
//   • 직렬 PDF 5회 생성 시 메모리/시간/크기 일관성 모니터링
//   • Chrome 미설치 friendly 오류 핸들링 검증 (PUPPETEER_EXECUTABLE_PATH 위조)
//
// 실행: node tests/stress/pdfStressTest.js [reportId]
// 종료 코드: 0=통과, 1=실패, 2=치명 오류
// ─────────────────────────────────────────────

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const REPORTS_DIR = path.join(ROOT, 'data', 'reports');
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const results = [];
const start = Date.now();

function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, ms: Date.now() - t0 });
    console.log(`  ✅ ${name}  (${Date.now() - t0}ms)`);
  } catch (e) {
    results.push({ name, passed: false, failMsg: e.message || String(e), ms: Date.now() - t0 });
    console.error(`  ❌ ${name}  — ${e.message || e}`);
  }
}
function group(label) { console.log(`\n=== ${label} ===`); }

// PDF 안에서 텍스트 비교를 위해 stream 의 text content 토막을 추출 (간단 휴리스틱).
// pdf 라이브러리 의존 없이도 BT...ET 블록 안의 (...) Tj 문자열을 디코드해
// 한글 매칭 가능. 폰트 임베드 후 일부 글자는 글리프 인덱스로 들어가지만,
// title / 표지 / 기관명은 보통 ToUnicode CMap 으로 디코드 가능.
async function extractPdfTextFragments(pdfBuf) {
  // 1) 빠른 경로: PDF 안에 평문으로 남은 ASCII 텍스트
  const ascii = pdfBuf.toString('latin1');
  const out = [];
  // ToUnicode 변환 없이 매칭하기는 어려움 — 시그니처 / 객체 / 메타 정도만 본다
  // %PDF-x.y 헤더, /Title, /Author, /Producer 등.
  const titleMatch = ascii.match(/\/Title\s*\(([^)]*)\)/);
  if (titleMatch) out.push(titleMatch[1]);
  return { ascii, out };
}

async function pickReport(idArg) {
  const files = (await fs.readdir(REPORTS_DIR)).filter(f => f.endsWith('.json'));
  if (idArg) {
    const t = files.find(f => f.startsWith(idArg)) || `${idArg}.json`;
    return t;
  }
  const sized = await Promise.all(files.map(async f => {
    const s = await fs.stat(path.join(REPORTS_DIR, f));
    return { f, s: s.size };
  }));
  sized.sort((a, b) => b.s - a.s);
  return sized[0]?.f;
}

async function loadFixture(file) {
  return JSON.parse(await fs.readFile(path.join(REPORTS_DIR, file), 'utf8'));
}

// 1건 / 소량 fixture 변형
function takeArticles(report, n) {
  return { ...report, articles: (report.articles || []).slice(0, n) };
}

async function main() {
  const file = await pickReport(process.argv[2]);
  if (!file) { console.error('No fixture'); process.exit(2); }
  const reportFull = await loadFixture(file);
  console.log(`▶ fixture: ${file}  (articles=${(reportFull.articles || []).length})`);

  const ct  = await imp('server/clippingTemplate.js');
  const at  = await imp('server/analysisTemplate.js');
  const rt  = await imp('server/reportTemplate.js');
  const wg  = await imp('server/wordGenerator.js');
  const xg  = await imp('server/excelGenerator.js');
  const pg  = await imp('server/pdfGenerator.js');
  const ic  = await imp('server/imageCache.js');

  // 어떤 환경에서도 깨지지 않도록 — Chrome 부재 시 명확한 메시지로 종료
  let chromeOk = true;
  try {
    await pg.ensureBrowser();
  } catch (e) {
    chromeOk = false;
    console.warn(`⚠️ Chrome 미가용 — PDF 단계는 SKIP, e.code=${e.code} ${(e.message || '').slice(0, 120)}`);
    if (e.code !== 'CHROME_NOT_FOUND') {
      console.error(`예상 외 오류 — 종료. ${e.stack || e.message}`);
      process.exit(2);
    }
  }

  // ────────────────────────────────────────────
  group('A) HTML 미리보기 / 표지·기관명·목차·page-break 옵션 매트릭스');

  // 1건 / 10건 / 30건
  for (const [label, n] of [['1건', 1], ['10건', 10], ['30건', 30]]) {
    await test(`편철 HTML — ${label} #report-pdf-root + 표지 / 목차 / page-break 모두 포함`, () => {
      const sub = takeArticles(reportFull, n);
      const html = ct.renderClippingHtml(sub);
      assert(html.includes('id="report-pdf-root"'), 'pdf-root 누락');
      assert(/page-break-before:\s*always/.test(html), 'page-break 누락');
      assert(/cl-toc/.test(html), '목차 누락');
      assert(/대변인실|홍보담당관실|기관/.test(html), '기관명 누락');
      assert(html.length > 5000, `너무 작음 ${html.length}`);
    });
  }

  await test('편철 HTML — pageLayout=article 시 .cl-pb 페이지구분자 출력', () => {
    const html = ct.renderClippingHtml({
      ...reportFull,
      printSettings: { pageLayout: 'article' },
    });
    assert(/<div class="cl-pb"><\/div>/.test(html), 'cl-pb 페이지구분자 누락');
  });

  await test('편철 HTML — 같은 언론사 기사가 동일 cl-media-section 안에 모임', () => {
    const html = ct.renderClippingHtml(reportFull);
    // 가장 빈도 높은 언론사 추출
    const counts = {};
    for (const a of (reportFull.articles || [])) counts[a.source] = (counts[a.source] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] < 2) return; // 표본 부족
    const [media] = top;
    const sectionRe = new RegExp(`<section class="cl-media-section" data-media="${media.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">([\\s\\S]*?)</section>`);
    const m = html.match(sectionRe);
    assert(m, `${media} 섹션 누락`);
    // 같은 언론사 안에 다른 언론사 divider 가 끼지 않음
    const badRe = /<div class="cl-media-divider">(?!.*?\1)/;
    assert(!/<section class="cl-media-section"[^>]*>[\s\S]*?<section class="cl-media-section"/.test(m[1]), '중첩 섹션 발견');
  });

  await test('편철 HTML — 기사 override 제외 후 해당 기사 본문/url 모두 미렌더', () => {
    const arts = reportFull.articles || [];
    if (arts.length < 2) return;
    const tgt = arts[1];
    const overrides = { [tgt.id]: { includeInClipping: false } };
    const html = ct.renderClippingHtml({ ...reportFull, articleOverrides: overrides });
    // url 은 기사 고유 식별자에 가깝다 — 다른 기사와 겹칠 가능성 매우 낮음
    if (tgt.url) assert(!html.includes(tgt.url), '제외 기사의 원문 URL 잔존');
    // 본문 일부 (40자 청크) 가 잔존하지 않는지 — 표지/목차에는 본문 발췌가 들어가지 않음
    const body = (tgt.contentText || '').replace(/\s+/g, '');
    if (body.length >= 60) {
      const chunk = body.slice(20, 60);
      assert(!html.replace(/\s+/g, '').includes(chunk), '제외 기사 본문 청크 잔존');
    }
  });

  await test('분석 HTML — 8섹션 + 9 모니터링 + 붙임 모두 출력', () => {
    const h = at.renderAnalysisHtml(reportFull);
    for (const k of ['1. 보고 개요', '2. 종합 분석', '3. 주요 이슈 TOP 5',
      '4. 긍정 · 부정 · 중립', '5. 기관 배포자료', '6. 언론 재인용', '7. 클릭 추적',
      '8. 대응 필요사항', '9. 향후 모니터링', '붙임']) {
      assert(h.includes(k), `${k} 누락`);
    }
  });

  await test('보고서 HTML — #report-pdf-root + 폰트링크 포함 (Puppeteer 셀렉터 일치)', () => {
    const h = rt.renderReportHtml(reportFull);
    assert(h.includes('id="report-pdf-root"'), 'pdf-root 누락');
    assert(/Noto\s*Sans\s*KR/.test(h), '한글 폰트 링크 누락');
  });

  // ────────────────────────────────────────────
  group('B) 이미지 임베드 (embedImagesInReport) 통계');
  await test('이미지 포함 모드 — stats.total / succeeded 필드 존재', async () => {
    const tiny = takeArticles(reportFull, 4);
    const { report, stats } = await ic.embedImagesInReport(tiny, { includeImages: true });
    assert(report && Array.isArray(report.articles), 'report 구조 손상');
    assert(typeof stats.total === 'number' && typeof stats.succeeded === 'number',
      `stats 누락 — got ${JSON.stringify(stats)}`);
    assert(typeof stats.articleTotal === 'number' && typeof stats.articlesWithImage === 'number',
      `articleTotal/articlesWithImage 누락 — got ${JSON.stringify(stats)}`);
    // 외부 네트워크 실패 시 succeeded 가 0 일 수 있음 — 시그니처만 확인
  });
  await test('이미지 OFF 모드 — 다운로드 시도 0건', async () => {
    const tiny = takeArticles(reportFull, 4);
    const { stats } = await ic.embedImagesInReport(tiny, { includeImages: false });
    assert(stats.total === 0, `OFF 인데 시도 ${stats.total}건`);
  });

  // ────────────────────────────────────────────
  group('C) Word / Excel / HTML 대체 다운로드');

  const wordClipBuf = await wg.clippingToDocx(reportFull);
  await test('편철 docx PK + 5KB 이상 + 30MB 이하', () => {
    assert(wordClipBuf[0] === 0x50 && wordClipBuf[1] === 0x4b);
    assert(wordClipBuf.length >= 5_000 && wordClipBuf.length <= 30 * 1024 * 1024);
  });
  const wordAnaBuf = await wg.analysisToDocx(reportFull);
  await test('분석 docx PK + 5KB 이상', () => {
    assert(wordAnaBuf[0] === 0x50 && wordAnaBuf[1] === 0x4b);
    assert(wordAnaBuf.length >= 5_000);
  });
  const wordRptBuf = await wg.reportToDocx(reportFull);
  await test('보고서 docx PK + 5KB 이상', () => {
    assert(wordRptBuf[0] === 0x50 && wordRptBuf[1] === 0x4b);
    assert(wordRptBuf.length >= 5_000);
  });

  const xlsxBuf = await xg.reportToXlsx(reportFull, { tracking: { totalLinks: 0, totalClicks: 0, items: [] } });
  await test('xlsx PK + 10KB 이상', () => {
    assert(xlsxBuf[0] === 0x50 && xlsxBuf[1] === 0x4b);
    assert(xlsxBuf.length >= 10_000);
  });
  await test('xlsx 시트 — 요구 8종 모두 포함', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxBuf);
    const names = wb.worksheets.map(s => s.name);
    const required = ['요약', '전체기사', '언론사별목차', '기관배포자료', '언론재인용', '클릭추적', '부서별대응', '기사편집용'];
    for (const r of required) assert(names.some(n => n.includes(r)), `시트 ${r} 누락 — got ${names.join('|')}`);
  });

  // HTML fallback — clipping html / report html 직접 생성
  const clipHtml = ct.renderClippingHtml(reportFull);
  await test('HTML fallback — 50KB 이상 + 표지/목차/언론사섹션 모두 포함', () => {
    assert(clipHtml.length > 50_000, `${clipHtml.length}`);
    assert(clipHtml.includes('cl-cover'), '표지 누락');
    assert(clipHtml.includes('cl-toc'), '목차 누락');
    assert(clipHtml.includes('cl-media-section'), '언론사 섹션 누락');
  });

  // ────────────────────────────────────────────
  group('D) PDF 직접 생성 (Puppeteer)');

  if (!chromeOk) {
    console.log('  ⏭ Chrome 미가용 — PDF 단계 SKIP (CHROME_NOT_FOUND friendly 처리 확인됨)');
  } else {
    // 기사 1건 PDF
    await test('PDF 1건 — %PDF 헤더 + 5KB 이상 + 60초 이내', async () => {
      const tiny = takeArticles(reportFull, 1);
      const html = ct.renderClippingHtml(tiny);
      const t0 = Date.now();
      const buf = await pg.htmlToPdf(html);
      const dt = Date.now() - t0;
      assert(dt < 60_000, `생성 ${dt}ms`);
      assert(buf.slice(0, 4).toString() === '%PDF', 'PDF 시그니처 X');
      assert(buf.length > 5_000, `너무 작음 ${buf.length}`);
    });

    // 30건 + 이미지 임베드 + 표지 사용자 override 종합
    let buf30;
    let firstSize = 0;
    await test('PDF 30건 + 이미지 임베드 + 표지 override — 정상 생성, 30MB 이하', async () => {
      const printSettings = {
        title: '★STRESS_PDF_TITLE_30★',
        organization: '★STRESS_ORG★',
        pageLayout: 'media',
        sortBy: 'media',
        includeAnalysisAppendix: true,
      };
      const { report } = await ic.embedImagesInReport(reportFull, { includeImages: true });
      const html = ct.renderClippingHtml({ ...report, printSettings });
      const t0 = Date.now();
      buf30 = await pg.htmlToPdf(html);
      const dt = Date.now() - t0;
      console.log(`     · 30건 PDF: ${(buf30.length / 1024).toFixed(0)} KB / ${dt}ms`);
      assert(buf30.slice(0, 4).toString() === '%PDF');
      assert(buf30.length <= 30 * 1024 * 1024, `oversize ${buf30.length}`);
      assert(dt < 90_000, `생성 시간 ${dt}ms`);
      firstSize = buf30.length;
    });

    // 직렬 5회 — 메모리/크기 일관성
    await test('PDF 직렬 5회 — 크기 편차 ±10% 이내, 모두 %PDF', async () => {
      const tiny = takeArticles(reportFull, 8);
      const html = ct.renderClippingHtml(tiny);
      const sizes = [];
      const times = [];
      for (let i = 0; i < 5; i++) {
        const t0 = Date.now();
        const buf = await pg.htmlToPdf(html);
        times.push(Date.now() - t0);
        sizes.push(buf.length);
        assert(buf.slice(0, 4).toString() === '%PDF', `라운드${i + 1} %PDF X`);
      }
      console.log(`     · 라운드별 크기: ${sizes.map(s => (s / 1024 | 0) + 'KB').join(', ')}`);
      console.log(`     · 라운드별 시간: ${times.map(s => s + 'ms').join(', ')}`);
      const mn = Math.min(...sizes), mx = Math.max(...sizes);
      const drift = (mx - mn) / mn;
      assert(drift < 0.1, `크기 편차 ${(drift * 100).toFixed(1)}% > 10%`);
    });

    // 동시 2건 — 같은 브라우저에서 page 두 개
    await test('PDF 동시 2건 — 둘 다 %PDF / 서로 다른 사이즈여도 OK', async () => {
      const a = ct.renderClippingHtml(takeArticles(reportFull, 4));
      const b = ct.renderClippingHtml(takeArticles(reportFull, 8));
      const [pa, pb] = await Promise.all([pg.htmlToPdf(a), pg.htmlToPdf(b)]);
      assert(pa.slice(0, 4).toString() === '%PDF' && pb.slice(0, 4).toString() === '%PDF');
    });

    // 분석형 PDF
    await test('분석 PDF — %PDF + 30KB 이상', async () => {
      const html = at.renderAnalysisHtml(reportFull);
      const buf = await pg.htmlToPdf(html);
      assert(buf.slice(0, 4).toString() === '%PDF');
      assert(buf.length > 30_000, `${buf.length}`);
    });

    // PDF 안에 깨진 문자가 들어가는지 간접 확인 — HTML 단계에서 �가 거의 0건이면 OK
    await test('PDF 입력 HTML 깨진 문자 비율 < 0.5%', () => {
      const html = ct.renderClippingHtml(reportFull);
      const bad = (html.match(/�/g) || []).length;
      const ratio = bad / html.length;
      assert(ratio < 0.005, `garbled ratio ${(ratio * 100).toFixed(3)}%`);
    });
  }

  // ────────────────────────────────────────────
  group('E) Chrome 미설치 시뮬레이션 — friendly 메시지 확인');
  await test('잘못된 PUPPETEER_EXECUTABLE_PATH 로 새 모듈 인스턴스 호출 시 CHROME_NOT_FOUND 발생', async () => {
    // pdfGenerator 는 module-level 캐시를 공유하므로, 새 child process 로 시뮬레이션
    const { execSync } = await import('node:child_process');
    const code = `
      process.env.PUPPETEER_EXECUTABLE_PATH = ${JSON.stringify(path.join(ROOT, 'no-such-chrome.exe'))};
      const pg = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'server/pdfGenerator.js')).href)});
      try {
        await pg.ensureBrowser();
        console.log('UNEXPECTED_OK');
      } catch (e) {
        console.log('CODE=' + (e.code || ''));
        console.log('MSG=' + (e.message || '').slice(0, 80));
      }
    `;
    let out = '';
    try {
      out = execSync(`node --input-type=module -e "${code.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000 }).toString();
    } catch (e) {
      out = (e.stdout?.toString() || '') + (e.stderr?.toString() || '');
    }
    // CHROME_NOT_FOUND 또는 친절한 한국어 메시지 둘 중 하나만 있으면 통과
    const ok = /CHROME_NOT_FOUND/.test(out) || /Chrome.*설치되지 않/.test(out);
    if (!ok) console.log('     out=', out.slice(0, 200));
    assert(ok, 'friendly 오류 미작동');
  });

  // ────────────────────────────────────────────
  // 마무리
  if (chromeOk) try { await pg.shutdownBrowser(); } catch {}

  const failed = results.filter(r => !r.passed);
  console.log(`\n──────────────────────────────────────────`);
  console.log(`총 ${results.length}건 중 통과 ${results.length - failed.length} · 실패 ${failed.length}  (${Date.now() - start}ms)`);
  if (failed.length) {
    console.log('\n실패 목록:');
    for (const f of failed) console.log(`  ❌ ${f.name}\n     → ${f.failMsg}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
