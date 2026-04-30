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
