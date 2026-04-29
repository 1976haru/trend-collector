# 📰 Trend Collector — 공공기관 내부 업무용 기사 전문 PDF 리포트 시스템

> 키워드 기반 전국 언론보도를 자동 수집하고, **각 기사 본문 전체를 추출**하여 **30건 전문이 포함된 PDF 보고서**를 자동 생성·발송하는 내부 업무용 도구.
> 단일 비밀번호 로그인 / 외부 공개·재배포 금지 (공공기관 내부 업무용) / Render 단일 서비스 배포 / PWA 지원.

---

## ✨ 핵심 기능

| 분류 | 내용 |
|------|------|
| 🔐 인증 | `ADMIN_PASSWORD` 단일 비밀번호 + HMAC 서명 쿠키 (7일 세션) |
| 🏷 키워드 | 검색·제외 키워드, AND 검색, 광고 자동 필터 — 모든 직원 공유 |
| ⏰ 자동 수집 | **즉시 / 6·10·12·24·48시간 / 매일 특정 시각 / OFF**, 설정 변경 시 cron 자동 재기동 |
| 📰 본문 추출 | URL 에서 `cheerio` 로 본문 추출 (병렬 5, 타임아웃 8s) — RSS description fallback |
| 📊 분석 | 언론 유형(중앙/지방/방송/인터넷/정부·공공기관), 감정(긍/부/중립), 급상승 키워드(+200% / +10건), 중복 기사 묶기, 자동 요약 문장, **위험 등급(안정/주의/긴급)** |
| 📄 **PDF 보고서** | **Puppeteer 서버 생성** — 표지 / 요약 / 목차 / 기사 30건 전문 / 부록. Noto Sans KR 임베드. `GET /api/reports/:id/pdf` 자동 다운로드 (`trend-report-YYYYMMDDHHmm.pdf`) |
| 📧 메일 | nodemailer SMTP — 본문 HTML + **PDF 첨부 옵션** + 알림 트리거 시 ⚠️ 제목 |
| 💬 카카오 | 구조 제공 + `KAKAO_ENABLED=true` 토글 (기본 OFF, 실 발송은 P2) |
| 📱 PWA | manifest.json + 192/512 아이콘, 안전영역, 모바일 반응형, 본문 접기/펼치기 |

---

## 🛠 기술 스택

- **프론트엔드**: React 18 + Vite 5 + 인라인 스타일 + 미디어쿼리(반응형)
- **백엔드**: Express + cookie-parser + node-cron + nodemailer
- **저장소**: 서버 로컬 JSON 파일 (`data/config.json`, `data/reports/<id>.json`)
- **배포**: Render Web Service (Singapore 권역)

---

## 🚀 로컬 실행

```bash
git clone https://github.com/1976haru/trend-collector.git
cd trend-collector
cp .env.example .env          # ADMIN_PASSWORD 등 채우기
npm install
npm run dev                   # 백엔드 :3000 + Vite :5173 동시 실행 (자동 프록시)
```

운영과 동일한 단일 서비스 모드:
```bash
npm run build && npm start    # http://localhost:3000
```

> 다른 프로젝트가 3000 포트를 점유 중이면 `.env` 의 `PORT=3030` 처럼 변경하세요.

---

## 📱 내부 직원 접속 방법

### PC 브라우저
```
https://trend-collector.onrender.com
```
1. 운영자가 알려준 공용 비밀번호 입력
2. 4개 탭으로 작업: **키워드 · 리포트 · 수신자 · 스케줄**

### 스마트폰 브라우저
- 동일한 URL 로 접속 (반응형 UI)
- iOS Safari: 공유 → "홈 화면에 추가" 로 PWA 설치
- Android Chrome: 메뉴 → "홈 화면에 추가"

---

## ☁️ Render 배포 방법

저장소에 `render.yaml` 이 포함되어 있어 Blueprint 한 번에 배포됩니다.

1. Render → **New > Blueprint** → 본 저장소 선택.
2. `sync: false` 로 표시된 환경변수(`ADMIN_PASSWORD`, `SMTP_*`, `BASE_URL`) 입력.
3. **Apply** → 약 3~5분 후 배포 완료.

