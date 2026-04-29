// ─────────────────────────────────────────────
// AdminPanel.jsx — 기능개선 제안 + 본문 추출 통계
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import * as api from '../../services/api.js';
import { fmtFull, fmtRelative } from '../../utils/datetime.js';

export default function AdminPanel() {
  const [feedback, setFeedback] = useState([]);
  const [unread,   setUnread]   = useState(0);
  const [stats,    setStats]    = useState([]);
  const [tab,      setTab]      = useState('feedback');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function refresh() {
    setLoading(true); setError('');
    try {
      const [f, s] = await Promise.all([
        api.listFeedback().catch(e => { throw e; }),
        api.getExtractionStats().catch(() => ({ items: [] })),
      ]);
      setFeedback(f.items || []);
      setUnread(f.unread || 0);
      setStats(s.items || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function toggleRead(id, current) {
    try {
      await api.markFeedbackRead(id, !current);
      setFeedback(list => list.map(f => f.id === id ? { ...f, read: !current, readAt: !current ? new Date().toISOString() : null } : f));
      setUnread(n => current ? n + 1 : Math.max(0, n - 1));
    } catch (e) {
      alert(`❌ ${e.message}`);
    }
  }

  return (
    <div>
      <div style={S.tabBar}>
        <button onClick={() => setTab('feedback')}
          style={{ ...S.tab, ...(tab === 'feedback' ? S.tabOn : {}) }}>
          📨 기능 제안 {feedback.length > 0 && (
            <span style={S.tabCount}>{feedback.length}{unread > 0 && ` · 미열람 ${unread}`}</span>
          )}
        </button>
        <button onClick={() => setTab('stats')}
          style={{ ...S.tab, ...(tab === 'stats' ? S.tabOn : {}) }}>
          📈 추출 실패 도메인 {stats.length > 0 && <span style={S.tabCount}>{stats.length}</span>}
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={refresh} disabled={loading} style={S.refresh}>
          {loading ? '⏳' : '↻'} 새로고침
        </button>
      </div>

      {error && <div style={S.err}>⚠️ {error}</div>}

      {tab === 'feedback' && (
        feedback.length === 0
          ? <div style={S.empty}>접수된 제안이 없습니다.</div>
          : <ul style={S.list}>
              {feedback.map(f => (
                <li key={f.id} style={{ ...S.item, ...(f.read ? {} : S.itemNew) }}>
                  <div style={S.itemHead}>
                    <span style={S.severity(f.severity)}>{f.severity || '보통'}</span>
                    <strong style={S.itemTitle}>{f.title}</strong>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => toggleRead(f.id, f.read)} style={S.readBtn}>
                      {f.read ? '읽음 ✓' : '읽음 처리'}
                    </button>
                  </div>
                  <div style={S.itemMeta}>
                    {f.name && <span>👤 {f.name}</span>}
                    {f.contact && <span> · ✉ {f.contact}</span>}
                    <span> · 📅 {fmtFull(f.receivedAt)} ({fmtRelative(f.receivedAt)})</span>
                    {f.mailSent === true  && <span style={{ color: '#16a34a' }}> · ✉️ 메일 발송됨</span>}
                    {f.mailSent === false && <span style={{ color: '#888' }}> · ✉️ 미발송 (저장만)</span>}
                  </div>
                  <div style={S.itemBody}>{f.content}</div>
                  {f.pageUrl && (
                    <div style={S.itemUrl}>
                      <a href={f.pageUrl} target="_blank" rel="noopener noreferrer">{f.pageUrl}</a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
      )}

      {tab === 'stats' && (
        stats.length === 0
          ? <div style={S.empty}>아직 수집된 통계가 없습니다.</div>
          : <div style={S.statsBox}>
              <div style={S.statsHead}>
                <span>도메인</span>
                <span>전체</span>
                <span>성공</span>
                <span>실패</span>
                <span>성공률</span>
              </div>
              {stats.slice(0, 30).map(s => (
                <div key={s.host} style={S.statsRow}>
                  <span style={S.statsHost}>{s.host}</span>
                  <span>{s.total}</span>
                  <span style={{ color: '#16a34a' }}>{s.success}</span>
                  <span style={{ color: s.failed > 0 ? '#dc2626' : '#888' }}>{s.failed}</span>
                  <span style={{ color: s.rate >= 80 ? '#16a34a' : s.rate >= 50 ? '#f59e0b' : '#dc2626', fontWeight: 700 }}>
                    {s.rate}%
                  </span>
                </div>
              ))}
            </div>
      )}
    </div>
  );
}

const S = {
  tabBar:  { display: 'flex', gap: 6, alignItems: 'center', background: 'white', borderRadius: 10, padding: 6,
             marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)', flexWrap: 'wrap' },
  tab:     { padding: '8px 12px', minHeight: 38, borderRadius: 7, border: 'none',
             background: 'transparent', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
             color: '#555', fontFamily: 'inherit' },
  tabOn:   { background: '#0d1117', color: 'white' },
  tabCount:{ marginLeft: 5, fontSize: 11, opacity: .8 },
  refresh: { padding: '7px 12px', minHeight: 38, borderRadius: 7,
             border: '1.5px solid #d5d0c8', background: 'white', fontSize: 12,
             cursor: 'pointer', fontFamily: 'inherit' },

  err:     { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030',
             padding: '10px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 11 },
  empty:   { textAlign: 'center', padding: '40px 20px', color: '#888', fontSize: 13,
             background: 'white', borderRadius: 12 },

  list:    { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  item:    { background: 'white', borderRadius: 10, padding: '12px 14px',
             boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  itemNew: { borderLeft: '4px solid #f59e0b' },
  itemHead:{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  itemTitle:{ fontSize: 14, color: '#0d1117' },
  itemMeta: { fontSize: 11.5, color: '#666', marginBottom: 7 },
  itemBody: { fontSize: 13, color: '#222', lineHeight: 1.6, whiteSpace: 'pre-wrap',
              background: '#fafaf6', borderRadius: 6, padding: '8px 11px' },
  itemUrl:  { fontSize: 11, color: '#888', marginTop: 6, wordBreak: 'break-all' },
  readBtn:  { padding: '5px 10px', minHeight: 30, borderRadius: 6,
              border: '1px solid #d5d0c8', background: 'white', color: '#444',
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  severity: (s) => {
    const map = { '낮음': '#94a3b8', '보통': '#3b82f6', '높음': '#f59e0b', '긴급': '#dc2626' };
    return { padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, color: 'white',
             background: map[s] || '#3b82f6' };
  },

  statsBox:  { background: 'white', borderRadius: 10, padding: '8px 10px',
               boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  statsHead: { display: 'grid', gridTemplateColumns: '2fr 60px 60px 60px 70px', gap: 6,
               padding: '7px 0', borderBottom: '1.5pt solid #0d1117',
               fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' },
  statsRow:  { display: 'grid', gridTemplateColumns: '2fr 60px 60px 60px 70px', gap: 6,
               padding: '7px 0', borderBottom: '1px solid #f0ede8',
               fontSize: 12.5, color: '#222' },
  statsHost: { fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#0d1117', wordBreak: 'break-all' },
};
