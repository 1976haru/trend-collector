// ─────────────────────────────────────────────
// pdfGenerator.js — Puppeteer 로 HTML → PDF
// 한글 폰트는 Google Fonts (Noto Sans KR) 를 임베드한다.
// preview / download 모두 동일한 buffer 를 반환 — 헤더만 라우터에서 분기.
// ─────────────────────────────────────────────

import puppeteer from 'puppeteer';

let browserPromise;

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
    ],
  };
  // 명시적 Chrome 경로가 있으면 사용 (Render 등 캐시 문제 회피)
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  browserPromise = puppeteer.launch(launchOpts).catch(err => {
    browserPromise = null;
    // 'Could not find Chrome' / 'Chromium' 오류를 사용자 친화적으로 변환
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

/**
 * HTML → PDF 버퍼.
 * - waitForSelector('#report-pdf-root') 으로 렌더링 완료 보장
 * - 폰트 / 이미지 모두 로드까지 대기 (networkidle0)
 * - Buffer 가 %PDF 로 시작하는지 확인 후 반환 (그 외에는 throw)
 */
export async function htmlToPdf(html, opts = {}) {
  const browser = await ensureBrowser();
  const page    = await browser.newPage();

  // 콘솔 / 페이지 오류는 서버 로그로 — 디버깅용
  page.on('console', m => {
    if (m.type() === 'error') console.error('[pdf:page-console]', m.text());
  });
  page.on('pageerror', e => console.error('[pdf:page-error]', e.message));

  try {
    await page.emulateMediaType('screen');
    // setContent 자체가 networkidle 까지 대기
    await page.setContent(html, {
      waitUntil: ['load', 'networkidle0'],
      timeout:   60_000,
    });
    // 보고서 루트 셀렉터가 실제로 렌더링 됐는지 확인
    try {
      await page.waitForSelector('#report-pdf-root', { timeout: 15_000 });
    } catch (e) {
      throw new Error('보고서 루트(#report-pdf-root)가 렌더링되지 않았습니다.');
    }
    // 웹폰트 로딩 대기
    try { await page.evaluate(() => document.fonts ? document.fonts.ready : null); } catch {}
    // 이미지 onload 대기 (timeout 으로 PDF 전체 실패 방지)
    // PDF 의 이미지는 대부분 data: URL 로 임베드되므로 빠르게 complete 됨.
    try {
      await page.evaluate(() => Promise.race([
        Promise.all(
          Array.from(document.images)
            .filter(img => !img.complete)
            .map(img => new Promise(res => {
              img.addEventListener('load',  () => res(true),  { once: true });
              img.addEventListener('error', () => res(false), { once: true });
            }))
        ),
        new Promise(res => setTimeout(res, 12000)),
      ]));
      // 모든 이미지가 정말 그려졌는지 (naturalWidth > 0) 한 번 더 확인 — data URL 깨짐 방어
      try {
        await page.waitForFunction(() =>
          Array.from(document.images).every(img => img.complete && (img.naturalWidth > 0 || img.src === '')),
          { timeout: 5000 }
        );
      } catch {}
    } catch {}

    const pdf = await page.pdf({
      format:           opts.format || 'A4',
      printBackground:  true,
      preferCSSPageSize: true,
      margin: opts.margin || { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:9pt; width:100%; padding:0 16mm; color:#888;">
                         <span>법무부 언론보도 모니터링 일일보고</span>
                       </div>`,
      footerTemplate: `<div style="font-size:9pt; width:100%; padding:0 16mm; color:#888; text-align:center;">
                         <span class="pageNumber"></span> / <span class="totalPages"></span>
                       </div>`,
      timeout: 90_000,
    });

    // 매직 바이트 검증 — PDF 가 아니면 throw
    const buf = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
    const head = buf.slice(0, 4).toString('binary');
    if (head !== '%PDF') {
      throw new Error(`PDF 시그니처 오류 — 응답 헤드: ${JSON.stringify(head)} (예상: %PDF)`);
    }
    return buf;
  } finally {
    try { await page.close(); } catch {}
  }
}
