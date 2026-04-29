// ─────────────────────────────────────────────
// Login.jsx — 단일 비밀번호 입력 화면
// ─────────────────────────────────────────────

import { useState } from 'react';

export default function Login({ onSubmit, loading, error }) {
  const [pw, setPw] = useState('');

  function handle(e) {
    e.preventDefault();
    if (pw) onSubmit(pw);
  }

  return (
    <div style={S.wrap}>
      <form onSubmit={handle} style={S.card}>
        <div style={S.logo}>📰</div>
        <h1 style={S.title}>Trend Collector</h1>
        <p style={S.sub}>내부 직원 전용 — 접근 비밀번호를 입력하세요.</p>

        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="ADMIN_PASSWORD"
          value={pw}
          onChange={e => setPw(e.target.value)}
          style={S.input}
          disabled={loading}
        />

        {error && <div style={S.err}>⚠️ {error}</div>}

        <button type="submit" disabled={loading || !pw} style={S.btn}>
          {loading ? '확인 중...' : '들어가기'}
        </button>

        <div style={S.note}>
          비밀번호는 운영자가 Render 환경변수 <code>ADMIN_PASSWORD</code> 로 관리합니다.
        </div>
      </form>
    </div>
  );
}

const S = {
  wrap:   { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f0ede8', padding: 16 },
  card:   { width: '100%', maxWidth: 360, background: 'white', borderRadius: 14,
            padding: '28px 24px', boxShadow: '0 6px 24px rgba(0,0,0,.08)',
            display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' },
  logo:   { fontSize: 36 },
  title:  { fontSize: 18, margin: 0, fontWeight: 700 },
  sub:    { fontSize: 12, color: '#666', margin: 0, marginBottom: 8 },
  input:  { width: '100%', padding: '11px 13px', fontSize: 14, border: '2px solid #e5e0d8',
            borderRadius: 9, outline: 'none', background: '#fafaf8', boxSizing: 'border-box',
            fontFamily: 'inherit' },
  btn:    { padding: '11px 16px', fontSize: 14, fontWeight: 700, color: 'white',
            background: '#0d1117', border: 'none', borderRadius: 9, cursor: 'pointer',
            fontFamily: 'inherit' },
  err:    { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030',
            padding: '8px 10px', borderRadius: 8, fontSize: 12 },
  note:   { fontSize: 11, color: '#999', marginTop: 6 },
};
