// ─────────────────────────────────────────────
// clippingPresets.js — 편철형 출력 템플릿 프리셋
// 공공기관별 표지 / 중앙 박스 문구 / 기본 키워드 / 배치 / 분석 부록 기본값.
// ─────────────────────────────────────────────

export const PRESET_LIST = [
  {
    id: 'moj-criminal',
    label: '법무·검찰 관련기사',
    settings: {
      title:        '법무·검찰 관련기사',
      issueLabel:   '석간',
      mainBoxTitle:'법무·검찰',
      mainBoxSub:  '(경찰·공수처)',
      extraTag1:   '법원',
      extraTag2:   '기타',
      organization:'대변인실',
      sortBy:      'media',
      pageLayout:  'media',
      includeAnalysisAppendix: false,
      defaultKeywords: ['법무부', '검찰', '경찰', '공수처', '법원'],
    },
  },
  {
    id: 'probation',
    label: '보호관찰 관련기사',
    settings: {
      title:        '보호관찰 관련기사',
      issueLabel:   '조간',
      mainBoxTitle:'보호관찰',
      mainBoxSub:  '(법무보호)',
      extraTag1:   '청소년',
      extraTag2:   '기타',
      organization:'대변인실',
      sortBy:      'media',
      pageLayout:  'media',
      includeAnalysisAppendix: false,
      defaultKeywords: ['보호관찰', '범죄피해자', '소년사범'],
    },
  },
  {
    id: 'immigration',
    label: '출입국 관련기사',
    settings: {
      title:        '출입국 관련기사',
      issueLabel:   '주간',
      mainBoxTitle:'출입국',
      mainBoxSub:  '(외국인정책)',
      extraTag1:   '난민',
      extraTag2:   '기타',
      organization:'대변인실',
      sortBy:      'media',
      pageLayout:  'media',
      includeAnalysisAppendix: false,
      defaultKeywords: ['출입국', '외국인', '난민', '체류'],
    },
  },
  {
    id: 'corrections',
    label: '교정 관련기사',
    settings: {
      title:        '교정 관련기사',
      issueLabel:   '조간',
      mainBoxTitle:'교정',
      mainBoxSub:  '(교도·구치)',
      extraTag1:   '재소자',
      extraTag2:   '기타',
      organization:'대변인실',
      sortBy:      'media',
      pageLayout:  'media',
      includeAnalysisAppendix: false,
      defaultKeywords: ['교정', '교도소', '구치소', '수용자'],
    },
  },
  {
    id: 'local-press',
    label: '지자체 언론보도',
    settings: {
      title:        '지자체 언론보도',
      issueLabel:   '조간',
      mainBoxTitle:'지자체',
      mainBoxSub:  '(시·도)',
      extraTag1:   '지방',
      extraTag2:   '기타',
      organization:'홍보담당관실',
      sortBy:      'media',
      pageLayout:  'media',
      includeAnalysisAppendix: false,
      defaultKeywords: [],
    },
  },
  {
    id: 'pr-perf',
    label: '공공기관 홍보성과',
    settings: {
      title:        '공공기관 홍보성과',
      issueLabel:   '주간',
      mainBoxTitle:'홍보성과',
      mainBoxSub:  '(배포·재인용)',
      extraTag1:   '재인용',
      extraTag2:   '기타',
      organization:'대변인실',
      sortBy:      'media',
      pageLayout:  'media',
      includeAnalysisAppendix: true,
      defaultKeywords: [],
    },
  },
  {
    id: 'custom',
    label: '사용자 지정',
    settings: {
      title:        '언론 스크랩철',
      issueLabel:   '조간',
      mainBoxTitle:'주제 분류',
      mainBoxSub:  '',
      extraTag1:   '',
      extraTag2:   '기타',
      organization:'대변인실',
      sortBy:      'media',
      pageLayout:  'media',
      includeAnalysisAppendix: false,
      defaultKeywords: [],
    },
  },
];

export function getPreset(id) {
  return PRESET_LIST.find(p => p.id === id) || null;
}

// 보고 생성일 → "YYYY. M. D.(요일)" 표기
export function formatClippingDate(iso) {
  try {
    const d = new Date(iso || Date.now());
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return `${y}. ${m}. ${day}.(${dow})`;
  } catch { return ''; }
}

// 출력 설정 기본값 — 첫 프리셋(법무·검찰) 기준
export function defaultPrintSettings(report) {
  const base = PRESET_LIST[0].settings;
  return {
    presetId:     'moj-criminal',
    title:        base.title,
    dateText:     formatClippingDate(report?.generatedAt),
    issueLabel:   base.issueLabel,
    mainBoxTitle: base.mainBoxTitle,
    mainBoxSub:   base.mainBoxSub,
    extraTag1:    base.extraTag1,
    extraTag2:    base.extraTag2,
    organization: base.organization,
    sortBy:       base.sortBy,        // 'media' | 'date' | 'priority'
    pageLayout:   base.pageLayout,    // 'media' | 'article' | 'compact'
    columnCount:  1,                  // 1 | 2 | 3
    imageMode:    'lead',             // 'none' | 'lead' | 'all'
    showSourceLink: true,
    includeAnalysisAppendix: base.includeAnalysisAppendix,
    printOptimized: true,             // 흑백 인쇄 최적화
  };
}
