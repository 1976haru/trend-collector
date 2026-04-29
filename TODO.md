# 📌 TODO

## ✅ MVP 라운드 완료

- [x] 단일 비밀번호 로그인 (ADMIN_PASSWORD HMAC 쿠키)
- [x] Express 백엔드 + Vite SPA 단일 서비스로 통합
- [x] 키워드 / 제외 키워드 / 수신자 — 서버 JSON 파일에 공유 저장
- [x] 즉시 수집 + 매일 정해진 시각 자동 수집 (node-cron, KST)
- [x] SMTP 메일 발송 (nodemailer)
- [x] 최근 리포트 목록 + 새 창 인쇄/PDF 저장 + 메일 재발송
- [x] Render Blueprint (render.yaml) 추가
- [x] 카카오톡 / EmailJS / 클라이언트 RSS / 고급 통계 대시보드 제거
- [x] `data/` 를 `.gitignore` 에, `.env.example` 정비

## 🔜 우선순위 (P1)

- [ ] **PDF 파일 첨부 메일** — 현재는 본문 HTML/텍스트만. Puppeteer 또는 Headless Chromium 으로 PDF 바이너리 생성 후 nodemailer 첨부.
- [ ] **수신자 그룹** — "팀장단 / 실무자 / 전체" 처럼 그룹 단위 발송.
- [ ] **수동 발송 시 제목 / 머리말 입력** — 현재는 기본 제목 자동 생성.
- [ ] **본문 LLM 요약** — `OPENAI_API_KEY` 또는 Anthropic 키로 기사 요약.
- [ ] **로그인 시도 제한** — 같은 IP 가 5회 이상 실패 시 일시 차단 (express-rate-limit).
- [ ] **보호 헤더** — `helmet` 도입.

## P2 — UX

- [ ] 리포트 안에서 검색 / 키워드 필터
- [ ] 리포트 즐겨찾기 (별표) — 별표는 클라이언트 localStorage 로 OK
- [ ] 일간 / 주간 토글 — 주간 보고서는 최근 7일 리포트를 합친 형태로 다시 렌더
- [ ] 다크 모드

## P3 — 운영

- [ ] **Render Disk 또는 외부 DB(Postgres) 마이그레이션** — Free 플랜에서는 재시작 시 `data/` 가 사라지므로.
- [ ] 설정 export / import (JSON)
- [ ] Health 페이지에 마지막 수집 시각 / 다음 cron 시각 노출
- [ ] 컨테이너 / Cloud Run 배포 옵션

## 🐞 알려진 이슈

- Google News RSS 가 일시 502 를 반환할 수 있습니다 → `errors` 배열에 키워드별로 기록되며 다른 키워드 수집은 그대로 진행됩니다.
- 네이버 SMTP 는 PC 웹 메일 설정에서 **POP3/SMTP 사용** 을 켜야 발송됩니다.
- Render free 플랜은 15분 idle 시 sleep → 매일 09:00 cron 이 동작하려면 Starter 이상 권장.
