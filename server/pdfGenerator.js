// ─────────────────────────────────────────────
// pdfGenerator.js — Puppeteer 로 HTML → PDF
//
// 핵심 정책
//   1) 외부 네트워크에 의존하지 않는다.
//      - 템플릿은 fast 모드에서 외부 폰트 link 를 제거한다 (server/clippingTemplate.js 등).
//      - waitUntil 은 networkidle0 대신 'domcontentloaded' + 명시 selector 대기.
//   2) 모든 단계에 명시적 timeout — 어느 한 단계도 무한 대기 금지.
//      - navigation 180s · selector 60s · fonts 10s · images race 10s · pdf 90s
//   3) 단계별 timing log — 실패 시 어느 단계에서 막혔는지 즉시 식별.
//   4) 친절한 한국어 오류 — code('CHROME_NOT_FOUND' / 'PDF_TIMEOUT') 부착.
//   5) page 는 항상 finally 에서 close — leak 방지.
// ─────────────────────────────────────────────

import puppeteer from 'puppeteer';

let browserPromise;

const NAV_TIMEOUT_MS      = 180_000;  // page.setContent / goto
const SELECTOR_TIMEOUT_MS = 60_000;   // #report-pdf-root 대기
const FONTS_TIMEOUT_MS    = 10_000;   // document.fonts.ready 최대 대기
const IMAGES_TIMEOUT_MS   = 10_000;   // 이미지 로딩 race 한도
const PDF_TIMEOUT_MS      = 90_000;   // page.pdf() 자체 timeout
const TOTAL_BUDGET_MS     = 180_000;  // 전체 예산 (외부 race 가드)

export function ensureBrowser() {
  if (browserPromise) return browserPromise;

  const launchOpts = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=medium',
      // 외부 리소스 로딩 차단을 우회하기 위한 안정성 플래그
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  browserPromise = puppeteer.launch(launchOpts).catch(err => {
    browserPromise = null;
    const msg = err?.message || String(err);
    if (/Could not find (Chrome|Chromium|browser)|Browser was not found/i.test(msg)) {
      const friendly = new Error(
        'PDF 생성용 Chrome 이 서버에 설치되지 않았습니다. 관리자에게 배포 설정 확인을 요청하세요. ' +
        '(Render 의 경우 buildCommand 에 `npx puppeteer browsers install chrome` 이 포함되어 있는지, ' +
        'PUPPETEER_CACHE_DIR 환경변수가 빌드/런타임에 동일하게 설정되어 있는지 점검하세요.)'
      );
      friendly.code   = 'CHROME_NOT_FOUND';
      friendly.detail = msg;
      throw friendly;
    }
    throw err;
  });
  return browserPromise;
}

export async function shutdownBrowser() {
  if (!browserPromise) return;
  try { (await browserPromise).close(); } catch {}
  browserPromise = null;
}

// 외부 race — 어떤 한 단계에서 무한 대기해도 전체 예산을 넘지 않도록.
function withTotalBudget(promise, budgetMs, stepName) {
  let to;
  const guard = new Promise((_, reject) => {
    to = setTimeout(() => {
      const e = new Error(`PDF 생성 전체 시간(${(budgetMs / 1000) | 0}초) 초과 — 단계: ${stepName}`);
      e.code = 'PDF_TIMEOUT';
      e.step = stepName;
      reject(e);
    }, budgetMs);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(to)),
    guard,
  ]);
}

/**
 * HTML → PDF 버퍼.
 * @param {string} html
 * @param {Object} opts
 *   - format / margin: page.pdf 옵션
 *   - reportId: 로그용
 *   - mode: 'fast' | 'image' | 'default' — 로그에만 사용 (HTML 생성은 호출자 책임)
 *   - waitNetworkIdle: false (기본). true 일 때만 networkidle2 대기.
 */
