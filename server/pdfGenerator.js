// ─────────────────────────────────────────────
// pdfGenerator.js — Puppeteer 로 HTML → PDF
// 한글 폰트는 Google Fonts (Noto Sans KR) 를 임베드한다.
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
 * HTML 문자열을 PDF 버퍼로 변환한다.
 * @param {string} html
 * @param {Object} opts
 * @returns {Promise<Buffer>}
 */
export async function htmlToPdf(html, opts = {}) {
  const browser = await ensureBrowser();
  const page    = await browser.newPage();
  try {
    await page.emulateMediaType('screen');
    await page.setContent(html, {
      waitUntil: ['load', 'networkidle0'],
      timeout:   30_000,
    });
    // 웹폰트 로딩 대기
    try { await page.evaluate(() => document.fonts ? document.fonts.ready : null); } catch {}
    const pdf = await page.pdf({
      format:           opts.format       || 'A4',
      printBackground:  true,
      margin: opts.margin || { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size:9pt; width:100%; padding:0 16mm; color:#888;">
          <span>Trend Collector — 일일 언론보도 보고서</span>
        </div>`,
      footerTemplate: `
        <div style="font-size:9pt; width:100%; padding:0 16mm; color:#888; text-align:center;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>`,
    });
    return pdf;
  } finally {
    try { await page.close(); } catch {}
  }
}
