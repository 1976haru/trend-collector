// ─────────────────────────────────────────────
// sentiment.js — 키워드 기반 감정 분석 (근거 포함)
// 정밀 분석은 추후 LLM 으로 대체 (ROADMAP).
// ─────────────────────────────────────────────

export const POSITIVE_TERMS = [
  '개선', '증가', '확대', '성공', '선정', '지원', '성장', '회복',
  '수상', '강화', '협력', '추진', '체결', '돌파', '활성화', '호조',
  '신기록', '최대', '발굴', '도약', '안정', '환영', '기대', '호평',
  '완화', '간소화', '개정안 통과', '시행',
];

export const NEGATIVE_TERMS = [
  '논란', '비판', '감소', '축소', '위기', '사고', '부실', '중단',
  '실패', '반발', '의혹', '수사', '구속', '적발', '피해', '불만',
  '항의', '파동', '폭락', '혼란', '책임', '징계', '제재', '경고',
  '우려', '갈등', '저조', '취소', '연기', '부진',
  '구형', '징역', '권력남용', '사퇴', '경질', '국정조사', '특검',
  '기소', '압수수색', '탈주', '참변', '사망',
];

// 단순 행정 / 인사 / 행사성 → 중립 보정
export const NEUTRAL_HINTS = [
  '인사', '행사', '간담회', '브리핑', '정례', '업무보고', '워크숍',
  '기념식', '체결식', '방문', '시찰', '현장', '회의', '협의',
];

// 이슈 유형 분류 — 매칭된 영역으로 라벨링
export const ISSUE_TYPES = [
  { type: '검찰/수사',  keywords: ['검찰', '검사', '수사', '공소', '특검', '기소', '압수수색', '구속'] },
  { type: '교정/처우',  keywords: ['교정', '교도소', '구치소', '재소자', '수형자', '탈주'] },
  { type: '출입국/이민', keywords: ['출입국', '외국인', '난민', '비자', '체류', '불법체류', '이민', '귀화'] },
  { type: '범죄예방',    keywords: ['보호관찰', '전자감독', '전자발찌', '범죄예방', '사회봉사'] },
  { type: '인권',        keywords: ['인권', '차별', '소수자', '국가인권'] },
  { type: '디지털성범죄', keywords: ['디지털성범죄', '딥페이크', '불법촬영', '몸캠'] },
  { type: '마약',        keywords: ['마약', '필로폰', '대마', '약물'] },
  { type: '보이스피싱',  keywords: ['보이스피싱', '전화금융사기'] },
  { type: '인사/행사',   keywords: NEUTRAL_HINTS },
  { type: '입법/법안',   keywords: ['법안', '입법', '개정안', '국회 통과', '법령'] },
];

/**
 * 단일 기사의 감정 라벨 + 근거 산출.
 */
export function scoreSentiment({ title = '', summary = '', contentText = '' } = {}) {
  const text = `${title} ${summary} ${contentText}`;
  const lower = text.toLowerCase();

  const matchedPos = [];
  const matchedNeg = [];
  for (const t of POSITIVE_TERMS) if (text.includes(t)) matchedPos.push(t);
  for (const t of NEGATIVE_TERMS) if (text.includes(t)) matchedNeg.push(t);

  // 단순 인사/행사성 단서
  const hasNeutralHint = NEUTRAL_HINTS.some(t => text.includes(t)) && matchedPos.length === 0 && matchedNeg.length === 0;

  // 이슈 유형 — 첫 매칭
  let issueType = '기타';
  for (const it of ISSUE_TYPES) {
    if (it.keywords.some(k => text.includes(k) || lower.includes(k.toLowerCase()))) {
      issueType = it.type; break;
    }
  }

  // 점수: 부정 가중치 1.2 (보수적)
  const score = matchedPos.length - matchedNeg.length * 1.2;

  let label;
  const reasons = [];

  if (hasNeutralHint) {
    label = '중립';
    reasons.push('단순 인사/행사/일정 보도');
  } else if (score >= 1) {
    label = '긍정';
    reasons.push(`긍정 키워드 ${matchedPos.length}개 매칭 (${matchedPos.slice(0, 5).join(', ')})`);
  } else if (score <= -1) {
    label = '부정';
    reasons.push(`부정 키워드 ${matchedNeg.length}개 매칭 (${matchedNeg.slice(0, 5).join(', ')})`);
    if (matchedPos.length) reasons.push(`(긍정 키워드도 ${matchedPos.length}개 있으나 부정 우세)`);
  } else {
    label = '중립';
    if (matchedPos.length || matchedNeg.length) {
      reasons.push(`긍정 ${matchedPos.length} · 부정 ${matchedNeg.length} 균형`);
    } else {
      reasons.push('감정 키워드 미발견');
    }
  }

  return {
    label,
    score: Number(score.toFixed(2)),
    matchedKeywords: { positive: matchedPos, negative: matchedNeg },
    reasons,
    issueType,
    riskKeywords: matchedNeg,                         // 위험 키워드 = 매칭된 부정 키워드
  };
}

/**
 * 기사 배열에 감정 라벨을 부여하고 집계.
 */
export function analyzeSentiments(articles = []) {
  let positive = 0, negative = 0, neutral = 0;
  for (const a of articles) {
    if (!a.sentiment || !a.sentiment.matchedKeywords) {
      a.sentiment = scoreSentiment(a);
    }
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

  if (negative > positive * 1.3 && summary.negativePct >= 35) summary.overall = '부정 우세';
  else if (positive > negative * 1.3 && summary.positivePct >= 35) summary.overall = '긍정 우세';
  else summary.overall = '중립';

  return summary;
}
