// ─────────────────────────────────────────────
// sentiment.js — 키워드 기반 1차 감정 분석
// 정밀 분석은 추후 LLM 으로 대체 예정 (ROADMAP).
// ─────────────────────────────────────────────

export const POSITIVE_TERMS = [
  '개선', '증가', '확대', '성공', '선정', '지원', '성장', '회복',
  '수상', '강화', '협력', '추진', '체결', '돌파', '활성화', '호조',
  '신기록', '최대', '발굴', '도약', '안정', '환영', '기대', '호평',
];

export const NEGATIVE_TERMS = [
  '논란', '비판', '감소', '축소', '위기', '사고', '부실', '중단',
  '실패', '반발', '의혹', '수사', '구속', '적발', '피해', '불만',
  '항의', '파동', '폭락', '혼란', '책임', '징계', '제재', '경고',
  '우려', '갈등', '저조', '취소', '연기', '부진',
];

/**
 * 단일 기사의 감정 라벨 산출.
 * @param {Object} article { title, summary }
 * @returns {Object} { label: '긍정'|'부정'|'중립', score: number, hits: { pos, neg } }
 */
export function scoreSentiment({ title = '', summary = '' } = {}) {
  const text = `${title} ${summary}`.toLowerCase();
  let pos = 0, neg = 0;
  for (const t of POSITIVE_TERMS) if (text.includes(t)) pos++;
  for (const t of NEGATIVE_TERMS) if (text.includes(t)) neg++;

  // 부정 키워드는 가중치 1.2 — 일반적으로 부정 표현이 보수적으로 잡혀야 신뢰도가 높음
  const score = pos - neg * 1.2;
  let label;
  if (score >= 1)       label = '긍정';
  else if (score <= -1) label = '부정';
  else                  label = '중립';

  return { label, score: Number(score.toFixed(2)), hits: { pos, neg } };
}

/**
 * 기사 배열에 감정 라벨을 부여하고, 집계 결과를 반환한다.
 */
export function analyzeSentiments(articles = []) {
  let positive = 0, negative = 0, neutral = 0;
  for (const a of articles) {
    if (!a.sentiment) a.sentiment = scoreSentiment(a);
    if (a.sentiment.label === '긍정')      positive++;
    else if (a.sentiment.label === '부정') negative++;
    else                                    neutral++;
  }
  const total = articles.length || 1;
  const pct = (n) => Math.round((n / total) * 100);
  const summary = {
    total: articles.length,
    positive, negative, neutral,
    positivePct: pct(positive),
    negativePct: pct(negative),
    neutralPct:  pct(neutral),
  };

  // 전체 분위기
  if (negative > positive * 1.3 && summary.negativePct >= 35) summary.overall = '부정 우세';
  else if (positive > negative * 1.3 && summary.positivePct >= 35) summary.overall = '긍정 우세';
  else summary.overall = '중립';

  return summary;
}
