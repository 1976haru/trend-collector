# 📌 TODO

이번 라운드에서 정리한 작업 / 다음에 할 작업 목록.

## ✅ 완료 (이번 라운드)

- [x] 평면적 jsx 파일을 `src/` 구조로 정리 (components / hooks / services / utils / constants)
- [x] `index.html`, `src/main.jsx`, `vite.config.js` 추가 — `npm run dev`/`build` 동작
- [x] `.gitignore` 와 `.env.example` 추가, `.env` 커밋 차단
- [x] `Header.jsx`, `TabBar.jsx` 신규 작성 (App.jsx 가 import 만 하고 파일이 없던 문제 해결)
- [x] `dateUtils.js`, `filterUtils.js`, `pdfUtils.js` 신규 작성
- [x] `mediaList.js` 신규 작성 — 중앙/지방/인터넷/지역 분류 헬퍼
- [x] 포함/제외 키워드 분리 + AND 검색 토글
- [x] URL + 정규화된 제목 기준 중복 제거
- [x] 광고/홍보성 기사 자동 필터 (off 가능)
- [x] 키워드 급상승 감지 (직전 수집과 비교)
- [x] 보고서 PDF 템플릿: 요약 / 주요 이슈 / 시사점 / 참고 링크
- [x] 일간 / 주간 보고서 토글
- [x] `SentimentPanel.jsx` 의 잘못된 `import { fmtDay: fmtDay }` 구문 버그 수정
- [x] 깨진 README 를 실제 프로젝트 구조 기준으로 다시 작성
- [x] 저장소 루트의 `files (2).zip` 정리

## 🔜 우선순위 백로그

### P1 — 보고서 / 발송 안정화
- [ ] PDF 에 사용자가 정한 보고서 머리말(부서명·작성자) 입력란 추가
- [ ] 일간 보고서 자동화: 매일 정해진 시각에 PDF 생성 + 메일 작성창 자동 열기
- [ ] 주간 보고서 (월~일) 집계 — 키워드별 일자별 표
- [ ] EmailJS 사용 시 첨부파일(PDF) 함께 보내는 옵션 (현재는 본문만)
- [ ] 다중 수신자(현재 최대 3명)를 그룹(예: "팀장단", "기자단")으로 저장

### P2 — 수집 정확도
- [ ] 매체별 화이트리스트 / 블랙리스트 (특정 언론사만 / 제외)
- [ ] 동일 사건 군집화 (제목 유사도 + Levenshtein)
- [ ] 본문 미리보기(외부 페이지 fetch) — CORS 프록시 한계 고려
- [ ] 시간대(예: 최근 24시간 / 7일) 필터

### P3 — 분석
- [ ] Claude API 감성 분석 연동 (백엔드 프록시 경유)
- [ ] 키워드 워드클라우드
- [ ] 보도 추세 라인 차트 (history → 시계열)

### P4 — UX / 운영
- [ ] 다크 모드
- [ ] 모바일 레이아웃 점검
- [ ] 설정 export / import (.json)
- [ ] 다국어 (ko / en)

## 🐞 알려진 이슈

- 브라우저가 닫히면 스케줄이 정지됨 → ROADMAP 의 서버리스 백엔드 항목 참고.
- `api.allorigins.win` 장애 시 수집이 모두 실패 — 대체 프록시 자동 전환 필요.
