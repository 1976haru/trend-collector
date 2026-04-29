// ─────────────────────────────────────────────
// departments.js — 법무부 키워드 → 관련 부서 매핑
// 기사의 키워드 / 제목 / 요약 / 본문 매칭으로 1차 부서 추천.
// ─────────────────────────────────────────────

export const DEPARTMENTS = [
  {
    code: 'imm',
    name: '출입국·외국인정책본부',
    matches: ['출입국', '외국인', '난민', '비자', '체류', '여권', '불법체류', '이민', '귀화', '재외동포'],
  },
  {
    code: 'corr',
    name: '교정본부',
    matches: ['교정', '교도소', '구치소', '재소자', '수형자', '소년원', '교정공무원', '치료감호'],
  },
  {
    code: 'crim',
    name: '범죄예방정책국',
    matches: ['보호관찰', '전자감독', '전자발찌', '범죄예방', '사회봉사', '소년보호', '약물치료'],
  },
  {
    code: 'pros',
    name: '검찰국',
    matches: ['검찰', '검사', '공소', '기소', '특검', '수사', '검찰개혁', '형사사법', '공판'],
  },
  {
    code: 'human',
    name: '인권국',
    matches: ['인권', '차별', '국가인권', '소수자', '여성권', '아동권', '장애인 인권'],
  },
  {
    code: 'legal',
    name: '법무실',
    matches: ['법무', '법령', '법안', '입법', '국가배상', '소송', '국유재산'],
  },
  {
    code: 'victim',
    name: '범죄피해자지원',
    matches: ['범죄피해자', '피해자 지원', '범죄피해', '스토킹 피해', '아동학대 피해'],
  },
  {
    code: 'digital',
    name: '디지털성범죄·사이버수사',
    matches: ['디지털성범죄', '딥페이크', '몸캠', '불법촬영', '리벤지포르노', '사이버범죄'],
  },
  {
    code: 'drug',
    name: '마약·조직범죄 대응',
    matches: ['마약', '필로폰', '대마', '약물', '조직범죄', '보이스피싱', '전화금융사기'],
  },
  {
    code: 'plan',
    name: '기획조정실',
    matches: ['예산', '조직개편', '인력', '정원', '국정과제', '업무계획', '평가', '국정감사'],
  },
  {
    code: 'spokes',
    name: '대변인실',
    matches: ['해명', '입장문', '브리핑', '논평', '기자회견', '보도참고자료', '반박', '발표'],
  },
];

/**
 * 기사 1건의 텍스트로 관련 부서 코드 목록을 반환한다.
 */
export function suggestDepartments(article = {}) {
  const hay = [
    article.title || '',
    article.summary || '',
    article.contentText || '',
    article.keyword || '',
  ].join(' ').toLowerCase();

  const hits = [];
  for (const d of DEPARTMENTS) {
    if (d.matches.some(m => hay.includes(m.toLowerCase()))) {
      hits.push({ code: d.code, name: d.name });
    }
  }
  return hits;
}

/**
 * 리포트 전체에서 부서별 빈도 집계.
 */
export function countDepartments(articles = []) {
  const counts = {};
  for (const a of articles) {
    for (const d of (a.departments || [])) {
      counts[d.name] = (counts[d.name] || 0) + 1;
    }
  }
  return counts;
}
