// ─────────────────────────────────────────────
// ScheduleSettings.jsx — 서버 cron 상태 표시 (읽기 전용)
// 실제 시각은 서버 환경변수 REPORT_TIME 으로 관리.
// ─────────────────────────────────────────────

export default function ScheduleSettings({ health }) {
  const time = health?.reportTime || '09:00';
  const smtp = !!health?.smtp;

  return (
    <div>
      <div style={S.panel}>
        <div style={S.label}>⏰ 자동 수집 스케줄</div>
        <table style={S.tbl}>
          <tbody>
            <tr><th style={S.th}>일일 실행 시각</th><td style={S.td}><strong>매일 {time} (Asia/Seoul)</strong></td></tr>
            <tr><th style={S.th}>실행 동작</th><td style={S.td}>RSS 수집 → 중복·광고 필터 → 리포트 저장 → 메일 발송</td></tr>
            <tr><th style={S.th}>SMTP 발송</th><td style={S.td}>{smtp ? '✅ 활성' : '⚠️ SMTP_HOST 미설정 — 메일은 발송되지 않음'}</td></tr>
          </tbody>
        </table>
        <div style={S.tip}>
          시각을 변경하려면 Render 환경변수 <code>REPORT_TIME</code> 을 <code>HH:MM</code> 형식 (예: <code>08:30</code>) 으로 설정한 뒤 서비스를 재시작하세요.
        </div>
      </div>
    </div>
  );
}

const S = {
  panel: { background: 'white', borderRadius: 12, padding: 15, marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label: { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 10 },
  tbl:   { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th:    { textAlign: 'left', color: '#666', fontWeight: 600, padding: '7px 6px', borderBottom: '1px solid #f0ede8', width: '36%' },
  td:    { padding: '7px 6px', borderBottom: '1px solid #f0ede8' },
  tip:   { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 11, fontSize: 11.5, color: '#92400e', lineHeight: 1.6, marginTop: 12 },
};
