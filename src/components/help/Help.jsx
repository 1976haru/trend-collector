// ─────────────────────────────────────────────
// Help.jsx — 사용자 가이드 + Q&A + 문제해결
// 초보자도 이해할 수 있게 단계별 설명을 제공한다.
// 섹션은 펼치기/접기 — 첫 진입 시 “시작하기” 만 펼침.
// ─────────────────────────────────────────────

import { useState } from 'react';

const SECTIONS = [
  { id: 'about',     title: '🧭 Trend Collector 란?',           open: true,  body: AboutBody },
  { id: 'start',     title: '🚀 처음 사용하는 방법',              open: true,  body: StartBody },
  { id: 'keyword',   title: '🏷 키워드 입력 / 빠른 키워드',         open: false, body: KeywordBody },
  { id: 'oror',      title: '🔍 OR 검색과 AND 검색 차이',          open: false, body: OrAndBody },
  { id: 'period',    title: '📆 수집 기간 설정',                  open: false, body: PeriodBody },
  { id: 'reports',   title: '📰 리포트 확인 방법',                open: false, body: ReportsBody },
  { id: 'outputs',   title: '🖨 편철형 vs 분석형 출력 차이',         open: false, body: OutputBody },
  { id: 'downloads', title: '📥 Word / Excel / PDF / HTML 차이', open: false, body: DownloadBody },
  { id: 'naver',     title: '🇰🇷 네이버 API 설정',                 open: false, body: NaverBody },
  { id: 'mail',      title: '📨 메일 설정',                       open: false, body: MailBody },
  { id: 'qna',       title: '❓ 자주 묻는 질문 (Q&A)',             open: false, body: QnaBody },
  { id: 'errors',    title: '⚠️ 자주 발생하는 오류와 해결',           open: false, body: ErrorBody },
];

export default function Help() {
  const [open, setOpen] = useState(() => {
    const init = {};
    for (const s of SECTIONS) init[s.id] = !!s.open;
    return init;
  });
  function toggle(id) { setOpen(s => ({ ...s, [id]: !s[id] })); }

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <div style={S.title}>📖 도움말 / 사용법</div>
        <div style={S.sub}>처음 사용하는 분이 따라 하기 좋은 순서로 정리했습니다. 각 항목을 눌러 펼치세요.</div>
      </div>

      {SECTIONS.map(s => (
        <section key={s.id} style={S.section}>
          <button style={S.secHead} onClick={() => toggle(s.id)}>
            <span>{open[s.id] ? '▾' : '▸'} {s.title}</span>
          </button>
          {open[s.id] && <div style={S.secBody}><s.body /></div>}
        </section>
      ))}
    </div>
  );
}

// ── 본문 컴포넌트 ────────────────────────────
function AboutBody() {
  return (
    <>
      <P><B>Trend Collector</B> 는 키워드 기반으로 언론 보도를 자동 수집·분석하여 리포트로 만들어주는 도구입니다.</P>
      <UL>
        <LI>네이버 / 구글 뉴스를 키워드별로 검색</LI>
        <LI>본문 자동 추출 + 감정 분석 + 부서 분류</LI>
        <LI>편철형(언론 스크랩철) / 분석형(보고서) 두 종류로 다운로드</LI>
        <LI>자동 수집 스케줄 + 메일 자동 발송 지원</LI>
      </UL>
      <Note>※ 본 도구는 내부 업무용 자료를 자동 생성합니다. 외부 공개 시에는 반드시 검토가 필요합니다.</Note>
    </>
  );
}

function StartBody() {
  return (
    <>
      <Step n="1" title="키워드 추가">
        <P>상단 <B>🏷 키워드</B> 탭에서 빠른 키워드를 클릭하거나, 직접 입력 후 Enter 로 추가합니다.
        처음에는 1~3 개만 넣는 것을 권장합니다.</P>
      </Step>
      <Step n="2" title="수집 기간 선택">
        <P>최근 <B>7일</B> 또는 <B>30일</B> 이 가장 안정적입니다. 24시간은 결과가 적을 수 있습니다.</P>
      </Step>
      <Step n="3" title="즉시 수집">
        <P><B>🔍 지금 즉시 수집</B> 버튼을 누르면 15~30초 안에 리포트가 생성됩니다.</P>
      </Step>
      <Step n="4" title="리포트 확인">
        <P><B>📰 리포트</B> 탭에서 방금 만든 리포트를 열어 본문 / 감정분석 / 홍보성과를 확인합니다.</P>
      </Step>
      <Step n="5" title="출력 / 다운로드">
        <P>리포트 상세 화면에서 <B>편철형</B> 또는 <B>분석형</B> 출력물을 PDF / Word / HTML / Excel 로 받을 수 있습니다.</P>
      </Step>
    </>
  );
}

