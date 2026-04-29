// ─────────────────────────────────────────────
// TabBar.jsx — 메인 탭 (MVP 5개)
// ─────────────────────────────────────────────

const TABS = [
  { id: 'keywords', label: '키워드',  icon: '🏷' },
  { id: 'reports',  label: '리포트',  icon: '📰' },
  { id: 'mail',     label: '수신자',  icon: '📧' },
];

export default function TabBar({ active, onChange, counts = {}, onLogout }) {
  return (
    <nav style={S.bar}>
      {TABS.map(t => {
        const on = active === t.id;
        const cnt = counts[t.id];
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{ ...S.btn, ...(on ? S.on : {}) }}
          >
            <span style={S.icon}>{t.icon}</span>
            <span style={S.lbl}>
              {t.label}
              {cnt ? <span style={S.cnt}>{cnt}</span> : null}
            </span>
          </button>
        );
      })}
      {onLogout && (
        <button onClick={onLogout} style={{ ...S.btn, color: '#ef4444' }} title="로그아웃">
          <span style={S.icon}>🚪</span>
          <span style={S.lbl}>로그아웃</span>
        </button>
      )}
    </nav>
  );
}

const S = {
  bar:  { display: 'flex', gap: 4, background: 'white', borderRadius: 12, padding: 4,
          marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,.06)', overflowX: 'auto' },
  btn:  { flex: 1, minWidth: 64, padding: '7px 4px', borderRadius: 9, border: 'none',
          background: 'transparent', cursor: 'pointer', display: 'flex',
          flexDirection: 'column', alignItems: 'center', gap: 2,
          color: '#666', fontFamily: 'inherit' },
  on:   { background: '#0d1117', color: 'white' },
  icon: { fontSize: 15 },
  lbl:  { fontSize: 10.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 },
  cnt:  { background: 'rgba(255,255,255,.18)', borderRadius: 8, padding: '0 5px', fontSize: 9.5 },
};
