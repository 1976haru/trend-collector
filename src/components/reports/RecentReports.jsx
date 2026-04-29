// ─────────────────────────────────────────────
// RecentReports.jsx — 최근 생성된 리포트 목록
// 각 리포트를 새 창으로 보거나(인쇄/PDF), 메일로 재발송
// ─────────────────────────────────────────────

import { useState } from 'react';
import { reportHtmlUrl } from '../../services/api.js';

function fmtKST(iso) {
  try { return new Date(iso).toLocaleString('ko-KR'); } catch { return iso || ''; }
}

export default function RecentReports({ reports, loading, onRefresh, onEmail, onCollect }) {
  const [busy, setBusy] = useState('');

  async function send(id) {
    setBusy(id);
    try { await onEmail(id); }
    finally { setBusy(''); }
  }

  return (
    <div>
      <div style={S.actBar}>
        <button style={S.dark} onClick={onCollect} disabled={loading}>
          {loading ? '⏳ 처리 중...' : '🔍 지금 즉시 수집'}
        </button>
        <button style={S.ghost} onClick={onRefresh} disabled={loading}>↻ 새로고침</button>
      </div>

      {!reports.length ? (
        <div style={S.empty}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          생성된 리포트가 없습니다. 위에서 “지금 즉시 수집” 을 눌러보세요.
        </div>
      ) : (
        <ul style={S.list}>
          {reports.map(r => (
            <li key={r.id} style={S.item}>
              <div style={S.info}>
                <div style={S.title}>
                  {fmtKST(r.generatedAt)} · {r.count}건
                  {r.trigger === 'scheduled' && <span style={S.badge}>예약</span>}
                  {r.emailedTo?.length > 0 && <span style={S.badgeOk}>📧 발송됨</span>}
                </div>
                <div style={S.meta}>
                  {(r.keywords || []).join(', ') || '키워드 없음'} · ID {r.id}
                </div>
              </div>
              <div style={S.actions}>
                <a href={reportHtmlUrl(r.id)} target="_blank" rel="noreferrer" style={S.linkBtn}>
                  📄 보기 / PDF
                </a>
                <button style={S.mail} onClick={() => send(r.id)} disabled={busy === r.id}>
                  {busy === r.id ? '발송 중…' : '✉️ 메일 발송'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const S = {
  actBar: { display: 'flex', gap: 8, marginBottom: 12 },
  dark:   { flex: 1, padding: '10px 12px', borderRadius: 8, border: 'none', background: '#0d1117', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  ghost:  { padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d5d0c8', background: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  empty:  { textAlign: 'center', padding: '40px 20px', color: '#888', fontSize: 13, background: 'white', borderRadius: 12 },
  list:   { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  item:   { background: 'white', borderRadius: 10, padding: '11px 14px', boxShadow: '0 1px 2px rgba(0,0,0,.06)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  info:   { flex: '1 1 220px' },
  title:  { fontSize: 13, fontWeight: 700, color: '#0d1117', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  meta:   { fontSize: 11, color: '#888', marginTop: 3 },
  badge:  { fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#fde68a', color: '#92400e', fontWeight: 600 },
  badgeOk:{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#dcfce7', color: '#166534', fontWeight: 600 },
  actions:{ display: 'flex', gap: 6 },
  linkBtn:{ padding: '6px 11px', borderRadius: 7, border: '1.5px solid #0d1117', background: 'white', color: '#0d1117', fontSize: 11.5, fontWeight: 600, textDecoration: 'none' },
  mail:   { padding: '6px 11px', borderRadius: 7, border: 'none', background: '#22c55e', color: 'white', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};
