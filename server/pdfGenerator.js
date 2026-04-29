// ─────────────────────────────────────────────
// pdfGenerator.js — Puppeteer 로 HTML → PDF
// 한글 폰트는 Google Fonts (Noto Sans KR) 를 임베드한다.
// preview / download 모두 동일한 buffer 를 반환 — 헤더만 라우터에서 분기.
// ─────────────────────────────────────────────

import puppeteer from 'puppeteer';

let browserPromise;

export function ensureBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=medium',
    ],
  }).catch(err => {
    browserPromise = null;
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
        new Promise(res => setTimeout(res, 8000)),
      ]));
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