수동 생성 시:
- **Type**: Web Service
- **Runtime**: Node
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health`

> ⚠️ Render free 플랜은 디스크가 휘발성 + 15분 idle 시 sleep 됩니다. 운영은 Starter 이상 + Disk 또는 외부 DB 권장.

---

## 🔧 환경변수

| 변수 | 필수 | 설명 |
|------|:-:|------|
| `ADMIN_PASSWORD` | ✅ | 직원 공용 로그인 비밀번호 (변경 시 기존 세션 자동 무효화) |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | ⭐ | 메일 발송 (없으면 수집·리포트만 동작) |
| `REPORT_TIME` | | 일일 cron 기본값 `HH:MM` (KST). 운영 중에는 UI 설정이 우선 |
| `BASE_URL` | | 메일 본문 링크용 절대 URL (예: `https://trend-collector.onrender.com`) |
| `OPENAI_API_KEY` | | 추후 LLM 요약용 (현재 미사용) |
| `KAKAO_ENABLED` | | `true` 일 때만 카카오 알림 시도 (기본 false, 스텁) |
| `KAKAO_ACCESS_TOKEN` `KAKAO_TEMPLATE_ID` `KAKAO_TARGET_UUID` | | 카카오 알림용 (P2) |
| `DATA_DIR` | | JSON 저장 경로. 기본 `./data` |
| `PORT` | | Render 가 자동 주입. 로컬 기본 3000 |
| `PUPPETEER_EXECUTABLE_PATH` | | 시스템 Chrome 경로 지정 (대개 불필요 — npm install 시 자동 다운로드됨) |

---

## ⏰ 스케줄 설정 방법

스케줄 탭에서 다음을 설정합니다:

1. **자동 수집 ON/OFF**
2. **수집 모드**:
   - `매일 특정 시각` — `HH:MM` (KST) 입력
   - `N시간 간격` — 6 / 10 / 12 / 24 / 48 시간 중 선택
   - `사용 안 함` — cron 정지
3. **자동 발송 옵션** — 수집 후 메일 자동 발송 / PDF 첨부(P2)
4. **알림 트리거** — 부정 비율 50% 이상 / 급상승 / 중앙언론 / 정부·공공기관 (메일 제목에 ⚠️ 표시)

설정을 저장하면 서버 cron 이 즉시 재구성됩니다 (서버 재시작 불필요).

---

## 📄 PDF 다운로드 방법

1. **리포트** 탭에서 보고서 클릭 → 상세 화면.
2. 우측 상단 **📄 PDF 다운로드** 클릭 → 서버가 Puppeteer 로 생성한 PDF 가 즉시 다운로드됩니다.
3. 파일명: `trend-report-YYYYMMDDHHmm.pdf`.
4. PDF 구성: 표지(보고서 제목/생성일/키워드/위험등급) → 요약 → 언론 유형 → 중복 묶기 → 목차 → **기사 30건 전문** → 부록.
5. 자동 발송 시 PDF 첨부도 가능: 키워드 화면 하단 자동 수집 설정에서 “PDF 파일 첨부” 토글.

> 💡 본 시스템은 공공기관 내부 업무용입니다. 추출된 본문은 외부 공개·재배포·상업적 이용을 금지합니다.

---

## 🔐 보안 메모

- `.env` 는 `.gitignore` 에 포함 — **절대 GitHub 에 올리지 마세요.**
- `data/` 도 `.gitignore` 에 포함 — 리포트 JSON 은 서버 로컬에만 저장.
- 모든 API Key / SMTP 비밀번호는 **Render 환경변수**로만 관리.
- 외부 노출이 우려되면 Render 의 IP 제한 또는 Cloudflare Access 추가 권장.

---

## 📁 폴더 구조

```
trend-collector/
├── render.yaml                  # Render Blueprint
├── package.json                 # express + nodemailer + node-cron + react/vite
├── vite.config.js               # /api → :3000 dev 프록시
├── .env.example
├── public/                      # PWA 자산 (정적)
│   ├── manifest.json
│   ├── icon-192.png  icon-512.png
│   └── favicon.ico  favicon-32.png
├── server/                      # 백엔드
│   ├── index.js                 # 진입점 + 라우터 + 정적 SPA 서빙
│   ├── auth.js                  # ADMIN_PASSWORD HMAC 쿠키
│   ├── store.js                 # JSON 저장
│   ├── collector.js             # RSS 수집 + 분류/감정/그룹/트렌드/요약
│   ├── mailer.js                # nodemailer
│   ├── scheduler.js             # daily/interval cron
│   ├── reportTemplate.js        # 인쇄용 HTML + 메일 본문
│   ├── mediaList.js             # 언론 유형 분류
│   └── sentiment.js             # 감정 키워드 분석
└── src/                         # 프론트
    ├── App.jsx, main.jsx
    ├── components/
    │   ├── auth/Login.jsx
    │   ├── keyword/KeywordManager.jsx
    │   ├── recipients/RecipientSettings.jsx
    │   ├── reports/{RecentReports,ReportDetail}.jsx
    │   ├── schedule/ScheduleSettings.jsx
    │   └── layout/{Header,TabBar}.jsx
    ├── hooks/{useAuth,useConfig,useReports}.js
    ├── services/api.js
    ├── utils/datetime.js
    └── constants/config.js      # PRESET_KEYWORDS
```

---

## 📌 다음 작업

- [TODO.md](./TODO.md) — 우선순위 백로그 (P1/P2/P3)
- [ROADMAP.md](./ROADMAP.md) — 카카오톡 / 사용자별 계정 / LLM 요약 / DB 마이그레이션

Trend Collector | MIT License
