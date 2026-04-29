# 📰 Trend Collector

> **전국 언론보도 자동 수집 + 요약 + PDF·메일 발송 시스템**
> 키워드 기반으로 Google News RSS 를 자동 수집하고, 일일 업무보고용 PDF · 이메일 · 카카오톡 알림으로 배포합니다.

---

## ✨ 주요 기능

| 분류 | 기능 |
|------|------|
| 수집 | Google News RSS · 포함/제외 키워드 · AND 검색 · URL+제목 중복 제거 · 광고/홍보 자동 필터 |
| 분석 | 키워드 급상승 감지 · 매체 등급(중앙/지방/인터넷) · 지역 분류 · 감성 분석 슬롯 |
| 보고 | "요약 / 주요 이슈 / 시사점 / 참고 링크" 형식의 PDF 보고서 (일간·주간) |
| 발송 | Gmail · 네이버 · 다음 메일 작성창 자동 열기 · EmailJS · 카카오톡 공유 · 브라우저 알림 |
| 자동화 | 매일 특정 시각 / N시간 간격 스케줄러 · 다중 키워드 · 다중 수신자 |

---

## 🛠 기술 스택

- **Frontend**: React 18 + Vite 5
- **차트**: Recharts
- **메일**: `mailto:` / Gmail / Naver / EmailJS (월 200건 무료)
- **스토리지**: 브라우저 `localStorage` (사용자별 키워드/수신자/스케줄 저장)
- **호스팅**: GitHub Pages (Actions 기반 자동 배포 — `.github/workflows/deploy.yml`)

---

## 🚀 빠른 시작

### 1. 저장소 받기

```bash
git clone https://github.com/1976haru/trend-collector.git
cd trend-collector
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경변수 (선택)

```bash
cp .env.example .env
# 필요한 키만 채워 넣으세요. EmailJS / Kakao 키가 없어도 mailto / Gmail / Naver 모드는 동작합니다.
```

### 4. 개발 서버 실행

```bash
npm run dev
# http://localhost:5173 으로 접속
```

### 5. 운영 빌드 / 미리보기

```bash
npm run build       # dist/ 생성
npm run preview     # http://localhost:4173 에서 빌드 결과 확인
```

---

## 📁 폴더 구조

```
trend-collector/
├── index.html
├── vite.config.js
├── package.json
├── .env.example
├── .gitignore
├── README.md / TODO.md / ROADMAP.md
├── .github/workflows/deploy.yml         # GitHub Pages 자동 배포
└── src/
    ├── main.jsx                          # 진입점
    ├── App.jsx                           # 탭 라우팅 + 훅 연결
    ├── constants/
    │   ├── config.js                     # 환경변수 / 상수 / 프리셋
    │   └── mediaList.js                  # 전국 언론사 카테고리 + 매체 등급/지역 분류
    ├── services/
    │   ├── rssService.js                 # Google News RSS 수집
    │   ├── emailService.js               # Gmail/Naver/Daum 메일 작성창 + EmailJS
    │   ├── kakaoService.js               # 카카오톡 공유 / 나에게 보내기
    │   └── storageService.js             # localStorage 래퍼
    ├── hooks/
    │   ├── useNewsCollection.js          # 수집 + 중복 제거 + 광고 필터 + 트렌드 감지
    │   ├── useScheduler.js               # 매일/N시간 간격 스케줄러
    │   └── useSettings.js                # 키워드·수신자·옵션 저장
    ├── components/
    │   ├── layout/Header.jsx, TabBar.jsx
    │   ├── keyword/KeywordManager.jsx    # 포함/제외 키워드 + 광고 필터 + AND 토글
    │   ├── news/NewsCard.jsx, NewsList.jsx
    │   ├── media/MediaCoverage.jsx
    │   ├── analysis/SentimentPanel.jsx
    │   ├── schedule/ScheduleSettings.jsx
    │   └── notification/NotificationSettings.jsx
    └── utils/
        ├── dateUtils.js
        ├── filterUtils.js                # 포함/제외 + 중복 제거 + 트렌드 감지
        └── pdfUtils.js                   # 일일 업무보고 PDF 템플릿
```

---

## 🔐 비밀정보 / 환경변수 정책

- **`.env` 는 `.gitignore` 에 포함되어 있어 절대 커밋되지 않습니다.**
- 클라이언트(브라우저)에서 사용하는 변수는 반드시 `VITE_` 접두어가 필요합니다.
- 키 값이 클라이언트에 노출되어도 안전한 항목만 `VITE_*` 로 두세요.
  - 안전: EmailJS *공개키*, Kakao JavaScript 앱 키
  - **위험**: Anthropic / OpenAI 시크릿 키 — 운영 시 별도 백엔드 프록시를 통해 호출하세요.

---

## ⏰ 스케줄 (브라우저 기반)

| 방식 | 설명 |
|------|------|
| 매일 특정 시각 | 예: 매일 09:00, 매일 18:00 |
| N시간 간격 | 예: 6시간마다 자동 수집 |

> ⚠️ 브라우저 탭이 열려 있는 동안만 실행됩니다. 24/7 자동 수집이 필요하면 ROADMAP 의 "서버리스 백엔드" 항목을 참고하세요.

---

## 📦 GitHub Pages 배포

`main` 브랜치에 push 하면 `.github/workflows/deploy.yml` 이 자동으로 빌드하고 GitHub Pages 에 배포합니다.

1. GitHub 저장소 → **Settings → Pages** → Source: **GitHub Actions**
2. `main` 으로 push → 약 2분 후 `https://<USER>.github.io/trend-collector/` 접속 가능

저장소 이름이 `trend-collector` 가 아니라면 `vite.config.js` 의 `base` 또는 `.env` 의 `VITE_BASE_PATH` 를 맞춰주세요.

---

## 🔧 자주 묻는 문제

- **CORS 오류로 RSS 가 안 받아져요** — 기본 프록시 `api.allorigins.win` 가 일시 장애일 수 있습니다. `.env` 의 `VITE_RSS_PROXY` 를 다른 프록시로 교체해 보세요.
- **PDF 저장 시 한글이 깨져요** — 본 프로젝트의 PDF 는 "프린트 친화적 새 창 → 사용자가 PDF 로 저장" 방식이라 OS 기본 한글 글꼴이 그대로 사용됩니다. 브라우저 인쇄 다이얼로그에서 *PDF 로 저장* 을 선택하세요.
- **EmailJS 가 동작하지 않아요** — `notify` 탭에서 Gmail / Naver / 다음 / 기본앱 을 고르면 EmailJS 없이도 메일 작성창이 자동으로 열립니다.

---

## 📌 다음 작업

- [TODO.md](./TODO.md) — 우선순위 백로그
- [ROADMAP.md](./ROADMAP.md) — 공무원 / 업무용 기능 로드맵

---

Trend Collector | MIT License
