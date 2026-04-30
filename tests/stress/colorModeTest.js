// ─────────────────────────────────────────────
// tests/stress/colorModeTest.js — 편철형 / 분석형 색상 모드 검증
// ─────────────────────────────────────────────

import path from 'node:path';
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

const tinyReport = {
  id: 'cm-test', title: '법무부 언론보도 모니터링', generatedAt: new Date().toISOString(),
  keywords: ['보호관찰'],
  articles: [{
    id: 'a1', keyword: '보호관찰', title: '보호관찰 강화 종합대책',
    source: '법무부', mediaType: '정부/공공기관', date: '2026-05-01',
    url: 'https://example.com/a1', extracted: true,
    contentText: '보호관찰 인력 증원 추진. 법무부는 5월부터 시범 운영.',
    images: [{ url: 'https://example.com/img.jpg' }],
    sentiment: { label: '중립', score: 0, matchedKeywords: { positive: [], negative: [] } },
    articleSource: 'agency', priority: '참고',
  }],
  sentiment: { total: 1, positive: 0, negative: 0, neutral: 1, overall: '중립' },
};

async function main() {
  const ct  = await imp('server/clippingTemplate.js');
  const at  = await imp('server/analysisTemplate.js');
  const cp  = await imp('server/clippingPresets.js');

  // ────────────────────────────────────────────
  group('1) 기본값 — colorMode=bw');
  await test('defaultPrintSettings.colorMode === "bw"', () => {
    const s = cp.defaultPrintSettings(tinyReport);
    assert(s.colorMode === 'bw', `got ${s.colorMode}`);
  });

  // ────────────────────────────────────────────
  group('2) 편철 HTML — body class 분기');
  await test('colorMode 미지정 (기본) → body class clipping-bw', () => {
    const html = ct.renderClippingHtml(tinyReport);
    assert(/<body class="clipping-bw"/.test(html), 'clipping-bw class 누락');
  });
  await test('colorMode="color-images" → body class clipping-color-images', () => {
    const html = ct.renderClippingHtml({ ...tinyReport, printSettings: { colorMode: 'color-images' }});
    assert(/<body class="clipping-color-images"/.test(html));
  });
  await test('colorMode="full-color" → body class clipping-full-color', () => {
    const html = ct.renderClippingHtml({ ...tinyReport, printSettings: { colorMode: 'full-color' }});
    assert(/<body class="clipping-full-color"/.test(html));
  });
  await test('알 수 없는 colorMode → 안전하게 bw 로 fallback', () => {
    const html = ct.renderClippingHtml({ ...tinyReport, printSettings: { colorMode: 'rainbow' }});
    assert(/<body class="clipping-bw"/.test(html));
  });

  // ────────────────────────────────────────────
  group('3) 편철 CSS — grayscale filter 분기');
  await test('CSS — bw 모드만 grayscale 적용 (img 직접 적용 X)', () => {
    const html = ct.renderClippingHtml(tinyReport);
    // 이전: .cl-art-lead img { filter: grayscale(100%) ... } 직접 적용
    // 신규: body.clipping-bw .cl-art-lead img { filter: grayscale ... }
    assert(/body\.clipping-bw[^{]*img[^{]*\{[^}]*grayscale\(100%\)/.test(html),
      'body.clipping-bw 안에 grayscale 규칙 누락');
    // .cl-art-lead img 자체 (body class 없는) 에는 grayscale 직접 안 걸려야 함
    const leadImgRule = html.match(/\.cl-art-lead img\s*\{[^}]+\}/);
    assert(leadImgRule && !/grayscale/.test(leadImgRule[0]),
      `.cl-art-lead img 에 grayscale 직접 적용됨 (color-images 모드에서 컬러 X): ${leadImgRule?.[0]}`);
  });
  await test('CSS — color-images / full-color 에는 filter:none 명시', () => {
    const html = ct.renderClippingHtml(tinyReport);
    assert(/body\.clipping-color-images[^{]*img[^{]*\{[^}]*filter:\s*none/.test(html),
      'color-images 에 filter:none 누락');
    assert(/body\.clipping-full-color[^{]*img[^{]*\{[^}]*filter:\s*none/.test(html),
      'full-color 에 filter:none 누락');
  });
  await test('CSS — @media print 색상 강제 (-webkit-print-color-adjust: exact)', () => {
    const html = ct.renderClippingHtml(tinyReport);
    assert(/print-color-adjust:\s*exact/.test(html));
    assert(/-webkit-print-color-adjust:\s*exact/.test(html));
  });

  // ────────────────────────────────────────────
  group('4) 분석형 — analysisColorMode 분기');
  await test('기본 (color) → body class analysis-color', () => {
    const html = at.renderAnalysisHtml(tinyReport);
    assert(/<body class="analysis-color"/.test(html));
  });
  await test('opts.analysisColorMode="bw" → body class analysis-bw', () => {
    const html = at.renderAnalysisHtml(tinyReport, { analysisColorMode: 'bw' });
    assert(/<body class="analysis-bw"/.test(html));
  });
  await test('printSettings.analysisColorMode="bw" 도 인식', () => {
    const html = at.renderAnalysisHtml({ ...tinyReport, printSettings: { analysisColorMode: 'bw' }});
    assert(/<body class="analysis-bw"/.test(html));
  });
  await test('CSS — analysis-bw 에 grayscale + 컬러 무력화', () => {
    const html = at.renderAnalysisHtml(tinyReport);
    assert(/body\.analysis-bw img[^{]*\{[^}]*grayscale\(100%\)/.test(html));
    assert(/body\.analysis-bw,\s*body\.analysis-bw\s*\*[^{]*\{[^}]*color:\s*#000/.test(html));
  });

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
