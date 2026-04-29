// ─────────────────────────────────────────────
// kakaoService.js — 카카오톡 나에게 보내기
// 카카오 개발자 계정 무료 등록 필요
// https://developers.kakao.com
// ─────────────────────────────────────────────

let kakaoReady = false;

/**
 * Kakao SDK 초기화
 * @param {string} jsKey - 카카오 JavaScript 앱 키
 */
export function initKakao(jsKey) {
  if (!jsKey || typeof window.Kakao === 'undefined') return false;
  if (!window.Kakao.isInitialized()) {
    window.Kakao.init(jsKey);
  }
  kakaoReady = true;
  return true;
}

/**
 * 카카오 로그인
 */
export function kakaoLogin() {
  return new Promise((resolve, reject) => {
    if (!kakaoReady) { reject(new Error('Kakao SDK 미초기화')); return; }
    window.Kakao.Auth.login({
      success: () => resolve(true),
      fail:    err => reject(new Error(err.error_description || '로그인 실패')),
    });
  });
}

/**
 * 카카오 로그아웃
 */
export function kakaoLogout() {
  if (window.Kakao?.Auth?.getAccessToken()) {
    window.Kakao.Auth.logout();
  }
}

/**
 * 로그인 여부 확인
 */
export function isKakaoLoggedIn() {
  return kakaoReady && !!window.Kakao?.Auth?.getAccessToken();
}

/**
 * 나에게 뉴스 스크랩 보내기
 */
export async function sendKakaoMessage(articles, reportDate) {
  if (!isKakaoLoggedIn()) throw new Error('카카오 로그인이 필요합니다.');

  const keywords = [...new Set(articles.map(a => a.keyword))].join(', ');
  const preview  = articles.slice(0, 5).map((a, i) =>
    `${i + 1}. [${a.source}] ${a.title}`
  ).join('\n');

  const messageText = [
    `📰 Trend Collector v1`,
    `📅 ${reportDate}`,
    `🔑 ${keywords}`,
    `📊 총 ${articles.length}건 수집`,
    '',
    preview,
    articles.length > 5 ? `\n...외 ${articles.length - 5}건` : '',
  ].join('\n');

  return new Promise((resolve, reject) => {
    window.Kakao.API.request({
      url: '/v2/api/talk/memo/default/send',
      data: {
        template_object: {
          object_type: 'text',
          text: messageText,
          link: {
            mobile_web_url: window.location.href,
            web_url:        window.location.href,
          },
          button_title: '앱 열기',
        },
      },
      success: resolve,
      fail:    err => reject(new Error(err.msg || '카카오 전송 실패')),
    });
  });
}

/**
 * 카카오링크로 공유 (로그인 불필요, 더 간단)
 * 단, 수신자를 직접 선택해야 함
 */
export function shareViaKakaoLink(articles, reportDate) {
  if (!kakaoReady) throw new Error('Kakao SDK 미초기화');
  const keywords = [...new Set(articles.map(a => a.keyword))].join(', ');

  window.Kakao.Share.sendDefault({
    objectType: 'text',
    text: `📰 [Trend Collector] ${reportDate}\n키워드: ${keywords}\n총 ${articles.length}건 수집`,
    link: {
      mobileWebUrl: window.location.href,
      webUrl:       window.location.href,
    },
  });
}