export async function htmlToPdf(html, opts = {}) {
  const startAt    = Date.now();
  const reportId   = opts.reportId || '-';
  const mode       = opts.mode || 'default';
  const tag        = `[pdf:${reportId}:${mode}]`;
  const log        = (step, extra) => console.log(`${tag} ${step}${extra ? ' ' + extra : ''}  +${Date.now() - startAt}ms`);

  const browser = await ensureBrowser();
  const page    = await browser.newPage();

  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
  page.setDefaultTimeout(NAV_TIMEOUT_MS);

  page.on('console', m => {
    if (m.type() === 'error') console.error(`${tag} page-console`, m.text());
  });
  page.on('pageerror', e => console.error(`${tag} page-error`, e.message));
  page.on('requestfailed', req => {
    // 외부 폰트/이미지 실패는 전체 PDF 실패로 이어지면 안 된다 — 로그만.
    const u = req.url();
    if (!/^data:|^about:/.test(u)) console.warn(`${tag} request-failed ${req.failure()?.errorText} ${u.slice(0, 120)}`);
  });

  let lastStep = 'init';
  try {
    log('start', `htmlSize=${(html.length / 1024 | 0)}KB`);

    // ── 1) HTML 주입 — domcontentloaded 만 대기 (외부 resource 안 기다림) ──
    lastStep = 'setContent';
    await page.emulateMediaType('screen');
    if (opts.waitNetworkIdle) {
      await page.setContent(html, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT_MS });
    } else {
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    }
    log('htmlReady');

    // ── 2) 셀렉터 대기 — 보고서 루트가 실제로 렌더링 됐는지 ──
    lastStep = 'waitForSelector';
    try {
      await page.waitForSelector('#report-pdf-root', { timeout: SELECTOR_TIMEOUT_MS });
    } catch {
      const e = new Error('보고서 루트(#report-pdf-root)가 렌더링되지 않았습니다.');
      e.code = 'PDF_TIMEOUT';
      e.step = 'waitForSelector';
      throw e;
    }
    log('selectorReady');

    // ── 3) 폰트 로딩 — 최대 10초 + 한글 글리프 실제 로드 검증 ──
    lastStep = 'fontsReady';
    const fontDiag = await page.evaluate(async (timeoutMs) => {
      if (!document.fonts) return { ready: false, koreanLoaded: false, families: [] };
      await Promise.race([
        document.fonts.ready,
        new Promise(res => setTimeout(res, timeoutMs)),
      ]);
      // 실제 한글 글리프 로드 검증 — '법무부' 가 base64 임베드된 Noto Sans KR 로 그려지는지 확인.
      // document.fonts.check 가 명시적 family 검증.
      const sansKoreanLoaded = document.fonts.check('12px "Noto Sans KR"', '법무부 보호관찰 전자감독');
      const serifKoreanLoaded = document.fonts.check('12px "Noto Serif KR"', '법무부 보호관찰 전자감독');
      const families = [...document.fonts].map(f => f.family);
      return {
        ready:           true,
        koreanLoaded:    sansKoreanLoaded || serifKoreanLoaded,
        sansLoaded:      sansKoreanLoaded,
        serifLoaded:     serifKoreanLoaded,
        families:        [...new Set(families)],
      };
    }, FONTS_TIMEOUT_MS).catch(() => ({ ready: false, koreanLoaded: false }));
    log('fontReady', `koreanLoaded=${fontDiag.koreanLoaded} sans=${fontDiag.sansLoaded} serif=${fontDiag.serifLoaded}`);
    if (!fontDiag.koreanLoaded) {
      console.warn(`${tag} ⚠️ Korean font NOT loaded — PDF 한글 깨짐 위험 (families=${(fontDiag.families || []).join(',')})`);
    }

    // ── 4) 이미지 로딩 — 최대 10초 race, 실패는 graceful ──
    lastStep = 'imagesReady';
    await page.evaluate(async (timeoutMs) => {
      const imgs = Array.from(document.images || []);
      const each = imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(); } };
          img.addEventListener('load',  finish, { once: true });
          img.addEventListener('error', finish, { once: true });
          // 개별 이미지도 3초 한도
          setTimeout(finish, 3000);
        });
      });
      await Promise.race([
        Promise.all(each),
        new Promise(resolve => setTimeout(resolve, timeoutMs)),
      ]);
      // 로딩 실패한 외부 이미지는 PDF 에서 숨겨 빈 박스로 남지 않게 한다.
      // (data:URL 이미지는 거의 항상 complete 상태)
      for (const img of imgs) {
        const ok = img.complete && img.naturalWidth > 0;
        if (!ok) img.style.display = 'none';
      }
    }, IMAGES_TIMEOUT_MS).catch(() => {});
    log('imagesReady');

    // ── 5) PDF 생성 ──
    lastStep = 'pdf';
    const pdfPromise = page.pdf({
      format:           opts.format || 'A4',
      printBackground:  true,
      preferCSSPageSize: true,
      margin: opts.margin || { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
      displayHeaderFooter: opts.displayHeaderFooter !== false,
      headerTemplate: opts.headerTemplate || `<div style="font-size:9pt; width:100%; padding:0 16mm; color:#888;"><span>법무부 언론보도 모니터링 일일보고</span></div>`,
      footerTemplate: opts.footerTemplate || `<div style="font-size:8.5pt; width:100%; padding:0 16mm; color:#888; display:flex; justify-content:space-between;"><span>${(opts.appLabel || 'Trend Collector v1.0.0')}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      timeout: PDF_TIMEOUT_MS,
    });
    const pdf = await pdfPromise;
    log('pdfGenerated', `${(pdf.length / 1024 | 0)}KB`);

    // 매직 바이트 검증
    const buf = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    const head = buf.slice(0, 4).toString('binary');
    if (head !== '%PDF') {
      const e = new Error(`PDF 시그니처 오류 — 응답 헤드: ${JSON.stringify(head)} (예상: %PDF)`);
      e.code = 'PDF_SIGNATURE';
      throw e;
    }
    return buf;
  } catch (e) {
    // step 정보 부착 + timeout 원인을 PDF_TIMEOUT 코드로 표준화
    if (!e.code) {
      const m = String(e.message || '');
      if (/timeout/i.test(m) || /Navigation timeout/i.test(m)) {
        e.code = 'PDF_TIMEOUT';
      }
    }
    if (!e.step) e.step = lastStep;
    console.error(`${tag} FAIL step=${e.step} code=${e.code || 'UNKNOWN'} +${Date.now() - startAt}ms — ${e.message}`);
    throw e;
  } finally {
    try { await page.close(); } catch {}
  }
}

// 전체 예산 race 를 적용한 wrapper — 라우트에서 사용 권장.
export async function htmlToPdfBudgeted(html, opts = {}) {
  return withTotalBudget(htmlToPdf(html, opts), TOTAL_BUDGET_MS, opts.mode || 'pdf');
}
