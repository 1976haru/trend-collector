// ─────────────────────────────────────────────
// RecipientSettings.jsx — 메일 수신자 등록 (서버 공유)
// ─────────────────────────────────────────────

import { useState } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RecipientSettings({ recipients, onAdd, onRemove }) {
  const [input, setInput] = useState('');
  const [warn,  setWarn]  = useState('');

  function handleAdd() {
    const v = input.trim();
    if (!v) return;
    if (!EMAIL_RE.test(v)) { setWarn('올바른 이메일 형식이 아닙니다.'); return; }
    if (recipients.includes(v)) { setWarn('이미 등록된 주소입니다.'); return; }
    onAdd(v);
    setInput(''); setWarn('');
  }

  return (
    <div>
      <div style={S.panel}>
        <div style={S.label}>📧 메일 수신자 (서버 공유)</div>
        <div style={S.info}>
          이 목록의 모든 주소로 일일 보고 메일이 발송됩니다.
          SMTP 환경변수가 설정되어야 실제 발송이 가능합니다.
        </div>

        <div style={S.row}>
          <input
            style={S.inp}
            type="email"
            placeholder="예: dept@example.go.kr"
            value={input}
            onChange={e => { setInput(e.target.value); setWarn(''); }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button style={S.btnDark} onClick={handleAdd}>추가</button>
        </div>
        {warn && <div style={S.warn}>{warn}</div>}

        {recipients.length === 0 ? (
          <div style={S.empty}>등록된 수신자가 없습니다.</div>
        ) : (
          <ul style={S.list}>
            {recipients.map(em => (
              <li key={em} style={S.item}>
                <span>{em}</span>
                <button style={S.rm} onClick={() => onRemove(em)}>삭제</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={S.tip}>
        💡 자동 발송 시각은 서버 환경변수 <code>REPORT_TIME</code> 으로 설정합니다 (기본 09:00 KST).
        스케줄 탭에서 현재 설정을 확인할 수 있습니다.
      </div>
    </div>
  );
}

const S = {
  panel: { background: 'white', borderRadius: 12, padding: 15, marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label: { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 8 },
  info:  { background: '#f8f6f2', borderRadius: 7, padding: 10, fontSize: 11.5, color: '#555', lineHeight: 1.6, marginBottom: 12 },
  row:   { display: 'flex', gap: 7, marginBottom: 6 },
  inp:   { flex: 1, border: '2px solid #e5e0d8', borderRadius: 8, padding: '8px 11px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#fafaf8' },
  btnDark: { padding: '8px 13px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#0d1117', color: 'white', fontFamily: 'inherit' },
  warn:  { color: '#c53030', fontSize: 11.5, marginBottom: 6 },
  empty: { fontSize: 12, color: '#aaa', textAlign: 'center', padding: '14px 0' },
  list:  { listStyle: 'none', padding: 0, margin: 0 },
  item:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0ede8', fontSize: 13 },
  rm:    { padding: '4px 9px', borderRadius: 6, border: '1px solid #ef4444', background: 'white', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' },
  tip:   { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 11, fontSize: 11.5, color: '#92400e', lineHeight: 1.6 },
};
