// ─────────────────────────────────────────────
// imageCache.js — 외부 이미지를 서버에서 다운로드하여 base64 data URL 로 변환
// PDF 의 외부 이미지 로딩 실패(CORS / hotlink / lazy-load / mixed content) 회피.
// ─────────────────────────────────────────────

const TIMEOUT_MS    = 8000;
const MAX_BYTES     = 5_000_000;        // 이미지 1개 5MB 상한
const USER_AGENT    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// 동일 URL 중복 다운로드 방지 — 짧은 in-memory LRU
const cache = new Map();
const CACHE_MAX = 200;

function rememberCache(url, value) {
  if (cache.size >= CACHE_MAX) {
    // 가장 오래된 키 제거
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(url, value);
}

/**
 * 외부 이미지를 fetch 후 data URL 로 변환. 실패 시 null 반환.
 * @param {string} imageUrl
 * @param {string} refererUrl  (hotlink 차단 회피용)
 * @returns {Promise<string|null>}  data:image/...;base64,…  또는 null
 */
export async function fetchImageAsDataUrl(imageUrl, refererUrl = '') {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return null;
  if (cache.has(imageUrl)) return cache.get(imageUrl);

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const headers = {
      'User-Agent':      USER_AGENT,
      'Accept':          'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7',
    };
    if (refererUrl) headers['Referer'] = refererUrl;

    const res = await fetch(imageUrl, { headers, redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) { rememberCache(imageUrl, null); return null; }
    let ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\//.test(ct)) {
      // 일부 서버가 octet-stream 반환 — URL 확장자로 추정
      const ext = (imageUrl.split('?')[0].match(/\.([a-z0-9]{2,5})$/i) || [, ''])[1].toLowerCase();
      const guess = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
                      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
                      avif: 'image/avif', bmp: 'image/bmp' }[ext];
      if (!guess) { rememberCache(imageUrl, null); return null; }
      ct = guess;
    }
    // 크기 가드 — 응답 헤더 우선
    const cl = Number(res.headers.get('content-length') || 0);
    if (cl && cl > MAX_BYTES) { rememberCache(imageUrl, null); return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) { rememberCache(imageUrl, null); return null; }
    if (buf.length < 200)       { rememberCache(imageUrl, null); return null; } // 트래킹 픽셀 가드
    const dataUrl = `data:${ct};base64,${buf.toString('base64')}`;
    rememberCache(imageUrl, dataUrl);
    return dataUrl;
  } catch {
    rememberCache(imageUrl, null);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 리포트 1건의 모든 이미지(leadImage + images[])를 data URL 로 변환한다.
 * 원본 article 객체를 변경하지 않고 deep-copy 후 반환.
 * @returns {Promise<{ report, stats: { total, succeeded, failed } }>}
 */
export async function embedImagesInReport(report, opts = {}) {
  const { limit = 6, includeImages = true } = opts;
  if (!includeImages) {
    return {
      report: JSON.parse(JSON.stringify(report)),
      stats: { total: 0, succeeded: 0, failed: 0 },
    };
  }

  // 깊은 복사 후 변환 (저장된 원본은 외부 URL 유지)
  const copy = JSON.parse(JSON.stringify(report));
  const articles = copy.articles || [];

  // 이미지 작업 목록 만들기
  const tasks = [];
  for (const art of articles) {
    const ref = art.resolvedUrl || art.url || '';
    const list = (art.images || []).slice(0, 3);
    for (let i = 0; i < list.length; i++) {
      const img = list[i];
      if (!img || !img.url || /^data:/i.test(img.url)) continue;
      tasks.push({ art, img, ref });
    }
    // leadImage 가 별도로 있고 images 에 포함 안되어있을 경우
    if (art.leadImage && !list.some(x => x?.url === art.leadImage)) {
      tasks.push({ art, img: { __lead: true, url: art.leadImage }, ref });
    }
  }

  // 병렬 limit
  let succeeded = 0, failed = 0;
  for (let i = 0; i < tasks.length; i += limit) {
    const chunk = tasks.slice(i, i + limit);
    await Promise.all(chunk.map(async (t) => {
      const data = await fetchImageAsDataUrl(t.img.url, t.ref);
      if (data) {
        if (t.img.__lead) {
          // leadImage 만 있는 경우 → images 에 head 로 삽입
          t.art.images = [{ url: data, caption: '' }, ...(t.art.images || [])];
          t.art.leadImage = data;
        } else {
          t.img.url = data;
        }
        succeeded++;
      } else {
        failed++;
      }
    }));
  }

  // 통계
  const articleHasImg = articles.filter(a => (a.images || []).some(im => /^data:/i.test(im?.url || ''))).length;
  copy.pdfImageStats = {
    total: tasks.length,
    succeeded,
    failed,
    articlesWithImage: articleHasImg,
    articleTotal: articles.length,
  };
  return { report: copy, stats: copy.pdfImageStats };
}
