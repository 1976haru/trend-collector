# Trend Collector 문제 해결 가이드

자주 발생하는 오류와 해결 방법을 정리했습니다.
앱 안 **❓ 도움말 → ⚠️ 자주 발생하는 오류** 섹션에서도 같은 내용을 볼 수 있습니다.

---

## 🔴 메일 관련 오류

### ❌ Connection timeout (테스트 메일)

**증상**: 메일 설정 화면에서 “테스트 메일 보내기” 시 `Connection timeout` 또는 `ETIMEDOUT` 오류.

**원인**: SMTP 포트(25 / 465 / 587)에 연결하지 못한 상태입니다. 가장 흔한 원인은:

- **Render 무료 플랜에서 SMTP 포트 차단** *(가장 흔함)*
- 회사 / 기관 방화벽에서 SMTP 차단
- SMTP 호스트 이름 오타

**해결**:

1. **🛠 설정 → 📨 메일 설정** 으로 이동
2. **발송 방식** 을 `Resend API` 또는 `SendGrid API` 로 변경
3. 해당 서비스에서 발급한 **API 키** 입력
4. **저장** 후 다시 **🧪 테스트 메일 발송**

또는 **Render 유료 플랜** 으로 전환하면 SMTP 도 정상 동작합니다.

---

### ❌ Authentication failed (535)

**증상**: `EAUTH` / `535 Username and Password not accepted` / `invalid login`.

**원인**: SMTP 사용자명 / 비밀번호가 올바르지 않습니다.

**해결**:

- **네이버**: “메일 환경설정 → POP3/IMAP” 에서 **별도 비밀번호** 를 발급받아 사용해야 합니다 (일반 로그인 비밀번호와 다름).
- **Gmail**: 2단계 인증 후 **앱 비밀번호** 를 발급받아 사용해야 합니다.
- **회사 메일**: IT 담당자에게 SMTP 인증 정보를 문의.

---

### ❌ TLS / SSL 오류

**증상**: `wrong version number` / `self signed certificate` / `TLS handshake failed`.

**원인**: 보안 연결 모드 불일치.

| 메일 서비스 | 권장 포트 | secure |
|---|---|---|
| 네이버 | 587 | OFF (STARTTLS) |
| Gmail | 465 | ON (SSL) |
| Gmail | 587 | OFF (STARTTLS) |
| Office 365 | 587 | OFF (STARTTLS) |

---

### ❌ Resend API / SendGrid API 호출 실패

**증상**: `Resend HTTP 401` / `SendGrid HTTP 403`.

**원인**:

- API 키 무효 또는 권한 부족
- FROM 주소가 인증된 도메인이 아님

**해결**:

1. 해당 서비스 콘솔에서 API 키 재발급
2. **Single Sender** 또는 **Domain Authentication** 절차 완료
3. FROM 주소는 인증된 도메인의 주소(예: `noreply@your-domain.com`) 사용

---

## 📄 PDF / 문서 생성 오류

### ❌ PDF 생성 실패 / Chrome not found

**증상**: PDF 다운로드 시 `Could not find Chrome` / `Browser was not found`.

**원인**: Render 등 외부 호스팅에서 Puppeteer 가 Chrome 을 찾지 못한 상태.

**해결**:

- 임시 우회: **Word** 또는 **HTML** 다운로드를 사용
- 영구 해결: 배포 빌드 단계에 다음을 포함
  ```bash
  npx puppeteer browsers install chrome
  ```
  그리고 `PUPPETEER_CACHE_DIR` 환경변수가 빌드 / 런타임에 동일하게 설정되어 있는지 확인.

---

### ❌ 본문 추출 실패

**증상**: 일부 기사가 “⚠️ 본문 자동 추출 실패” 로 표시됨.

**원인**: 매체별 봇 차단 / 로그인 요구 / 동적 렌더링.

**해결**:

- RSS 메타데이터로 자동 대체되어 보고서에는 포함됨
- **🔄 이 기사 재추출** 버튼으로 재시도
- 그래도 실패 시 **원문 보기** 링크에서 직접 확인

---

## 🔍 검색 / 수집 오류

### ❌ 검색 결과 0건

**증상**: 수집을 돌렸지만 최종 결과가 0건.

**해결 순서**:

1. 리포트 상세 상단의 **🔬 검색 진단** 패널 확인
2. **단계별로 어디서 제외되었는지** 보고:
   - 원본 0건 → 키워드 표기(띄어쓰기 / 공식 명칭) 또는 수집 기간 조정
   - 날짜 필터 제외 → 기사 발행일이 수집 기간 밖
   - AND 필터 제외 → **“모든 키워드 포함” 옵션 해제**
3. 키워드를 줄이거나 단순화

---

### ❌ 네이버 API 미설정 경고

**증상**: 키워드 화면에서 `Naver News` 토글이 비활성 / 회색.

**해결**:

1. **🛠 설정 → 📰 뉴스 소스 설정**
2. 네이버 개발자 센터에서 발급한 **Client ID / Secret** 입력 (https://developers.naver.com/apps/#/list)
3. 저장 후 키워드 화면으로 돌아가 **Naver News** 토글 ON

---

## 🔑 인증 / 접속 오류

### ❌ ADMIN_PASSWORD 환경변수가 비어 있음

**증상**: 로그인 시도가 모두 거부됨.

**해결**: 배포 환경변수에 `ADMIN_PASSWORD` 를 설정하세요. 로컬 개발은 `.env` 파일에 추가합니다.

---

### ❌ 인증이 만료되었습니다

**증상**: API 호출이 401 로 실패하면서 “다시 로그인하세요” 메시지.

**해결**: 화면을 새로 고치고 다시 로그인.

---

## 📥 다운로드 오류

### ❌ 다운로드 버튼이 응답 없음

**해결**:

1. 브라우저 팝업 차단을 해제
2. 다른 브라우저(Chrome / Edge / Safari)로 시도
3. 그래도 실패 시 HTML 다운로드 후 브라우저에서 Ctrl+P 로 인쇄

---

## 💡 일반적 안내

- **기능개선 제안** 은 메일 발송 결과와 무관하게 항상 `data/feedback.json` 에 저장됩니다 — 안심하고 사용하세요.
- 설정값(키워드, 수신자, 메일 설정)은 `data/` 디렉터리에 저장됩니다. **Render Free 플랜은 디스크가 휘발성** 이므로 영구 보관이 필요하면 Render Disk(유료) 또는 외부 DB 로 옮겨야 합니다.
- 자세한 사용법은 [USER_GUIDE.md](./USER_GUIDE.md) 와 [FAQ.md](./FAQ.md) 를 참고하세요.
