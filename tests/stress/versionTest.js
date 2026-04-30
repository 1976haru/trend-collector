// ─────────────────────────────────────────────
// tests/stress/versionTest.js — 버전 / changelog / 출력물 표기 검증
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

async function main() {
  const ch = await imp('server/changelog.js');
  const rt = await imp('server/reportTemplate.js');
  const xg = await imp('server/excelGenerator.js');
  const wg = await imp('server/wordGenerator.js');
  const fs = (await import('node:fs/promises'));

  // ────────────────────────────────────────────
  group('1) changelog 모듈');
  await test('APP_NAME / getAppVersion / getLatest exports', () => {
    assert(ch.APP_NAME === 'Trend Collector');
    const v = ch.getAppVersion();
    assert(/^\d+\.\d+\.\d+/.test(v), `version 형식 X: ${v}`);
    const l = ch.getLatest();
    assert(l && l.version === v, `latest.version=${l?.version}, current=${v}`);
  });
  await test('CHANGELOG — v1.0.0 운영 기준판 항목 존재', () => {
    const v100 = ch.CHANGELOG.find(x => x.version === '1.0.0');
    assert(v100, '1.0.0 누락');
    assert(v100.title.includes('운영 기준판'));
    assert(Array.isArray(v100.highlights) && v100.highlights.length >= 5);
    assert(Array.isArray(v100.fixes) && v100.fixes.length >= 3);
    assert(Array.isArray(v100.notes) && v100.notes.length >= 1);
  });
  await test('package.json version === changelog version', async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
    assert(pkg.version === ch.getAppVersion(), `pkg=${pkg.version}, changelog=${ch.getAppVersion()}`);
  });

  // ────────────────────────────────────────────
  group('2) 출력물 — 버전 표기');
  const fixture = {
    id: 'v-test', title: '테스트 보고서', generatedAt: new Date().toISOString(),
    keywords: ['보호관찰'],
    articles: [{
      id: 'a1', keyword: '보호관찰', title: '보호관찰 강화', source: '법무부',
      url: 'https://example.com', extracted: true, contentText: '본문',
      sentiment: { label: '중립', score: 0, matchedKeywords: { positive: [], negative: [] } },
      articleSource: 'agency', priority: '참고', date: '2026-05-01',
    }],
    sentiment: { total: 1, positive: 0, negative: 0, neutral: 1, overall: '중립' },
    period: { from: '2026-04-25T00:00:00Z', to: '2026-05-01T23:59:59Z', label: '7d' },
  };

  await test('HTML 보고서 — Trend Collector v1.0.0 푸터', () => {
    const html = rt.renderReportHtml(fixture);
    const v = ch.getAppVersion();
    assert(html.includes(`Trend Collector v${v}`), `버전 표기 누락 (v=${v})`);
  });
  await test('Excel 요약 시트 — 프로그램 행에 v1.0.0 표시', async () => {
    const xbuf = await xg.reportToXlsx(fixture, { tracking: { totalLinks: 0, totalClicks: 0, items: [] } });
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xbuf);
    const ws = wb.worksheets.find(s => s.name === '1.요약');
    assert(ws);
    let found = false;
    ws.eachRow((row) => {
      const cells = row.values || [];
      const txt = cells.map(v => typeof v === 'object' ? v?.text || '' : String(v || '')).join('|');
      if (/Trend Collector v\d+\.\d+\.\d+/.test(txt)) found = true;
    });
    assert(found, '요약 시트에 버전 표기 누락');
  });
  await test('Word 표지 — Trend Collector v1.0.0 (zip 풀어 word/document.xml 검색)', async () => {
    const buf = await wg.reportToDocx(fixture);
    // docx 는 zip 압축 — word/document.xml 을 풀어서 평문 검색
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml').async('string');
    const v = ch.getAppVersion();
    assert(xml.includes(`Trend Collector v${v}`), `Word document.xml 에 버전 표기 누락 (v=${v})`);
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