function KeywordBody() {
  return (
    <>
      <P>키워드는 <B>빠른 키워드</B>(법무부 5 카테고리) 또는 직접 입력으로 추가합니다.</P>
      <UL>
        <LI>각 카테고리는 <B>핵심</B> + <B>확장</B> 으로 나뉘어 있고, 핵심만 먼저 표시됩니다.</LI>
        <LI>이미 선택된 키워드는 진하게 표시되며, 다시 클릭하면 제거됩니다.</LI>
        <LI>전체 검색창에 “소년” 입력 시 <I>소년원 / 소년보호 / 청소년비행예방센터</I> 가 표시됩니다.</LI>
        <LI>“검색 목적” 을 선택하면 부정 / 홍보 / 제도개선 등 추천 키워드를 한 번에 추가할 수 있습니다.</LI>
        <LI><B>키워드 전체 초기화</B> 버튼으로 선택된 키워드를 한 번에 비울 수 있습니다.</LI>
      </UL>
    </>
  );
}

function OrAndBody() {
  return (
    <>
      <P><B>기본 검색은 OR 입니다.</B> 여러 키워드 중 <B>하나라도</B> 포함된 기사가 결과에 들어옵니다.</P>
      <P>“모든 키워드를 포함하는 기사만” 체크박스를 켜면 <B>AND 검색</B>(모두 포함된 기사만) 으로 바뀝니다.
      이 옵션은 매우 좁게 검색할 때만 사용하세요 — 대부분의 경우 결과가 0건이 됩니다.</P>
      <Example>
        <P><B>예) 키워드 [보호관찰, 보호관찰소, 전자감독]</B></P>
        <UL>
          <LI>OR (기본): 셋 중 하나라도 포함된 기사 → <B>결과 다수</B></LI>
          <LI>AND (옵션 ON): 셋 모두 포함된 기사만 → <B>결과 적음 / 0건</B></LI>
        </UL>
        <P>※ <I>보호관찰</I> 은 <I>보호관찰소</I> 안에 포함되므로, AND 시 자동으로 <I>보호관찰소</I> 만 검사합니다.</P>
      </Example>
    </>
  );
}

function PeriodBody() {
  return (
    <>
      <UL>
        <LI><B>최근 24시간</B> — 결과가 적을 수 있음. 긴급 모니터링 용</LI>
        <LI><B>최근 7일</B> — 일일/주간 보고서 권장</LI>
        <LI><B>최근 30일</B> — 월간 보고서 / 트렌드 분석</LI>
        <LI><B>직접 설정</B> — 시작/종료 날짜 수동 입력</LI>
      </UL>
      <Note>날짜를 추출하지 못한 기사는 “날짜 미확인” 으로 보존되어 결과에 포함됩니다.</Note>
    </>
  );
}

function ReportsBody() {
  return (
    <>
      <UL>
        <LI><B>📰 리포트</B> 탭에서 가장 최근 리포트가 위에 표시됩니다.</LI>
        <LI>리포트를 클릭하면 표지 / 통계 / 부정 이슈 / 본문이 표시됩니다.</LI>
        <LI>본문 추출에 실패한 기사는 “🔄 이 기사 재추출” 버튼으로 다시 시도할 수 있습니다.</LI>
        <LI>리포트 메일 발송: <B>✉️ 메일</B> 버튼으로 수신자에게 즉시 발송.</LI>
      </UL>
    </>
  );
}

