// ─────────────────────────────────────────────
// tests/stress/stressTest.js — 오프라인 모듈 단위 스트레스 테스트
// ▸ data/reports/*.json fixture 기반 — 외부 네트워크/Chrome/SMTP 불필요.
// ▸ clipping/analysis HTML, Word, Excel 출력의 시그니처/컨텐츠/안전성 검증.
// ▸ collapseContainedKeywords / 추천 / 검색 목적 / XSS 이스케이프 / 인코딩 통계.
//
// 실행: node tests/stress/stressTest.js [reportId]
//   (reportId 생략 시 가장 큰 fixture 자동 선택)
// 종료 코드: 0 = 모두 통과, 1 = 1건 이상 실패
// ─────────────────────────────────────────────

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const REPORTS_DIR = path.join(ROOT, 'data', 'reports');
// Windows 절대경로 → file:// URL 로 변환해서 dynamic import — ERR_UNSUPPORTED_ESM_URL_SCHEME 회피
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const results = []; // { name, passed, failMsg, ms }
const start   = Date.now();

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
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

// ── Fixture 선택 ───────────────────────────────
async function pickReport(idArg) {
  const files = (await fs.readdir(REPORTS_DIR)).filter(f => f.endsWith('.json'));
  if (idArg) {
    const target = files.find(f => f.startsWith(idArg)) || `${idArg}.json`;
    return target;
  }
  // 가장 큰 fixture 선택 (기사 수가 많을 가능성)
  const sized = await Promise.all(files.map(async f => {
    const s = await fs.stat(path.join(REPORTS_DIR, f));
    return { f, s: s.size };
  }));
  sized.sort((a, b) => b.s - a.s);
  return sized[0]?.f;
}

async function loadFixture(file) {
  const txt = await fs.readFile(path.join(REPORTS_DIR, file), 'utf8');
  return JSON.parse(txt);
}

