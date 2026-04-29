# 📌 TODO

## ✅ 이번 라운드 (법무부 특화 + 감정 근거 + PDF 분리 + 피드백 메일)

- [x] **법무부 빠른 키워드** — 핵심·기관·정책 3개 카테고리, 접기/펼치기 UI.
- [x] **수집 기간 필터** — 24시간 / 3·7·14·30일 / 직접 설정. `publishedAt` 기준 + 기간 외·파싱 실패 카운트.
- [x] **PDF preview/download 분리** — `/api/reports/:id/pdf/preview` (inline) + `/pdf/download` (attachment).
- [x] **PDF 안정화** — Puppeteer `waitUntil: networkidle0`, `waitForSelector('#report-pdf-root')`, `preferCSSPageSize: true`, `printBackground: true`, **%PDF 매직 검증**, 이미지 onload 대기 (8s timeout 후 진행).
- [x] **감정 분석 근거** — `matchedKeywords {positive, negative}`, `reasons`, `issueType`, `riskKeywords` 저장 및 ReportDetail/PDF 표시.
- [x] **본문 + 이미지 PDF 포함** — og:image + 본문 inline image 최대 3개. PDF에 이미지 포함 ON/OFF 토글.
- [x] **법무부 보고서 문장** — 총평 / 주요 보도 동향 / 대응 필요 이슈 / 관련 부서 참고사항 4단 구조.
- [x] **관련 부서 자동 추천** — 9개 부서 매핑, 기사별 부서 태그 + 부서별 보도량 패널.
- [x] **대응 우선순위** — 긴급 / 주의 / 참고. 감정·매체·부정 키워드 수로 산출.
- [x] **기능 개선 제안 모달 + `/api/feedback` 메일 발송**.
- [x] **헤더 “기능 개선 제안하기” 버튼**.
- [x] **자동 보고서 제목** — “2026년 4월 29일 법무부 언론보고…”.

## 🔜 P1 다음 우선

- [ ] **부정 비율 30% 이상 / 중앙언론 + 부정 시 별도 “긴급 메일”** — 현재는 제목 ⚠️ 까지만.
- [ ] **언론사별 반복 보도 추적** — 같은 매체가 동일 키워드를 반복 보도하면 표시.
- [ ] **기간별 비교** — 오늘 vs 전일, 이번 주 vs 지난주.
- [ ] **관리자용 설정 페이지** — 기본 수집 기간 / PDF 이미지 포함 / 관리자 이메일 / 키워드 프리셋 관리.
- [ ] **로그인 시도 제한** + `helmet`.
- [ ] Render 환경에서 한글 폰트 검증 (Noto Sans KR CDN). 필요 시 정적 번들링.
- [ ] `nodemailer` v8 / `node-cron` v4 업그레이드 (audit high/moderate 해소).

## P2

- [ ] LLM 요약 (`OPENAI_API_KEY` 또는 Anthropic) — 본문 1~3줄 자동 요약.
- [ ] 카카오 비즈 알림톡 실 발송.
- [ ] PDF 첨부파일 모달에서 첨부파일 업로드 지원 (현재 텍스트만).
- [ ] 본문 추출 도메인별 어댑터 — 매체별 셀렉터 미세 조정.
- [ ] 주·월 분석 탭.

## P3

- [ ] **사용자별 계정 + 부서별 권한** (현재는 단일 비밀번호).
- [ ] **DB 마이그레이션** — JSON → SQLite/Postgres.
- [ ] 이슈 임베딩 클러스터링.
- [ ] Slack / Webhook 채널.

## 🐞 운영 메모

- Render free 플랜은 디스크 휘발성 + 15분 idle sleep — Starter 이상 + Disk 권장.
- Puppeteer 빌드 시 Chromium ~170MB 다운로드 → Render 첫 빌드 2~3분.
- 본문 추출 성공률 ~80% (Google News redirect 해석 후). 매체 차단 / 봇 검사로 일부 실패는 정상.
- 외부 공개·재배포·상업적 이용 금지. (`cfg.extractContent=false` 로 본문 수집을 끌 수 있음)