function OutputBody() {
  return (
    <>
      <Side>
        <Card title="📰 편철형 출력물">
          <UL>
            <LI>실제 인쇄해서 넘겨보는 <B>언론 스크랩철</B> 형태</LI>
            <LI>표지 → 언론사별 목차 → 언론사별 페이지 → (선택) 분석 부록</LI>
            <LI>흑백 인쇄 최적화 / 명조 폰트 / A4 세로</LI>
            <LI>출력 전 표지·날짜·기관명 등을 직접 수정 가능</LI>
          </UL>
        </Card>
        <Card title="📊 분석형 보고서">
          <UL>
            <LI>관리자/담당자가 읽기 위한 <B>보고자료</B></LI>
            <LI>1페이지 요약 → 종합 분석 → 주요 이슈 → 긍부정 → 홍보성과 → 대응 필요사항</LI>
            <LI>편집 가능한 Word / Excel 제공</LI>
            <LI>공공기관 보고 문체 (〜임 / 〜함 / 〜필요함)</LI>
          </UL>
        </Card>
      </Side>
    </>
  );
}

function DownloadBody() {
  return (
    <>
      <UL>
        <LI><B>PDF</B> — 인쇄 / 보존 용. 편집 불가.</LI>
        <LI><B>Word(.docx)</B> — 편집 가능. 제목·본문·표를 수정해 최종 결재 자료로 정리.</LI>
        <LI><B>Excel(.xlsx)</B> — 분석 / 통계용. 언론사별 목차 · 부정 이슈 · 부서별 대응 등 시트.</LI>
        <LI><B>HTML</B> — 브라우저로 열어 <B>Ctrl+P</B> 로 인쇄/PDF 저장 가능. 오프라인 보관용.</LI>
      </UL>
      <Note>PDF 가 실패하면 Word 또는 HTML 다운로드를 사용하세요. 본 안내는 자동으로 표시됩니다.</Note>
    </>
  );
}

function NaverBody() {
  return (
    <>
      <P><B>관리자 한 명만 입력</B>하면 모든 직원이 PC / 스마트폰에서 공통으로 사용할 수 있습니다.</P>
      <Step n="1" title="네이버 개발자 센터 접속">
        <P><A href="https://developers.naver.com/apps/#/list">developers.naver.com</A> 에서 애플리케이션 등록 → 검색(뉴스) 권한 부여.</P>
      </Step>
      <Step n="2" title="Client ID / Secret 복사">
        <P>발급된 Client ID 와 Secret 을 복사합니다.</P>
      </Step>
      <Step n="3" title="설정 탭에 입력">
        <P><B>🛠 설정 → 📰 뉴스 소스 설정</B> 에서 Naver Client ID / Secret 입력 후 저장.</P>
      </Step>
      <Step n="4" title="키워드 화면에서 ON">
        <P>🏷 키워드 화면 하단의 <B>Naver News</B> 토글을 켭니다. (Google News 와 동시 사용 권장)</P>
      </Step>
      <Note>Client Secret 은 화면에 다시 표시되지 않습니다. 변경하려면 새 값을 입력하세요.</Note>
    </>
  );
}

function MailBody() {
  return (
    <>
      <P>메일 발송 방식은 <B>SMTP / Resend / SendGrid / 저장만</B> 4 가지 중 선택할 수 있습니다.</P>
      <Side>
        <Card title="SMTP">
          <UL>
            <LI>네이버 / Gmail 등 <B>일반 메일 서버 직접 연결</B></LI>
            <LI>호스트 · 포트(587 권장) · 사용자 · 비밀번호 입력</LI>
            <LI>⚠️ Render 무료 플랜은 SMTP 포트가 차단되어 <B>Connection timeout</B> 가능</LI>
          </UL>
        </Card>
        <Card title="API 방식 (Resend / SendGrid)">
          <UL>
            <LI>API Key 입력만으로 발송</LI>
            <LI>Render 무료 플랜에서도 <B>정상 동작</B></LI>
            <LI>FROM 주소는 인증된 도메인이어야 함</LI>
          </UL>
        </Card>
      </Side>
      <Note>설정 후 <B>🧪 테스트 메일 발송</B> 으로 확인하세요. 실패 시 한국어 안내가 표시됩니다.</Note>
    </>
  );
}

