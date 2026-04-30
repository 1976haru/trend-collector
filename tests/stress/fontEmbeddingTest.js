// ─────────────────────────────────────────────
// tests/stress/fontEmbeddingTest.js — PDF 한글 폰트 임베드 검증
//
// 폰트 모듈 / 템플릿 / 실제 PDF 안에 Noto KR 폰트가 정상 임베드되는지 검증.
// Render Linux 환경 시뮬레이션은 안 하지만, 임베드된 woff2 base64 가 PDF
// 안에서 ToUnicode + FontFile2 로 변환되는지를 직접 확인한다.
// ─────────────────────────────────────────────

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
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

async function main() {
  const fonts = await imp('server/fonts.js');
  const ct    = await imp('server/clippingTemplate.js');
  const at    = await imp('server/analysisTemplate.js');
  const rt    = await imp('server/reportTemplate.js');

  // ────────────────────────────────────────────
  group('1) fonts 모듈 — 4 weights base64 캐시');
  await test('Noto Sans KR 400/700 + Noto Serif KR 400/700 모두 로드', () => {
    const status = fonts.getFontStatus();
    assert(status.loaded === true);
    assert(status.weightsLoaded === 4, `loaded=${status.weightsLoaded}`);
    assert(status.weightsTotal === 4);
    assert(status.loadedFamilies.includes('Noto Sans KR'));
    assert(status.loadedFamilies.includes('Noto Serif KR'));
    assert(status.missing.length === 0, `missing=${JSON.stringify(status.missing)}`);
    assert(status.totalSizeKB > 3000, `base64 size 너무 작음: ${status.totalSizeKB} KB`);
  });
  await test('getKoreanFontFaceCss — @font-face 4건 + woff2 base64 4건', () => {
    const css = fonts.getKoreanFontFaceCss();
    const fontFaceCount = (css.match(/@font-face/g) || []).length;
    const base64Count   = (css.match(/font\/woff2;base64,/g) || []).length;
    assert(fontFaceCount === 4, `@font-face 개수 ${fontFaceCount}`);
    assert(base64Count === 4, `woff2 base64 개수 ${base64Count}`);
    // 한글 family 정확 매칭
    assert(/font-family:\s*'Noto Sans KR'/.test(css));
    assert(/font-family:\s*'Noto Serif KR'/.test(css));
  });
  await test('FONT_STACK_SANS / FONT_STACK_SERIF — 한글 fallback 체인 정의', () => {
    assert(/'Noto Sans KR'/.test(fonts.FONT_STACK_SANS));
    assert(/'Malgun Gothic'/.test(fonts.FONT_STACK_SANS));
    assert(/'Noto Serif KR'/.test(fonts.FONT_STACK_SERIF));
    assert(/'Batang'/.test(fonts.FONT_STACK_SERIF));
  });
  await test('detectGarbledRatio — � / □ 비율 계산', () => {
    assert(fonts.detectGarbledRatio('정상 텍스트') === 0);
    assert(fonts.detectGarbledRatio('�AB') === 1/3);
    assert(fonts.detectGarbledRatio('□□AB') === 0.5);
    assert(fonts.detectGarbledRatio('') === 0);
  });

  // ────────────────────────────────────────────
  group('2) 템플릿 — @font-face inline 임베드 확인');
  // 빈 보고서 fixture
  const emptyReport = { id: 'test', title: '법무부 언론보도', generatedAt: new Date().toISOString(),
    keywords: ['보호관찰'], articles: [], sentiment: { total: 0, positive: 0, negative: 0, neutral: 0, overall: '중립' } };

  await test('편철형 HTML — @font-face base64 임베드', () => {
    const html = ct.renderClippingHtml(emptyReport);
    assert(html.includes('@font-face'), '@font-face 누락');
    assert(html.includes("data:font/woff2;base64,"), 'base64 woff2 누락');
    assert(html.includes("'Noto Serif KR'"), 'Serif family 누락');
    // 외부 Google Fonts CDN 의존 제거 확인
    assert(!html.includes('fonts.googleapis.com'), '외부 Google Fonts 잔존 — 제거 실패');
    assert(!html.includes('fonts.gstatic.com'), '외부 Gstatic 잔존');
  });
  await test('분석형 HTML — @font-face base64 임베드', () => {
    const html = at.renderAnalysisHtml(emptyReport);
    assert(html.includes('@font-face'));
    assert(html.includes("data:font/woff2;base64,"));
    assert(html.includes("'Noto Sans KR'"));
    assert(!html.includes('fonts.googleapis.com'));
  });
  await test('보고서 HTML — @font-face base64 임베드', () => {
    const html = rt.renderReportHtml(emptyReport);
    assert(html.includes('@font-face'));
    assert(html.includes("data:font/woff2;base64,"));
    assert(!html.includes('fonts.googleapis.com'));
  });
  await test('fast 모드도 동일하게 base64 임베드 (외부 CDN 의존 X, 한글 깨짐 방어 우선)', () => {
    const html = ct.renderClippingHtml(emptyReport, { fast: true });
    assert(html.includes('@font-face'));
    assert(html.includes("data:font/woff2;base64,"));
    assert(!html.includes('fonts.googleapis.com'));
  });

  // ────────────────────────────────────────────
  group('3) 실제 PDF 생성 — Noto KR 폰트 임베드 검증');
  const pg = await imp('server/pdfGenerator.js');

  // fixture
  const REPORTS_DIR = path.join(ROOT, 'data', 'reports');
  const files = (await fs.readdir(REPORTS_DIR)).filter(f => f.endsWith('.json'));
  const fixture = files.length ? JSON.parse(await fs.readFile(path.join(REPORTS_DIR, files[0]), 'utf8')) : emptyReport;

  let cleanupDone = false;
  try {
    await test('편철형 PDF — Noto KR 임베드 + ToUnicode CMap + FontFile2', async () => {
      const tiny = { ...fixture, articles: (fixture.articles || []).slice(0, 2) };
      const html = ct.renderClippingHtml(tiny);
      const pdf  = await pg.htmlToPdf(html, { reportId: 'fonttest-clip', mode: 'default' });
      assert(pdf.slice(0, 4).toString() === '%PDF');
      const ascii = pdf.toString('latin1');
      assert(/Noto.{0,20}KR/i.test(ascii),  'PDF 안에 Noto KR 폰트 표기 누락');
      assert(/ToUnicode/.test(ascii),       'PDF 안에 ToUnicode CMap 누락 (한글 매핑 X)');
      assert(/FontFile2|FontFile3/.test(ascii), 'PDF 안에 FontFile2 누락 (TrueType 임베드 X)');
    });
    await test('분석형 PDF — Noto KR 임베드 + Sans 글리프', async () => {
      const html = at.renderAnalysisHtml(fixture);
      const pdf  = await pg.htmlToPdf(html, { reportId: 'fonttest-ana', mode: 'default' });
      const ascii = pdf.toString('latin1');
      assert(/Noto.{0,20}KR/i.test(ascii));
      assert(/FontFile2|FontFile3/.test(ascii));
    });
    await test('보고서 PDF — Noto KR 임베드', async () => {
      const html = rt.renderReportHtml(fixture);
      const pdf  = await pg.htmlToPdf(html, { reportId: 'fonttest-rep', mode: 'default' });
      const ascii = pdf.toString('latin1');
      assert(/Noto.{0,20}KR/i.test(ascii));
      assert(/FontFile2|FontFile3/.test(ascii));
    });
  } finally {
    cleanupDone = true;
    try { await pg.shutdownBrowser(); } catch {}
  }

  // ────────────────────────────────────────────
  const failed = results.filter(r => !r.passed);
  console.log(`\n──────────────────────────────────────────`);
  console.log(`총 ${results.length}건 중 통과 ${results.length - failed.length} · 실패 ${failed.length}  (${Date.now() - start}ms)`);
  if (failed.length) {
    for (const f of failed) console.log(`  ❌ ${f.name}\n     → ${f.failMsg}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
