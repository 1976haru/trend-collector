// ─────────────────────────────────────────────
// TabBar.jsx — 메인 탭 라우팅
// ─────────────────────────────────────────────

const TABS = [
  { id: 'search',   label: '키워드',  icon: '🏷' },
  { id: 'news',     label: '뉴스',    icon: '📰' },
  { id: 'sources',  label: '언론사',  icon: '📡' },
  { id: 'analysis', label: '분석',    icon: '📊' },
  { id: 'schedule', label: '스케줄',  icon: '⏰' },
  { id: 'notify',   label: '알림',    icon: '🔔' },
];

export default function TabBar({ active, onChange, counts = {} }) {
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
