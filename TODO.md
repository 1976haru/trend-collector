# 📌 TODO

## ✅ 이번 라운드 (기사 전문 PDF · 알림 · UI 통합)

- [x] **기사 본문 추출** — `cheerio` 기반, 휴리스틱 셀렉터 + 광고/추천/기자 제거, 병렬 5, 타임아웃 8초.
- [x] **기사 30건 전문 PDF** — Puppeteer 서버 생성. 표지 / 요약 / 언론분포 / 중복묶기 / 목차 / **기사 30건 전문** / 부록 구성. Noto Sans KR 임베드.
- [x] **PDF 다운로드 endpoint** — `GET /api/reports/:id/pdf` (Content-Disposition attachment, `trend-report-YYYYMMDDHHmm.pdf`).
- [x] **메일 PDF 첨부** — config `attachPdf` 또는 발송 API `attach: true` 시 첨부.
- [x] **스케줄 UI 위치 변경** — “스케줄” 탭 제거 → 키워드 화면 “지금 즉시 수집” 버튼 바로 아래 인라인.
- [x] **위험 분석 강화** — 부정 30% → 주의 / 50% → 긴급 / 급상승 ≥3건 → 주의 등.
- [x] **카카오 알림 구조** — `notifyKakao.js` 스텁, `KAKAO_ENABLED=false` 기본. `/api/health` 에 kakao 상태 노출.
- [x] **본문 토글** — ReportDetail 의 각 기사에 “본문 펼치기/접기” 버튼.
- [x] **위험도 배지** — 리포트 상단 + PDF 표지 + 메일 본문 모두 표시.

## 🔜 P1 다음 우선

- [ ] **Render 환경 Puppeteer 검증** — 실제 Render 빌드/런타임에서 한글 글꼴 렌더링 확인. 필요 시 Pretendard / Noto Sans KR 를 정적 자산으로 번들링하여 외부 CDN 의존 제거.
- [ ] **본문 추출 성공률 모니터링** — 도메인별 성공률 통계, 자주 실패하는 매체에 셀렉터 추가.
- [ ] **카카오 비즈 알림톡 실 발송** — 비즈니스 채널 신청 후 access_token 자동 갱신.
- [ ] **알림 트리거 시 별도 “긴급 메일”** — 현재는 제목 ⚠️ 만. 부정 50%·급상승·중앙·정부 단 발생 시 짧은 알림 메일을 추가 발송.
- [ ] **로그인 시도 제한** — `express-rate-limit` + `helmet`.
- [ ] **`nodemailer` v8 / `node-cron` v4 업그레이드** — `npm audit` high/moderate 해소.

## P2

- [ ] 일·주·월 분석 탭 (기간별 보도량 / 긍부정 / 매체 변화).
- [ ] 리포트 내 키워드 / 매체 검색·필터.
- [ ] Recharts 그래프 도입 (CSS 바를 대체).
- [ ] 수신자 그룹.
- [ ] 본문 LLM 요약 (`OPENAI_API_KEY` 또는 Anthropic 키, 서버 프록시).
- [ ] 본문 추출 도메인별 어댑터 시스템.

## P3

- [ ] **사용자별 계정 + 부서별 권한** (현재는 단일 비밀번호).
- [ ] **DB 마이그레이션** — JSON → SQLite 또는 Postgres.
- [ ] 이슈 임베딩 클러스터링.
- [ ] Slack / Webhook 채널 정식 구현.

## 🐞 알려진 이슈 / 운영 메모

- Render free 플랜은 디스크 휘발성 + 15분 idle sleep — Starter 이상 + Disk 권장.
- Puppeteer 빌드 시 Chromium 다운로드 약 170MB → Render 첫 빌드는 2~3분 소요.
- 본문 추출 성공률은 매체에 따라 60~90%. 실패 시 RSS description 으로 fallback.
- Google News RSS URL 은 `news.google.com/articles/...` 형태로 redirect 되며, 일부 도메인은 redirect 후에도 차단할 수 있음.
- 외부 공개·재배포·상업적 이용 금지. (운영자가 정책 위반 사례를 확인하면 본문 수집을 OFF 로 전환할 수 있도록 `cfg.extractContent=false` 토글이 collector 에 마련되어 있음)
