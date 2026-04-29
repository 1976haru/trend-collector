# 📰 Trend Collector v1

> 전국 언론보도 자동 수집 시스템 — 설치 없이 브라우저로 사용

[![Deploy](https://github.com/YOUR_USERNAME/trend-collector-v1/actions/workflows/deploy.yml/badge.svg)](https://github.com/YOUR_USERNAME/trend-collector-v1/actions)

---

## 🚀 빠른 시작 (GitHub Pages 배포)

### 1단계 — GitHub에 올리기
```bash
git clone https://github.com/YOUR_USERNAME/trend-collector-v1
cd trend-collector-v1
npm install
npm run build
git add . && git commit -m "init" && git push
```

### 2단계 — GitHub Pages 활성화
1. GitHub 저장소 → Settings → Pages
2. Source: **GitHub Actions** 선택
3. 저장하면 자동 배포 시작

### 3단계 — 접속
```
https://YOUR_USERNAME.github.io/trend-collector-v1
```
이 URL을 동료들과 공유하면 누구나 바로 사용 가능합니다.

---

## 📁 프로젝트 구조

```
src/
├── constants/
│   ├── config.js        # 앱 전역 설정
│   └── mediaList.js     # 전국 400+ 언론사 목록
├── services/
│   ├── rssService.js    # Google News RSS 수집 (API키 불필요)
│   ├── emailService.js  # 이메일 발송 (Gmail/네이버/다음)
│   ├── kakaoService.js  # 카카오톡 알림
│   └── storageService.js# 로컬 데이터 저장
├── hooks/
│   ├── useNewsCollection.js # 뉴스 수집 상태 관리
│   ├── useScheduler.js      # 스케줄 자동 실행
│   └── useSettings.js       # 설정 관리
├── components/
│   ├── layout/          # Header, TabBar
│   ├── keyword/         # KeywordManager
│   ├── news/            # NewsCard, NewsList
│   ├── schedule/        # ScheduleSettings
│   ├── notification/    # NotificationSettings
│   ├── media/           # MediaCoverage
│   └── analysis/        # SentimentPanel
└── utils/
    ├── dateUtils.js     # 날짜 포맷
    └── pdfUtils.js      # PDF 생성
```

---

## ✉️ 이메일 알림 설정

설치 없이 Gmail/네이버/다음 메일을 통해 발송합니다.

1. 앱 → **알림 탭** → 수신자 이메일 입력
2. 메일 서비스 선택 (Gmail / 네이버 / 다음)
3. **지금 발송** 클릭 → 메일 작성창 자동 열림

---

## 💬 카카오톡 알림 설정

1. [https://developers.kakao.com](https://developers.kakao.com) 접속 → 앱 생성 (무료)
2. JavaScript 앱 키 복사
3. 앱 → **알림 탭** → 카카오 설정에 앱 키 입력
4. 카카오 로그인 → 나에게 보내기

---

## ⏰ 스케줄 설정

| 방식 | 설명 |
|------|------|
| 매일 특정 시각 | 예: 매일 09:00, 매일 18:00 |
| n시간 간격 | 예: 6시간마다 자동 수집 |

> ⚠️ 브라우저가 열려있는 동안만 실행됩니다.

---

## 📰 뉴스 수집 방식

- **Google News RSS** 사용 (완전 무료, API 키 불필요)
- 전국 일간지, 지방신문, 방송사, 인터넷 매체 포함
- CORS 프록시: `api.allorigins.win` (무료)

---

## 💡 추가 예정 기능

- [ ] Supabase 연동으로 사용자별 설정 클라우드 저장
- [ ] 주간 요약 리포트 자동 생성
- [ ] 긴급 키워드 즉시 알림
- [ ] 부서별 배포 그룹 관리
- [ ] Claude API 감성 분석 연동

---

## 🛠 로컬 개발

```bash
npm install
npm run dev
# http://localhost:5173 접속
```

---

Trend Collector v1 | MIT License
