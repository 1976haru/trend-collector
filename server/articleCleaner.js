// ─────────────────────────────────────────────
// articleCleaner.js — 기사 본문 잡텍스트 제거
//
// 본문 추출 결과에 다음이 섞여 들어와 감정분석 / 관련성 판단을 오염시키는 경우가 많다:
//   - "많이 본 뉴스" / "실시간 인기 기사" / "추천 기사" / "관련 기사"
//   - 회사소개 / 광고·제휴문의 / 이용약관 / 무단전재 금지
//   - 좋아요/슬퍼요/화나요/팬이에요/후속기사 원해요
//   - 네이버 "AI 자동 인식" 안내 / 댓글 안내
//
// 본 모듈은 cleanText (잡텍스트 제거 후 본문) + boilerplateRatio (잡텍스트 비율) +
// bodyQualityScore (0~100) 를 반환한다. relevanceScorer 가 이 정보를 사용해 감점.
// ─────────────────────────────────────────────

// 잡텍스트 식별 패턴 — 한 줄/문단 단위로 매칭. 빈도 높은 한국 언론사 공통.
const NOISE_LINE_PATTERNS = [
  /실시간\s*(주요|인기)?\s*뉴스/,
  /많이\s*본\s*뉴스/,
  /(주요|인기|추천|관련|최신)\s*기사(\s*더보기)?/,
  /기자\s*추천\s*기사/,
  /다른\s*사람들이\s*많이\s*본/,
  /베스트\s*추천/,
  /주간\s*인기\s*기사/,
  /지금\s*뜨는\s*기사/,
  /TOP\s*\d+\s*기사/i,
  /본문의\s*검색\s*링크는\s*AI/,             // 네이버
  /이\s*기사를\s*추천합니다/,
  /후속\s*기사를?\s*원해요/,
  /기사\s*저장.*마이페이지/,
  /^(좋아요|슬퍼요|화나요|훈훈해요|놀랐어요|팬이에요)(\s*\d+)?$/,
  /(회원가입|로그인)\s*후\s*댓글/,
  /무단\s*전재\s*및?\s*재배포\s*금지/,
  /(c|copyright)\s*\S{2,30}\s*(all\s*rights\s*reserved|무단\s*전재)/i,
  /(전화|팩스|이메일|fax|tel)\s*[:：]\s*\S+/i,
  /광고\s*[·\-/]\s*제휴\s*문의/,
  /이용약관|개인정보\s*처리(방침|정책)/,
  /구독\s*신청|이메일\s*뉴스레터\s*(구독|받기)/,
  /^(네이버|다음|카카오)\s*뉴스(에서)?\s*(이|본)\s*기사/,
  /^\s*\[(앵커멘트|VTR|영상편집|화면제공|자료제공|자료사진)\]/,
  /^\s*기자\s*[\:：]\s*\S+\s*(jane|kim|lee|park|choi|jung|cho|song)?@/i,
];

// 강한 잡텍스트 — 한 번이라도 매칭되면 큰 비율로 카운트
const STRONG_NOISE_PATTERNS = [
  /많이\s*본\s*뉴스/,
  /실시간\s*인기\s*기사/,
  /추천\s*기사/,
  /AI\s*자동\s*인식/,
];

function isShortLine(line) {
  return line.replace(/\s+/g, '').length <= 3;
}

/**
 * @param {string} rawText — 본문 (text 또는 HTML stripped)
 * @returns {{ cleanText, removedBlocksCount, boilerplateRatio, bodyQualityScore, removedSamples }}
 */
export function cleanArticleContent(rawText = '') {
  const text = String(rawText || '');
  if (!text.trim()) return { cleanText: '', removedBlocksCount: 0, boilerplateRatio: 0, bodyQualityScore: 0, removedSamples: [] };

  const lines = text.split(/\n|<br\s*\/?>/i).map(s => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
  const kept = [];
  const removed = [];
  let strongHits = 0;

  // "많이 본 뉴스" 등 강한 cut marker — 매칭되면 그 라인 이후 전체 cut
  const HARD_CUT_PATTERNS = [
    /(많이\s*본\s*뉴스)/, /(실시간\s*인기\s*기사)/, /(추천\s*기사)/,
    /(주간\s*인기\s*기사)/, /(지금\s*뜨는\s*기사)/,
  ];

  // 1) 라인 단위 필터
  let cutEncountered = false;
  for (const line of lines) {
    if (cutEncountered) { removed.push(line); continue; }
    if (!line) continue;
    // 강한 cut marker — 이 라인부터 끝까지 모두 제거
    let hardCut = false;
    for (const pat of HARD_CUT_PATTERNS) {
      if (pat.test(line)) { hardCut = true; strongHits++; break; }
    }
    if (hardCut) {
      cutEncountered = true;
      removed.push(line);
      continue;
    }
    let matched = false;
    for (const pat of NOISE_LINE_PATTERNS) {
      if (pat.test(line)) { matched = true; break; }
    }
    if (matched) {
      removed.push(line);
      for (const p of STRONG_NOISE_PATTERNS) if (p.test(line)) { strongHits++; break; }
      continue;
    }
    kept.push(line);
  }

  // 2) 잡텍스트 블록 — "많이 본 뉴스" 다음 줄부터 끝까지 잘라내기
  //    한국 언론 페이지는 보통 본문 종료 후 추천 영역이 길게 이어진다.
  let cleanText = kept.join('\n').trim();
  const cutMarkers = [
    /(많이\s*본\s*뉴스)/,
    /(실시간\s*인기\s*기사)/,
    /(추천\s*기사)/,
    /(관련\s*기사)/,
    /(주간\s*인기\s*기사)/,
    /(지금\s*뜨는)/,
  ];
  for (const m of cutMarkers) {
    const hit = cleanText.match(m);
    if (hit && hit.index > 30) {  // 본문 30자 이상이면 잡텍스트 cut
      cleanText = cleanText.slice(0, hit.index).trim();
      break;
    }
  }

  // 3) 통계
  const totalLen = text.length || 1;
  const cleanLen = cleanText.length;
  const boilerplateRatio = Math.max(0, Math.min(1, 1 - cleanLen / totalLen));
  // bodyQualityScore — 0~100
  //   기준: cleanLen 비율 + strongHits 페널티
  let q = Math.round((cleanLen / totalLen) * 100);
  q -= strongHits * 8;
  q = Math.max(0, Math.min(100, q));

  return {
    cleanText,
    removedBlocksCount: removed.length,
    boilerplateRatio:   Number(boilerplateRatio.toFixed(3)),
    bodyQualityScore:   q,
    removedSamples:     removed.slice(0, 5),
  };
}