function QnaBody() {
  return (
    <>
      <Q a="Q. 키워드는 몇 개 넣어야 하나요?"
         q="처음에는 1~3개 정도만 넣는 것이 좋습니다. 너무 많으면 관련 없는 기사가 함께 들어옵니다." />
      <Q a="Q. 여러 키워드를 넣으면 모두 포함된 기사만 나오나요?"
         q="아닙니다. 기본은 하나라도 포함되면 결과에 포함되는 OR 검색입니다." />
      <Q a="Q. 모든 키워드를 포함하는 기사만 옵션은 언제 쓰나요?"
         q="아주 좁게 검색하고 싶을 때만 사용합니다. 대부분의 경우 결과가 0건이 됩니다." />
      <Q a="Q. PDF 가 안 되면 어떻게 하나요?"
         q="Word 또는 HTML 다운로드를 사용하면 됩니다. HTML 은 브라우저로 열고 Ctrl+P 로 인쇄 / PDF 저장이 가능합니다." />
      <Q a="Q. 네이버 API 는 직원마다 입력해야 하나요?"
         q="아닙니다. 관리자가 한 번 저장하면 PC 와 스마트폰에서 공통으로 사용됩니다." />
      <Q a="Q. 테스트 메일 발송이 Connection timeout 으로 실패합니다."
         q="Render 무료 플랜에서 SMTP 포트가 차단되어 발생할 수 있습니다. SMTP 대신 Resend / SendGrid 같은 메일 API 방식을 사용하거나 Render 유료 플랜으로 전환하세요." />
      <Q a="Q. 기능개선 제안은 메일 발송이 실패해도 보존되나요?"
         q="네. 제안 내용은 항상 서버의 data/feedback.json 에 저장됩니다. 메일이 실패해도 관리자 화면에서 모든 제안을 확인할 수 있습니다." />
      <Q a="Q. 새 PC 에서 처음 접속했는데 키워드가 자동으로 들어가 있어요."
         q="저장된 설정이 남아 있는 경우입니다. 키워드 화면에서 “🗑 키워드 전체 초기화” 버튼을 누르면 비울 수 있습니다." />
      <Q a="Q. 같은 기관에서 여러 명이 동시에 사용해도 되나요?"
         q="네. 키워드 / 수신자 / 메일 설정은 모든 직원이 공유합니다. 한 명이 바꾸면 모두에게 적용됩니다." />
      <Q a="Q. 편철형과 분석형 차이는 무엇인가요?"
         q="편철형은 인쇄용 언론 스크랩철, 분석형은 보고용 분석 자료입니다. 두 가지를 별도 다운로드로 제공합니다." />
    </>
  );
}

function ErrorBody() {
  return (
    <>
      <Err title="❌ Connection timeout (테스트 메일)">
        <P>SMTP 포트(25 / 465 / 587) 에 연결하지 못한 상태입니다. 가장 흔한 원인:</P>
        <UL>
          <LI>Render 무료 플랜에서 SMTP 포트가 차단됨</LI>
          <LI>방화벽 / 회사 네트워크에서 SMTP 차단</LI>
        </UL>
        <P><B>해결</B>: 메일 설정 화면에서 발송 방식을 <B>Resend / SendGrid</B> API 로 전환하거나, Render 유료 플랜을 사용하세요.</P>
      </Err>
      <Err title="❌ Authentication failed (535)">
        <P>SMTP 사용자명 / 비밀번호가 올바르지 않습니다. 네이버는 “메일 환경설정 → POP3/IMAP” 에서 별도 비밀번호를 발급받아야 합니다.</P>
      </Err>
      <Err title="❌ TLS / SSL 오류">
        <P>네이버는 <B>587 포트 + secure=false (STARTTLS)</B>, Gmail 은 <B>465 포트 + secure=true</B> 를 사용해야 합니다.</P>
      </Err>
      <Err title="❌ PDF 생성 실패 / Chrome not found">
        <P>Render 등 외부 호스팅에서 Puppeteer 가 Chrome 을 찾지 못한 경우입니다. Word 또는 HTML 다운로드를 대신 사용하세요. 문제 지속 시 배포 설정을 점검하세요.</P>
      </Err>
      <Err title="❌ 본문 추출 실패">
        <P>일부 매체는 봇 차단 / 로그인 요구로 본문이 비어 있을 수 있습니다. RSS 메타데이터로 자동 대체되며, “🔄 이 기사 재추출” 또는 원문 링크에서 직접 확인 가능합니다.</P>
      </Err>
      <Err title="❌ 검색 결과 0건">
        <P>리포트 상세 화면 상단의 <B>🔬 검색 진단</B> 패널에서 어느 단계(원본 / 날짜 / 중복 / AND) 에서 제외되었는지 확인하세요. <B>“모든 키워드 포함” 옵션</B> 이 켜져 있다면 먼저 해제하세요.</P>
      </Err>
    </>
  );
}

