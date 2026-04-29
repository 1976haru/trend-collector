// ─────────────────────────────────────────────
// mediaList.js — 전국 언론사 카테고리 목록
// 중앙지 / 경제지 / 방송 / 통신 / 인터넷 / 지방 + 전문지
// 참고용이며 정확한 매체 분류는 추후 보완.
// ─────────────────────────────────────────────

export const MEDIA_BY_CATEGORY = {
  '중앙일간지': [
    '조선일보', '중앙일보', '동아일보', '한겨레', '경향신문',
    '국민일보', '서울신문', '문화일보', '세계일보', '한국일보',
  ],
  '경제지': [
    '매일경제', '한국경제', '머니투데이', '서울경제', '파이낸셜뉴스',
    '아시아경제', '이데일리', '헤럴드경제', '브릿지경제', '뉴스토마토',
  ],
  '방송': [
    'KBS', 'MBC', 'SBS', 'YTN', '연합뉴스TV',
    'JTBC', 'TV조선', '채널A', 'MBN', 'EBS',
  ],
  '통신사': [
    '연합뉴스', '뉴시스', '뉴스1', 'YTN',
  ],
  '인터넷언론': [
    '오마이뉴스', '프레시안', '뉴스타파', '미디어오늘', '데일리안',
    '노컷뉴스', '쿠키뉴스', '아주경제', '한국일보', '디지털타임스',
    '전자신문', '아이뉴스24',
  ],
  '서울/경기': [
    '서울신문', '경기일보', '경인일보', '인천일보', '중부일보', '기호일보',
  ],
  '강원': [
    '강원일보', '강원도민일보',
  ],
  '충청': [
    '대전일보', '중도일보', '충청투데이', '충청일보', '충북일보', '동양일보',
  ],
  '호남': [
    '광주일보', '전남일보', '무등일보', '전북일보', '전북도민일보', '새전북신문',
  ],
  '영남': [
    '매일신문', '영남일보', '대구신문', '경북일보',
    '국제신문', '부산일보',
    '경남신문', '경남도민일보', '경상일보',
  ],
  '제주': [
    '제주일보', '한라일보', '제민일보',
  ],
  '전문지': [
    '디지털타임스', '전자신문', '약업신문', '농민신문', '교육신문',
    '환경일보', '보건신문', '에너지경제', '메디컬타임즈',
  ],
};

export const ALL_MEDIA_FLAT = Array.from(
  new Set(Object.values(MEDIA_BY_CATEGORY).flat())
);

// 중앙지/지방지/인터넷 — 큰 분류 (보고서용)
export const MEDIA_TIER = {
  중앙: [
    ...MEDIA_BY_CATEGORY['중앙일간지'],
    ...MEDIA_BY_CATEGORY['경제지'],
    ...MEDIA_BY_CATEGORY['방송'],
    ...MEDIA_BY_CATEGORY['통신사'],
  ],
  지방: [
    ...MEDIA_BY_CATEGORY['서울/경기'],
    ...MEDIA_BY_CATEGORY['강원'],
    ...MEDIA_BY_CATEGORY['충청'],
    ...MEDIA_BY_CATEGORY['호남'],
    ...MEDIA_BY_CATEGORY['영남'],
    ...MEDIA_BY_CATEGORY['제주'],
  ],
  인터넷: [
    ...MEDIA_BY_CATEGORY['인터넷언론'],
    ...MEDIA_BY_CATEGORY['전문지'],
  ],
};

export function classifyMediaTier(sourceName = '') {
  for (const [tier, list] of Object.entries(MEDIA_TIER)) {
    if (list.some(m => sourceName.includes(m) || m.includes(sourceName))) return tier;
  }
  return '기타';
}

export function classifyRegion(sourceName = '') {
  for (const [region, list] of Object.entries(MEDIA_BY_CATEGORY)) {
    if (list.some(m => sourceName.includes(m) || m.includes(sourceName))) return region;
  }
  return '기타';
}