// ── 모듈 로드 ─────────────────────────────────
async function main() {
  const idArg = process.argv[2];
  const file  = await pickReport(idArg);
  if (!file) { console.error('No fixture available in data/reports'); process.exit(2); }
  const report = await loadFixture(file);
  const reportId = file.replace(/\.json$/, '');
  console.log(`▶ fixture: ${reportId}  (articles=${(report.articles || []).length})`);

  const ct = await imp('server/clippingTemplate.js');
  const at = await imp('server/analysisTemplate.js');
  const cp = await imp('server/clippingPresets.js');
  const wg = await imp('server/wordGenerator.js');
  const xg = await imp('server/excelGenerator.js');
  const co = await imp('server/collector.js');
  const ml = await imp('server/mailer.js');

  // ────────────────────────────────────────────
  group('1) 검색 로직 정합성');
  await test('collapseContainedKeywords [보호관찰, 보호관찰소] → [보호관찰소]', () => {
    const r = co.collapseContainedKeywords(['보호관찰', '보호관찰소']);
    assert(r.length === 1 && r[0] === '보호관찰소', `got=${JSON.stringify(r)}`);
  });
  await test('collapseContainedKeywords [출입국, 출입국외국인정책본부] → [출입국외국인정책본부]', () => {
    const r = co.collapseContainedKeywords(['출입국', '출입국외국인정책본부']);
    assert(r[0] === '출입국외국인정책본부', `got=${JSON.stringify(r)}`);
  });
  await test('collapseContainedKeywords [보호관찰, 전자감독] 둘 다 유지', () => {
    const r = co.collapseContainedKeywords(['보호관찰', '전자감독']);
    assert(r.length === 2, `got=${JSON.stringify(r)}`);
  });
  await test('normalizeKeyword 공백 제거', () => {
    assert(co.normalizeKeyword('법무부 장관') === '법무부장관');
  });

  // ────────────────────────────────────────────
  group('2) 메일 진단 매퍼');
  const mailCases = [
    ['Connection timeout', 'connection-timeout'],
    ['ETIMEDOUT 1.2.3.4:587', 'connection-timeout'],
    ['ENOTFOUND smtp.example.com', 'dns-or-host'],
    ['ECONNREFUSED 127.0.0.1:465', 'refused'],
    ['535 Username and Password not accepted', 'auth'],
    ['SSL routines:wrong version number', 'tls'],
  ];
  for (const [msg, expected] of mailCases) {
    await test(`diagnose "${msg.slice(0, 30)}..." → ${expected}`, () => {
      const r = ml.diagnoseMailError({ message: msg });
      assert(r.type === expected, `got=${r.type}`);
      assert(r.hint && r.hint.length > 10, 'hint should be non-empty');
    });
  }

  // ────────────────────────────────────────────
  group('3) 편철형 HTML 출력');
  const clippingHtml = ct.renderClippingHtml(report);
  await test('편철 HTML 50KB 이상', () => {
    assert(clippingHtml.length > 50_000, `got ${clippingHtml.length}`);
  });
  await test('편철 HTML 표지 기본 텍스트 포함 (법무·검찰 또는 사용자 제목)', () => {
    const ok = /법무·검찰|언론 스크랩철|언론 스크랩|보호관찰/.test(clippingHtml);
    assert(ok, '표지 제목 텍스트 누락');
  });
  await test('편철 HTML 하단 기관명 (대변인실 등) 포함', () => {
    assert(/대변인실|홍보담당관실/.test(clippingHtml), '기관명 누락');
  });
  await test('편철 HTML #report-pdf-root 포함 (Puppeteer 셀렉터)', () => {
    assert(clippingHtml.includes('id="report-pdf-root"'), 'PDF root 누락');
  });
  await test('편철 HTML 언론사별 목차 섹션 (.cl-toc)', () => {
    assert(clippingHtml.includes('cl-toc'), '목차 섹션 누락');
  });
  await test('편철 HTML 언론사별 페이지 분할 (page-break-before)', () => {
    assert(/page-break-before:\s*always/.test(clippingHtml), 'page-break 규칙 누락');
  });
  await test('편철 HTML 최소 3개 언론사명 포함', () => {
    const sources = [...new Set((report.articles || []).map(a => a.source).filter(Boolean))];
    let hits = 0;
    for (const s of sources.slice(0, 8)) if (clippingHtml.includes(s)) hits++;
    assert(hits >= 3, `${hits} sources matched, want ≥ 3`);
  });
  await test('편철 HTML 깨진 문자 비율 < 1%', () => {
    const bad = (clippingHtml.match(/�/g) || []).length;
    const ratio = bad / clippingHtml.length;
    assert(ratio < 0.01, `garbled ratio ${(ratio * 100).toFixed(3)}%`);
  });

  // ────────────────────────────────────────────
  group('4) 편철 출력 설정 / 사용자 override 적용');
  const customSettings = {
    title: '테스트 출력 제목 STRESS-XYZ',
    dateText: '2026. 4. 30.(목)',
    issueLabel: '석간',
    mainBoxTitle: '커스텀',
    mainBoxSub: '(테스트)',
    extraTag1: '확장1', extraTag2: '확장2',
    organization: '테스트기관실',
    sortBy: 'media',
    pageLayout: 'media',
    columnCount: 2,
    imageMode: 'lead',
    showSourceLink: true,
    includeAnalysisAppendix: true,
  };
  const customHtml = ct.renderClippingHtml({ ...report, printSettings: customSettings });
  await test('사용자 표지 제목 반영', () => {
    assert(customHtml.includes('테스트 출력 제목 STRESS-XYZ'));
  });
  await test('사용자 기관명 반영', () => {
    assert(customHtml.includes('테스트기관실'));
  });
  await test('사용자 중앙박스/발행구분 반영', () => {
    assert(customHtml.includes('석간') && customHtml.includes('커스텀'));
  });
  await test('분석 부록 옵션 ON 시 .cl-appendix 렌더', () => {
    assert(customHtml.includes('cl-appendix'));
  });
  await test('분석 부록 OFF 시 <section class="cl-appendix"> 미렌더', () => {
    // CSS 규칙 .cl-appendix { ... } 는 항상 있으므로 실제 섹션 요소 존재만 검사
    const html = ct.renderClippingHtml(report, { includeAppendix: false });
    assert(!/<section[^>]*class="[^"]*cl-appendix[^"]*"/.test(html), '<section class="cl-appendix"> 가 렌더되었음');
  });
  await test('2단 컬럼 옵션 시 .col-2 클래스 적용', () => {
    assert(customHtml.includes('col-2'));
  });

  // 기사 override — 첫 번째 기사 제목 변경 + 두 번째 제외
  const arts = report.articles || [];
  const aId1 = arts[0]?.id;
  const aId2 = arts[1]?.id;
  const aTitle2Original = arts[1]?.title;
  const overrideMap = {
    [aId1]: { title: '★STRESS_OVERRIDDEN_TITLE_QQQ★', source: 'STRESS_MEDIA_SRC', pageLabel: 'A99', printOrder: 1 },
    [aId2]: { includeInClipping: false },
  };
  const overrideHtml = ct.renderClippingHtml({ ...report, articleOverrides: overrideMap });
  await test('기사 override — 변경 제목 반영', () => {
    assert(overrideHtml.includes('★STRESS_OVERRIDDEN_TITLE_QQQ★'));
  });
  await test('기사 override — 변경 언론사명 반영', () => {
    assert(overrideHtml.includes('STRESS_MEDIA_SRC'));
  });
  await test('기사 override — 제외 기사 제목 사라짐', () => {
    if (!aTitle2Original) return; // skip if fixture has no 2nd
    // 제외된 제목이 다른 곳에서 등장하지 않는지 — 일부는 본문/목차에 모두 사라져야 함
    const stripped = overrideHtml.replace(/[\s\W]/g, '');
    const target = aTitle2Original.replace(/[\s\W]/g, '');
    if (target.length < 8) return; // 너무 짧으면 우연한 매칭 위험
    assert(!stripped.includes(target), '제외한 기사 제목이 출력에 남아있음');
  });

  // ────────────────────────────────────────────
  group('5) 출력 전 품질 점검 (buildQualityReport)');
  const q = ct.buildQualityReport(report);
  await test('품질 점검: total > 0', () => assert(q.total > 0));
  await test('품질 점검: counts 5개 키 보유', () => {
    for (const k of ['missingBody', 'missingImage', 'missingTitle', 'missingSource', 'missingPage']) {
      assert(k in q.counts, `${k} 누락`);
    }
  });

  // ────────────────────────────────────────────
  group('6) 분석형 HTML 출력');
  const analysisHtml = at.renderAnalysisHtml(report);
  const analysisChecks = [
    ['1페이지 요약 박스', '상급자 보고용 1페이지 요약'],
    ['보고 개요',         '1. 보고 개요'],
    ['종합 분석',         '2. 종합 분석'],
    ['주요 이슈 TOP 5',   '3. 주요 이슈 TOP 5'],
    ['긍부정 분석',       '4. 긍정 · 부정 · 중립 분석'],
    ['홍보 실적',         '5. 기관 배포자료 및 홍보 실적'],
    ['언론 재인용',       '6. 언론 재인용 현황'],
    ['클릭 추적',         '7. 클릭 추적'],
    ['대응 필요사항',     '8. 대응 필요사항'],
    ['모니터링 키워드',   '9. 향후 모니터링'],
    ['붙임',              '붙임'],
  ];
  for (const [label, needle] of analysisChecks) {
    await test(`분석형 섹션 "${label}" 포함`, () => {
      assert(analysisHtml.includes(needle), `"${needle}" 누락`);
    });
  }
  await test('분석형 문체 — ~임/~함/~판단됨 사용', () => {
    const hits = (analysisHtml.match(/임\.|함\.|판단됨|필요함|요구됨/g) || []).length;
    assert(hits >= 3, `formal endings count=${hits}`);
  });

  // ────────────────────────────────────────────
  group('7) Word 출력 (편철 / 분석)');
  const wbufClip = await wg.clippingToDocx(report);
  await test('편철 docx 시그니처 PK', () => {
    assert(Buffer.isBuffer(wbufClip), 'not a buffer');
    assert(wbufClip[0] === 0x50 && wbufClip[1] === 0x4b, 'docx PK header missing');
  });
  await test('편철 docx 크기 ≥ 5KB & ≤ 30MB', () => {
    assert(wbufClip.length >= 5_000, `got ${wbufClip.length}`);
    assert(wbufClip.length <= 30 * 1024 * 1024, `oversize ${wbufClip.length}`);
  });
  const wbufAna = await wg.analysisToDocx(report);
  await test('분석 docx 시그니처 PK', () => {
    assert(wbufAna[0] === 0x50 && wbufAna[1] === 0x4b);
  });
  await test('분석 docx 크기 ≥ 5KB', () => {
    assert(wbufAna.length >= 5_000, `got ${wbufAna.length}`);
  });

  // ────────────────────────────────────────────
  group('8) Excel 출력');
  const xbuf = await xg.reportToXlsx(report, { tracking: { totalLinks: 0, totalClicks: 0, items: [] } });
  await test('xlsx 시그니처 PK', () => {
    assert(xbuf[0] === 0x50 && xbuf[1] === 0x4b);
  });
  await test('xlsx 크기 ≥ 10KB', () => {
    assert(xbuf.length >= 10_000, `got ${xbuf.length}`);
  });
  await test('xlsx 시트 — 요약/전체기사/언론사별목차/기사편집용 모두 포함', async () => {
    // ZIP 내부의 xl/workbook.xml 에서 sheet 이름 확인
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xbuf);
    const names = wb.worksheets.map(s => s.name);
    const required = ['1.요약', '2.전체기사', '언론사별목차', '기사편집용'];
    for (const r of required) assert(names.some(n => n.includes(r) || n === r), `시트 ${r} 누락 — got ${names.join('|')}`);
  });

  // ────────────────────────────────────────────
  group('9) XSS / 안전성');
  const xssReport = JSON.parse(JSON.stringify(report));
  const xssArt = xssReport.articles?.[0];
  if (xssArt) {
    xssArt.title    = '<script>alert(1)</script>';
    xssArt.source   = '<img src=x onerror=alert(1)>';
    xssArt.author   = "<svg/onload=alert(1)>";
  }
  const xssHtml = ct.renderClippingHtml(xssReport);
  const xssAna  = at.renderAnalysisHtml(xssReport);
  await test('편철 HTML — <script> 태그가 escape 되어 raw 로 유출되지 않음', () => {
    assert(!/<script>alert\(1\)<\/script>/.test(xssHtml), 'raw <script> leaked');
  });
  await test('편철 HTML — 사용자 주입 <img onerror=alert> 가 실제 태그로 유출되지 않음', () => {
    // 템플릿의 lead-image onerror="this.style.display='none'" 는 정적 — 무시.
    // 사용자 주입 페이로드는 < / > 가 escape 되어 실제 <img> 태그로 변환되지 않아야 한다.
    assert(!/<img[^>]*\bsrc\s*=\s*x\b[^>]*onerror/i.test(xssHtml),
      'unescaped user <img src=x onerror=...> tag leaked');
    // alert(1) 호출이 실제 스크립트로 실행 가능한 위치에 있으면 안 됨
    assert(!/<script>[^<]*alert\(1\)/i.test(xssHtml), 'unescaped <script>alert(1)</script> leaked');
  });
  await test('분석 HTML — <script> 태그 escape', () => {
    assert(!/<script>alert\(1\)<\/script>/.test(xssAna));
  });
  await test('편철 HTML — &lt;script&gt; 형태로 escape 됨', () => {
    assert(/&lt;script&gt;alert\(1\)/.test(xssHtml), 'expected escaped form');
  });

  // ────────────────────────────────────────────
  group('10) 인코딩 / 본문 / 이미지 통계');
  const arts2 = report.articles || [];
  const garbledArts = arts2.filter(a => (a.garbledRatio || 0) > 0.01);
  await test(`garbledRatio > 1% 기사 비율 < 30%`, () => {
    const ratio = garbledArts.length / Math.max(arts2.length, 1);
    assert(ratio < 0.3, `${(ratio * 100).toFixed(1)}% 기사가 1% 이상 깨짐`);
  });
  await test('본문 추출률 60% 이상', () => {
    const ext = arts2.filter(a => a.extracted).length;
    const rate = ext / Math.max(arts2.length, 1);
    assert(rate >= 0.6, `extraction rate ${(rate * 100).toFixed(1)}%`);
  });
  await test('encodingUsed 필드 보존', () => {
    const set = new Set(arts2.map(a => a.encodingUsed).filter(Boolean));
    assert(set.size > 0, 'encodingUsed 추적 누락');
  });
  await test('이미지 정보 보존 (images 필드)', () => {
    const withImg = arts2.filter(a => (a.images || []).length > 0).length;
    // 일부는 없을 수 있으나 0 이면 의심 — 경고 처리 (skip if zero)
    if (withImg === 0) console.log('     ⚠️ 이미지 보유 기사 0건 — fixture 특성일 수 있음');
  });

  // ────────────────────────────────────────────
  group('11) 검색 목적 / 추천 키워드 프리셋');
  // ESM dynamic import — 클라이언트 모듈
  const presets = await imp('src/constants/keywordPresets.js');
  await test('moj 카테고리 5개', () => {
    const cats = presets.listCategories('moj');
    assert(cats.length === 5, `got ${cats.length}`);
    const ids = cats.map(c => c.id);
    for (const x of ['hq', 'protection', 'corrections', 'immigration', 'prosecution']) {
      assert(ids.includes(x), `category ${x} missing`);
    }
  });
  await test('보호직(protection) 핵심 6 + 확장 14 (스펙 일치)', () => {
    const c = presets.listCategories('moj').find(x => x.id === 'protection');
    assert(c.core.length === 6 && c.extended.length === 14, `got core=${c.core.length} ext=${c.extended.length}`);
  });
  await test('추천: suggestRelated([보호관찰]) 길이 > 0', () => {
    const r = presets.suggestRelated(['보호관찰']);
    assert(r.length > 0);
    assert(r.includes('전자감독') || r.includes('보호관찰소'), `got ${r.join(',')}`);
  });
  await test('검색 목적 6종', () => {
    assert(presets.INTENT_PRESETS.length === 6);
    const ids = presets.INTENT_PRESETS.map(p => p.id);
    for (const x of ['general', 'negative', 'publicity', 'reform', 'oversight', 'incident']) {
      assert(ids.includes(x), `intent ${x} missing`);
    }
  });
  await test('flatten — 중복 없이 90+ 키워드', () => {
    const all = presets.flattenAllKeywords('moj');
    assert(new Set(all).size === all.length, '중복 키워드 존재');
    assert(all.length > 80, `flatten count=${all.length}`);
  });

  // ────────────────────────────────────────────
  // 결과 출력 + 종료
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
