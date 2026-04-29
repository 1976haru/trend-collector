// ─────────────────────────────────────────────
// encodingDetect.js — HTTP/HTML 응답을 charset 자동 감지로 디코딩
// 한국 구형 언론사(EUC-KR / CP949 / MS949) 대응을 위해 iconv-lite 사용.
// ─────────────────────────────────────────────

import iconv from 'iconv-lite';

// 정규화된 charset 별칭
const ALIAS = {
  'utf8':       'utf-8',
  'utf-8':      'utf-8',
  'euc-kr':     'euc-kr',
  'euckr':      'euc-kr',
  'cp949':      'cp949',
  'ks_c_5601-1987': 'cp949',
  'ksc5601':    'cp949',
  'ms949':      'cp949',          // iconv-lite 가 별칭 처리
  'iso-8859-1': 'iso-8859-1',
  'iso8859-1':  'iso-8859-1',
};

function normalize(c) {
  return ALIAS[String(c || '').toLowerCase().trim()] || (c ? c.toLowerCase() : '');
}

// HTTP 헤더의 Content-Type charset 추출
function fromContentType(ct = '') {
  const m = String(ct).match(/charset\s*=\s*"?([^";\s]+)"?/i);
  return m ? normalize(m[1]) : '';
}

// HTML 본문 첫 1KB 의 <meta charset> 또는 http-equiv 추출
function fromMetaCharset(buf) {
  const head = buf.slice(0, 4096).toString('ascii');     // 헤더는 ASCII 호환
  const m1 = head.match(/<meta\s+charset\s*=\s*"?([^"\s>]+)"?/i);
  if (m1) return normalize(m1[1]);
  const m2 = head.match(/<meta[^>]+http-equiv\s*=\s*["']content-type["'][^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^"';\s]+)/i);
  if (m2) return normalize(m2[1]);
  return '';
}

// 깨짐 비율 (U+FFFD '�' 비율)
export function garbledRatio(text = '') {
  if (!text) return 0;
  const totalLen = text.length;
  if (totalLen === 0) return 0;
  const repCount = (text.match(/�/g) || []).length;
  return repCount / totalLen;
}

function decodeWith(buf, charset) {
  const cs = normalize(charset);
  if (!cs || cs === 'utf-8') {
    return buf.toString('utf-8');
  }
  if (iconv.encodingExists(cs)) {
    try { return iconv.decode(buf, cs); } catch { return buf.toString('utf-8'); }
  }
  return buf.toString('utf-8');
}

/**
 * Buffer + (선택) Content-Type 으로부터 HTML 텍스트를 안전하게 디코딩.
 * 깨짐 비율이 5% 이상이면 cp949 / euc-kr 로 재시도하여 더 깨끗한 결과를 채택.
 *
 * @param {Buffer|Uint8Array} buf
 * @param {Object} headers { 'content-type'? }  또는 raw content-type 문자열
 * @returns {{ text: string, encoding: string, ratio: number }}
 */
export function decodeHtmlBuffer(buf, headersOrCt = '') {
  const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const ctValue = typeof headersOrCt === 'string'
    ? headersOrCt
    : (headersOrCt && typeof headersOrCt.get === 'function'
        ? headersOrCt.get('content-type') || ''
        : (headersOrCt?.['content-type'] || ''));

  // 1) HTTP Content-Type charset
  let cs = fromContentType(ctValue);
  // 2) HTML <meta charset>
  if (!cs) cs = fromMetaCharset(buffer);
  // 3) 기본값 utf-8
  if (!cs) cs = 'utf-8';

  let text  = decodeWith(buffer, cs);
  let ratio = garbledRatio(text);

  // 깨짐 비율 5% 초과 시 cp949 → euc-kr 순 재시도
  if (ratio > 0.05) {
    for (const fallback of ['cp949', 'euc-kr', 'utf-8']) {
      if (normalize(fallback) === cs) continue;
      const t2 = decodeWith(buffer, fallback);
      const r2 = garbledRatio(t2);
      if (r2 < ratio) {
        text  = t2;
        cs    = fallback;
        ratio = r2;
        if (ratio === 0) break;
      }
    }
  }

  return { text, encoding: cs, ratio };
}
