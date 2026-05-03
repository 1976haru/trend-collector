// ─────────────────────────────────────────────
// changelog.js — Trend Collector 버전 변경 이력
//
// 버전 증가 규칙:
//   - x.y.0 (1.0.0 / 1.1.0 / 2.0.0): 기능 추가 / 큰 개선 / 대규모 개편
//   - x.y.z (1.0.1 / 1.0.2):          버그 수정 / UI 미세 개선
//   - 새 항목은 배열 맨 앞에 추가 (최신이 위).
//
// /api/version 응답으로 그대로 노출되며, UpdateNoticeModal 이 lastSeenVersion 과 비교.
// ─────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// package.json 의 version 을 단일 진실 출처로 사용 — 빌드 / 배포 시 수정 필요한 곳을 1곳으로 한정
let _pkg;
function pkg() {
  if (_pkg) return _pkg;
  try { _pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')); }
  catch { _pkg = { version: '1.0.0', name: 'trend-collector' }; }
  return _pkg;
}

export const APP_NAME = 'Trend Collector';

export function getAppVersion() {
  return pkg().version || '1.0.0';
}

// 변경 이력 — 최신이 배열 맨 앞.
export const CHANGELOG = [
  {
    version: '1.2.0',
    date:    '2026-05-03',
    title:   '법무부 공공기관 스타일 UI 적용',
    type:    'minor',
    highlights: [
      'MOJHeader — 정부 공통 상단 바 + 부처 마크 + 슬로건 "국민이 주인인 나라, 함께 행복한 대한민국" + 시스템 상태 배지 4종 (시스템/자동수집/다음수집/Naver)',
      '법무부 컬러 시스템 토큰화 — 남색 #153E75 / 청록 #2F7D7A / 밝은 배경 #F5F7FA / 강조 파랑 #1D70B8 (theme.css 의 CSS 변수)',
      '메인 탭 라벨 정리 — 모니터링 설정 / 수집 리포트 / 메일 수신자 / 관리·설정 / 도움말 (선택 시 진한 남색 배경)',
      '대시보드 액션 — "지금 즉시 수집" 버튼 남색 강조 + 키워드 칩 남색 / 청록 / 파랑 분리',
      '내부 업무 안내 문구 추가 — 공식 사이트 사칭 방지 ("내부 업무 지원 시스템")',
      '로고 슬롯 — public/assets/moj-logo.png 자동 사용 (없으면 태극 풍 fallback)',
      '접근성 개선 — 본문 글자 14px+, 상태는 색+텍스트 동시 표기, 키보드 포커스 가능 버튼',
      '모바일 — 가로 스크롤 탭, 헤더 줄바꿈 자동 대응, 안전영역 패딩',
    ],
    fixes: [],
  },
  {
    version: '1.1.0',
    date:    '2026-05-03',
    title:   '에이전트 분석 워크플로 도입',
    type:    'minor',
    highlights: [
      '에이전트 파이프라인 7개 도입 — 수집 / 관련성 / 위험 / 보고서 / 홍보 / 품질 / 개선 제안',
      '리포트 상세 화면에 "에이전트 분석 결과" 카드 추가 — 7개 섹션을 한 화면에 표시',
      '관리 → 에이전트 설정 — 6개 에이전트 ON/OFF 토글 (수집은 항상 ON)',
      '보고서 작성 에이전트 — 상급자 1페이지 요약 + 일일 보고 + 기승전결 + 대응 권고 + 모니터링 키워드',
      '위험 감지 에이전트 — 부정 비율 / 동일 이슈 반복 / 중앙언론 부정 보도 / 매체 확산 동시 평가',
      '품질 점검 에이전트 — 점수 0-100 + 한글 깨짐 / 추출 실패 / PDF 위험 / 권장 다운로드 형식 산정',
      'Word 9. 에이전트 종합 판단 섹션 + Excel 에이전트분석 / 기사별에이전트점수 시트 추가',
      'LLM 보강 모드 스캐폴딩 — LLM_AGENT_ENABLED + OPENAI_API_KEY/ANTHROPIC_API_KEY 모두 있어야 활성',
    ],
    fixes: [],
  },
  {
    version: '1.0.0',
    date:    '2026-05-01',
    title:   'Trend Collector 1.0 운영 기준판',
    type:    'major',
    highlights: [
      '언론보도 수집 기능 안정화 — Google News RSS / Naver News API / 공식기관 직접 수집 / 사용자 지정 소스 다층 병합',
      '법무부·보호관찰·교정·출입국·검찰·법원 빠른 키워드 + 카테고리 자동 분류',
      '일일 언론보도 리포트 자동 생성 (수동 / 예약)',
      'PDF / Word / Excel / HTML 다운로드 — 편철형 + 분석형 분리',
      '편철형 출력물 색상 모드 — 흑백 편철 / 컬러 이미지 / 전체 컬러',
      '기관 배포자료 자동 추적 + 클릭 수 / 홍보실적 자동 집계',
      '검색 관련성 점수 엔진 + 무관 기사 자동 제외 (스포츠/금융/연예/건강 등)',
      '본문 잡텍스트 (실시간 인기·추천 기사·광고) 자동 정제',
      '기사 제외 / 복원 / 일괄 / 자동 재분석 워크플로',
      'YouTube 관심도 / 영상 반응 분석 (선택 기능)',
      '관리자 설정 화면 — 뉴스 소스 / 추적 링크 / 메일 / 테스트 검색',
    ],
    fixes: [
      'Naver API 환경변수 진단 — Render Free 플랜에서 NAVER_ENABLED 인식 누락 케이스 해결 (TRUE/True/1/yes 모두 정규화)',
      'PDF 한글 폰트 깨짐 — Noto Sans/Serif KR base64 inline 임베드, Render Linux 환경에서도 정상 표시',
      'PDF 생성 timeout — 외부 폰트 / networkidle0 의존 제거, 30건 PDF 생성 5배 단축 (20s → 4s)',
      'Google 검색 누락 — RSS + News HTML + Web HTML 다층 fallback (gbv=1) + 수집 진단 매트릭스 6 소스 분리',
      '본문 추출 실패 시 RSS 메타 합성 + Word/HTML fallback 자동 안내',
    ],
    notes: [
      '본 버전은 운영 전 테스트 기준 버전입니다.',
      '검색 관련성 필터와 자동 제외 기능은 후속 버전에서 지속 개선됩니다.',
      'Render 무료 플랜 사용 시 관리자 저장값이 재배포로 초기화될 수 있으므로 Render Environment 등록 또는 백업/복원 기능 사용을 권장합니다.',
    ],
  },
];

export function getLatest() {
  return CHANGELOG[0] || null;
}
