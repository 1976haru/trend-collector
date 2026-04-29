// ─────────────────────────────────────────────
// notifyKakao.js — 카카오톡 알림 스텁
// 환경변수 KAKAO_ENABLED='true' 일 때만 실제 호출 (현재는 미구현 — 구조만 제공)
// ─────────────────────────────────────────────

export function isKakaoEnabled() {
  return process.env.KAKAO_ENABLED === 'true' && !!process.env.KAKAO_ACCESS_TOKEN;
}

/**
 * 리포트 알림 메시지를 카카오로 전송 (현재는 stub).
 * 실제 구현 예시:
 *   POST https://kapi.kakao.com/v2/api/talk/memo/default/send
 *   Authorization: Bearer ${KAKAO_ACCESS_TOKEN}
 *   body: template_object (text 또는 template_id)
 *
 * 운영 도입 시:
 *   1) 카카오 비즈니스 채널 알림톡 신청 (유료) — 권장
 *   2) 또는 사용자 본인 인증 후 access_token 으로 '나에게 보내기'
 */
export async function sendKakao({ message, link } = {}) {
  if (!isKakaoEnabled()) {
    return { sent: false, reason: 'KAKAO_ENABLED !== true (스텁 상태)' };
  }
  // 실제 호출은 구조만 표시 — 운영 시 활성화.
  // const res = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
  //   method: 'POST',
  //   headers: {
  //     Authorization: `Bearer ${process.env.KAKAO_ACCESS_TOKEN}`,
  //     'Content-Type': 'application/x-www-form-urlencoded',
  //   },
  //   body: new URLSearchParams({
  //     template_object: JSON.stringify({
  //       object_type:    'text',
  //       text:           message,
  //       link: { web_url: link || '', mobile_web_url: link || '' },
  //     }),
  //   }),
  // });
  return { sent: false, reason: 'not-implemented (P2)' };
}

export function buildReportMessage(report, baseUrl) {
  const total = report.articles?.length || 0;
  const neg   = report.sentiment?.negative || 0;
  const trend = report.trending?.length || 0;
  const kw    = (report.keywords || []).join(', ');
  const link  = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/reports/${encodeURIComponent(report.id)}/pdf` : '';
  return [
    `[Trend Collector]`,
    `${kw} 관련 ${total}건 수집 완료`,
    `- 부정 ${neg}건${trend ? `, 급상승 ${trend}건` : ''}`,
    `- 위험 등급: ${report.riskLevel?.level || '안정'}`,
    link ? `- PDF: ${link}` : '',
  ].filter(Boolean).join('\n');
}