// ── 작은 프레젠테이션 헬퍼 ──────────────────────
const P  = ({ children }) => <p style={S.p}>{children}</p>;
const B  = ({ children }) => <strong>{children}</strong>;
const I  = ({ children }) => <em>{children}</em>;
const UL = ({ children }) => <ul style={S.ul}>{children}</ul>;
const LI = ({ children }) => <li style={S.li}>{children}</li>;
const A  = ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={S.a}>{children}</a>;

function Step({ n, title, children }) {
  return (
    <div style={S.step}>
      <div style={S.stepN}>{n}</div>
      <div style={S.stepBody}>
        <div style={S.stepTitle}>{title}</div>
        {children}
      </div>
    </div>
  );
}
function Note({ children })   { return <div style={S.note}>{children}</div>; }
function Err({ title, children }) {
  return <div style={S.errBox}><div style={S.errTitle}>{title}</div>{children}</div>;
}
function Q({ a, q }) {
  return (
    <div style={S.qa}>
      <div style={S.q}>{a}</div>
      <div style={S.qaA}>A. {q}</div>
    </div>
  );
}
function Side({ children }) { return <div style={S.side}>{children}</div>; }
function Card({ title, children }) {
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>{title}</div>
      {children}
    </div>
  );
}
function Example({ children }) { return <div style={S.example}>{children}</div>; }

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  head: { background: 'white', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  title: { fontSize: 17, fontWeight: 800 },
  sub:   { fontSize: 12.5, color: '#666', marginTop: 4 },

  section: { background: 'white', borderRadius: 12, boxShadow: '0 1px 2px rgba(0,0,0,.06)', overflow: 'hidden' },
  secHead: { width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: '12px 14px',
             fontSize: 13.5, fontWeight: 700, color: '#0d1117', cursor: 'pointer', fontFamily: 'inherit' },
  secBody: { padding: '6px 16px 14px', fontSize: 13, lineHeight: 1.7, color: '#222' },

  p:    { margin: '4px 0' },
  ul:   { paddingLeft: 18, margin: '4px 0' },
  li:   { margin: '3px 0' },
  a:    { color: '#2563eb', textDecoration: 'underline' },

  step: { display: 'flex', gap: 11, padding: '8px 0', borderTop: '1px solid #f0ede8' },
  stepN:{ flex: '0 0 26px', height: 26, borderRadius: '50%', background: '#0d1117', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12.5 },
  stepBody: { flex: 1 },
  stepTitle:{ fontWeight: 700, marginBottom: 3, fontSize: 13.5, color: '#0d1117' },

  note:    { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
             padding: '8px 11px', borderRadius: 7, fontSize: 12, marginTop: 8 },
  example: { background: '#f8f6f2', border: '1px solid #e5e0d8', borderRadius: 7,
             padding: '10px 12px', marginTop: 8 },
  errBox:  { background: '#fff5f5', border: '1px solid #ffd0d0', borderRadius: 8,
             padding: '10px 12px', marginTop: 8 },
  errTitle:{ fontWeight: 700, color: '#991b1b', marginBottom: 4 },

  qa:   { padding: '8px 0', borderTop: '1px solid #f0ede8' },
  q:    { fontWeight: 700, color: '#0d1117', fontSize: 13 },
  qaA:  { color: '#444', fontSize: 13, marginTop: 4, lineHeight: 1.7 },

  side: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 },
  card: { background: '#fafaf6', borderRadius: 8, padding: '10px 12px', border: '1px solid #f0ede8' },
  cardTitle:{ fontWeight: 700, marginBottom: 6, color: '#0d1117', fontSize: 13 },
};
