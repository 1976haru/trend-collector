# 📰 Trend Collector — 내부 직원용 MVP

> 키워드 기반 전국 언론보도를 매일 자동 수집해 PDF · 메일로 배포하는 **내부 직원용** 도구.
> 단일 비밀번호 로그인 (회원가입 없음) · 외부 공개 X · Render 한 곳에 배포.

---

## ✨ MVP 핵심 기능

- 🔐 **단일 비밀번호 로그인** (`ADMIN_PASSWORD` 환경변수, 7일 세션 쿠키)
- 🏷 **키워드 / 제외 키워드** 등록 — 모든 직원이 같은 설정 공유
- 📧 **메일 수신자** 등록 — 모든 직원이 같은 목록 공유
- 🔍 **즉시 수집** 버튼 또는 매일 정해진 시각 (REPORT_TIME) **자동 수집**
- 📰 **리포트 목록** — 최근 50개 언제든 다시 열기 / 메일 재발송
- 📄 **PDF 리포트** — 새 창에서 인쇄 다이얼로그 → "PDF 로 저장" (한글 안전)
- ✉️ **SMTP 메일 발송** — Gmail / 네이버 / 회사 SMTP 모두 지원

---

## 🛠 기술 스택

| | |
|------|------|
| 프론트엔드 | React 18 + Vite 5 |
| 백엔드 | Express + cookie-parser + node-cron + nodemailer |
| 인증 | HMAC 서명 쿠키 (httpOnly, sameSite=lax) |
| 저장소 | 서버 로컬 JSON 파일 (`data/config.json`, `data/reports/*.json`) |
| 배포 | Render Web Service (Singapore 권역, free 또는 starter 플랜) |

---

## 🚀 로컬 실행

### 1. 저장소 받기 + 환경변수 설정

```bash
git clone https://github.com/1976haru/trend-collector.git
cd trend-collector
cp .env.example .env
# .env 를 열어 ADMIN_PASSWORD / SMTP_* 값을 채워 넣으세요.
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 개발 서버 (백엔드 + 프론트 동시 실행)

```bash
npm run dev
# → 백엔드: http://localhost:3000
# → 프론트: http://localhost:5173  (자동 열림, /api 는 :3000 으로 프록시)
```

### 4. 운영 모드로 단일 실행 (Render 와 동일한 환경)

```bash
npm run build         # SPA 빌드 (dist/ 생성)
npm start             # Express 가 dist 정적 서빙 + API + cron
# → 한 포트(:3000)에서 모두 서빙: http://localhost:3000
```

---

## ☁️ Render 배포 방법

저장소에 `render.yaml` 이 포함되어 있어 Blueprint 한 번 클릭으로 배포됩니다.

### 절차

1. Render 대시보드 → **New > Blueprint** → 본 저장소 선택.
2. `render.yaml` 의 `sync: false` 변수를 입력하라는 프롬프트가 뜸.
   - `ADMIN_PASSWORD`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `BASE_URL` 등
3. **Apply** → 약 3 ~ 5분 후 배포 완료.
4. 발급된 도메인(예: `https://trend-collector.onrender.com`)에 접속.

### Blueprint 를 쓰지 않고 수동으로 만들 때

- **Type**: Web Service
- **Runtime**: Node
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health`
- **Environment**: 아래 환경변수 입력 (값은 Render UI 에 직접)

### 데이터 영구 보존

Render free 플랜은 디스크가 휘발성이라 재시작 시 `data/` 가 초기화됩니다.
리포트 / 설정을 영구 보존하려면 `render.yaml` 의 `disk:` 블록 주석을 해제하고 (Starter 이상),
`DATA_DIR=/var/data` 를 함께 설정하세요.

---

## 🔧 필요한 환경변수

| 변수 | 필수 | 설명 |
|------|:-:|------|
| `ADMIN_PASSWORD` | ✅ | 직원 공용 로그인 비밀번호 (변경 시 기존 세션 자동 무효화) |
| `SMTP_HOST` | ⭐ | 메일 발송 서버 (예: `smtp.naver.com`, `smtp.gmail.com`) |
| `SMTP_PORT` | ⭐ | 587 (STARTTLS) 또는 465 (SSL) |
| `SMTP_USER` | ⭐ | SMTP 로그인 ID |
| `SMTP_PASS` | ⭐ | SMTP 비밀번호 또는 앱 비밀번호 |
| `SMTP_FROM` | ⭐ | 발신자 표시 (예: `"Trend Collector <id@naver.com>"`) |
| `REPORT_TIME` | | 일일 자동 수집 시각 `HH:MM` (KST). 기본 `09:00` |
| `BASE_URL` | | 메일 본문 링크용 절대 URL (예: `https://trend-collector.onrender.com`) |
| `OPENAI_API_KEY` | | (예약) 추후 본문 자동 요약 기능에서 사용 |
| `DATA_DIR` | | JSON 저장 경로. 기본 `./data` |
| `PORT` | | Render 가 자동 주입. 로컬은 3000 |

