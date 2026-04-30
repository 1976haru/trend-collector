// ─────────────────────────────────────────────
// fonts.js — PDF 한글 폰트 임베드 (base64 inline @font-face)
//
// 배경:
//   Render / Railway / Docker Linux 환경에는 한글 폰트가 기본 설치되어 있지 않다.
//   외부 Google Fonts CDN 은 PDF 생성 timeout / 차단 가능성이 있어 사용 X.
//   해결: @fontsource 패키지의 woff2 파일을 base64 로 인코딩해 PDF HTML 에 inline 임베드.
//
// 정책:
//   - 폰트 데이터는 모듈 로드 시 한 번만 디스크에서 읽어 메모리 캐시.
//   - 각 PDF 생성 시 캐시된 base64 문자열을 HTML <style> 안에 삽입.
//   - PDF 안에는 Chromium 이 실제 사용한 글리프만 subset 으로 임베드되므로
//     PDF 파일 크기 증가는 미미 (사용된 한글 글자 수에 비례).
//
// 라이선스:
//   - Noto Sans KR / Noto Serif KR — SIL Open Font License (OFL) 1.1
//   - 상업·재배포 모두 허용.
// ─────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// 폰트 파일 경로 — @fontsource 패키지 내부.
function fontPath(pkg, file) {
  return path.join(ROOT, 'node_modules', pkg, 'files', file);
}

const FONT_FILES = [
  // Sans (본문, 분석 보고서, 보고서 본체)
  { family: 'Noto Sans KR',  weight: 400, file: fontPath('@fontsource/noto-sans-kr',  'noto-sans-kr-korean-400-normal.woff2') },
  { family: 'Noto Sans KR',  weight: 700, file: fontPath('@fontsource/noto-sans-kr',  'noto-sans-kr-korean-700-normal.woff2') },
  // Serif (편철형 표지·본문)
  { family: 'Noto Serif KR', weight: 400, file: fontPath('@fontsource/noto-serif-kr', 'noto-serif-kr-korean-400-normal.woff2') },
  { family: 'Noto Serif KR', weight: 700, file: fontPath('@fontsource/noto-serif-kr', 'noto-serif-kr-korean-700-normal.woff2') },
];

// 모듈 시작 시 한 번 로드 — Buffer → base64 cache
let cachedFontFaceCss = null;
let cachedFontStatus  = { loaded: false, missing: [], loadedFamilies: [] };

function loadFonts() {
  if (cachedFontFaceCss) return cachedFontFaceCss;
  const blocks = [];
  const missing = [];
  const loadedFamilies = new Set();
  for (const f of FONT_FILES) {
    try {
      const buf = fs.readFileSync(f.file);
      const b64 = buf.toString('base64');
      blocks.push(`@font-face {
  font-family: '${f.family}';
  font-style: normal;
  font-weight: ${f.weight};
  font-display: block;
  src: url(data:font/woff2;base64,${b64}) format('woff2');
}`);
      loadedFamilies.add(f.family);
    } catch (e) {
      console.warn(`[fonts] missing ${f.family} ${f.weight}: ${f.file} — ${e.message}`);
      missing.push({ family: f.family, weight: f.weight, file: f.file, error: e.message });
    }
  }
  // 한글 sans-serif 시스템 폰트 fallback 도 함께 정의
  cachedFontFaceCss = blocks.join('\n');
  cachedFontStatus = {
    loaded:         blocks.length > 0,
    missing,
    loadedFamilies: [...loadedFamilies],
    totalSizeKB:    blocks.length ? Math.round(cachedFontFaceCss.length / 1024) : 0,
  };
  if (cachedFontStatus.loaded) {
    console.log(`[fonts] embedded ${blocks.length} weights — ${cachedFontStatus.loadedFamilies.join(', ')} (${cachedFontStatus.totalSizeKB} KB base64)`);
  } else {
    console.error('[fonts] ⚠️ NO FONT FILES LOADED — PDF 한글이 깨질 수 있습니다.');
  }
  return cachedFontFaceCss;
}

// 즉시 로드 — 첫 요청 지연 없이 캐시 준비
loadFonts();

/**
 * PDF HTML 의 <style> 안에 삽입할 @font-face CSS 반환.
 * 호출자는 그대로 <style>{getKoreanFontFaceCss()}</style> 형태로 inline.
 */
export function getKoreanFontFaceCss() {
  if (!cachedFontFaceCss) loadFonts();
  return cachedFontFaceCss || '';
}

/**
 * 진단 — UI / health 응답용. 실제 base64 데이터는 노출하지 않는다.
 */
export function getFontStatus() {
  if (!cachedFontFaceCss) loadFonts();
  return {
    loaded:         cachedFontStatus.loaded,
    loadedFamilies: cachedFontStatus.loadedFamilies,
    weightsLoaded:  FONT_FILES.length - cachedFontStatus.missing.length,
    weightsTotal:   FONT_FILES.length,
    totalSizeKB:    cachedFontStatus.totalSizeKB,
    missing:        cachedFontStatus.missing.map(m => ({ family: m.family, weight: m.weight })),
  };
}

/**
 * 텍스트의 깨진 문자 비율 계산 — '�' (U+FFFD) 또는 '□' (U+25A1) 비율.
 * 폰트로 표시 못 하는 경우 Chromium 이 □ 로 그리지만, HTML 단계에서는 보통 �.
 */
export function detectGarbledRatio(text = '') {
  const s = String(text);
  if (!s.length) return 0;
  const bad = (s.match(/[�□]/g) || []).length;
  return bad / s.length;
}

// 호출자 편의 — Body 시스템 폰트 fallback 과 함께 사용할 family stack
export const FONT_STACK_SANS  = `'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',sans-serif`;
export const FONT_STACK_SERIF = `'Noto Serif KR','Nanum Myeongjo','Batang','바탕',serif`;
