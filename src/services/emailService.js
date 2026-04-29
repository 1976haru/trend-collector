// ─────────────────────────────────────────────
// emailService.js — EmailJS 기반 이메일 발송
// 사용자가 emailjs.com에서 무료 계정 생성 필요
// 무료: 200건/월
// ─────────────────────────────────────────────

import emailjs from '@emailjs/browser';

let initialized = false;

/**
 * EmailJS 초기화 (설정에서 공개키 입력 후 호출)
 */
export function initEmail(publicKey) {
  if (!publicKey) return;
  emailjs.init(publicKey);
  initialized = true;
}

/**
 * 이메일 발송
 * @param {Object} cfg - { serviceId, templateId, toEmail, toName }
 * @param {Array}  articles - 뉴스 기사 배열
 * @param {string} reportDate - 발송 날짜 문자열
 */
export async function sendEmail({ serviceId, templateId, toEmail, toName }, articles, reportDate) {
  if (!initialized) throw new Error('EmailJS가 초기화되지 않았습니다. 설정에서 공개키를 입력하세요.');
  if (!serviceId || !templateId) throw new Error('서비스 ID와 템플릿 ID를 입력하세요.');

  const summary = buildEmailSummary(articles, reportDate);

  const templateParams = {
    to_email:    toEmail,
    to_name:     toName || '담당자',
    report_date: reportDate,
    total_count: articles.length,
    keyword_list: [...new Set(articles.map(a => a.keyword))].join(', '),
    news_summary: summary,
    app_name:    'Trend Collector v1',
  };

  const result = await emailjs.send(serviceId, templateId, templateParams);
  return result;
}

/**
 * mailto: 링크로 기본 메일 앱 열기 (EmailJS 설정 없어도 작동)
 */
export function openMailtoLink({ toEmail, subject, articles, reportDate }) {
  const body = buildEmailBody(articles, reportDate);
  const sub  = encodeURIComponent(subject || `[Trend Collector] ${reportDate} 언론보도 스크랩`);
  const bdy  = encodeURIComponent(body);
  const to   = encodeURIComponent(toEmail || '');
  window.open(`mailto:${to}?subject=${sub}&body=${bdy}`, '_blank');
}

export function openGmailLink({ toEmail, articles, reportDate }) {
  const sub  = encodeURIComponent(`[Trend Collector] ${reportDate} 언론보도 스크랩`);
  const body = encodeURIComponent(buildEmailBody(articles, reportDate));
  window.open(`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(toEmail)}&su=${sub}&body=${body}`, '_blank');
}

export function openNaverMailLink({ toEmail, articles, reportDate }) {
  const sub  = encodeURIComponent(`[Trend Collector] ${reportDate} 언론보도 스크랩`);
  const body = encodeURIComponent(buildEmailBody(articles, reportDate));
  window.open(`https://mail.naver.com/write/popup?to=${encodeURIComponent(toEmail)}&subject=${sub}&body=${body}`, '_blank');
}

// ── 내부 유틸 ──────────────────────────────

function buildEmailSummary(articles, reportDate) {
  return articles.slice(0, 20).map((a, i) =>
    `${i + 1}. [${a.source}] ${a.date}\n${a.title}\n${a.summary}\n`
  ).join('\n');
}

function buildEmailBody(articles, reportDate) {
  const keywords = [...new Set(articles.map(a => a.keyword))].join(', ');
  let body = `[Trend Collector v1] 언론보도 스크랩\n`;
  body += `수집일시: ${reportDate} | 키워드: ${keywords} | 총 ${articles.length}건\n`;
  body += '='.repeat(50) + '\n\n';
  articles.forEach((a, i) => {
    body += `${i + 1}. [${a.source}] ${a.date}\n${a.title}\n${a.summary}\n`;
    if (a.url) body += `링크: ${a.url}\n`;
    body += '\n';
  });
  return body;
}