⭐ : SMTP 변수 하나라도 빠지면 메일 발송은 비활성화되지만 **수집·리포트 저장 자체는 정상 동작**합니다.

---

## 👤 내부 직원 접속 방법

1. 운영자가 알려준 URL 로 접속:
   ```
   https://trend-collector.onrender.com
   ```
2. 로그인 화면에서 **공용 비밀번호** 입력 → 들어가기.
3. 4개 탭으로 작업:
   - **키워드** — 키워드 / 제외 키워드 등록 + "지금 즉시 수집"
   - **리포트** — 최근 생성된 보고서 목록 / PDF 보기 / 메일 재발송
   - **수신자** — 일일 메일을 받을 이메일 주소 등록
   - **스케줄** — 자동 수집 시각 확인 (변경은 운영자만)

> 하나의 비밀번호를 모든 직원이 공유합니다. 비밀번호를 바꾸면 모든 사람이 다시 로그인해야 합니다.

---

## 🔐 보안 메모

- `.env` 는 `.gitignore` 에 포함 — **절대 GitHub 에 올리지 마세요.**
- `ADMIN_PASSWORD`, SMTP 비밀번호, API Key 는 **반드시 Render 환경변수**로만 관리.
- 세션 쿠키는 `httpOnly` + `sameSite=lax` + 운영시 `secure=true`.
- 외부 공개를 원치 않으면 Render Web Service 의 **Custom Domain** 단계에서 IP 제한 / Cloudflare Access 를 추가하는 것을 권장합니다.

---

## 📁 폴더 구조 (요약)

```
trend-collector/
├── render.yaml                  # Render Blueprint
├── package.json                 # express + nodemailer + node-cron + react/vite
├── vite.config.js               # /api 를 :3000 Express 로 프록시
├── .env.example
├── server/                      # 백엔드 (Express)
│   ├── index.js                 # 진입점 + 라우터 + SPA 정적 서빙
│   ├── auth.js                  # ADMIN_PASSWORD HMAC 쿠키 인증
│   ├── store.js                 # JSON 파일 저장 (config + reports)
│   ├── collector.js             # Google News RSS 직접 수집 + 필터
│   ├── mailer.js                # nodemailer SMTP
│   ├── scheduler.js             # node-cron (REPORT_TIME)
│   └── reportTemplate.js        # 보고서 HTML / 메일 본문 렌더러
└── src/                         # 프론트 (React)
    ├── main.jsx, App.jsx
    ├── components/
    │   ├── auth/Login.jsx
    │   ├── keyword/KeywordManager.jsx
    │   ├── recipients/RecipientSettings.jsx
    │   ├── reports/RecentReports.jsx
    │   ├── schedule/ScheduleSettings.jsx
    │   └── layout/{Header,TabBar}.jsx
    ├── hooks/{useAuth, useConfig, useReports}.js
    ├── services/api.js
    └── constants/config.js      # PRESET_KEYWORDS 만
```

---

## 📌 다음 작업

- [TODO.md](./TODO.md) — 우선순위 백로그 (PDF 첨부 발송, 검색 / 필터 UI 등)
- [ROADMAP.md](./ROADMAP.md) — 공무원·정책 분야 확장 로드맵

Trend Collector | MIT License
