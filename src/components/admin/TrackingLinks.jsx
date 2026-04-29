// ─────────────────────────────────────────────
// TrackingLinks.jsx — 보도자료 추적 링크 관리
// 생성된 /r/:id 링크를 통해 클릭 수를 측정한다.
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import * as api from '../../services/api.js';
import { fmtFull, fmtRelative } from '../../utils/datetime.js';

export default function TrackingLinks() {
  const [items,   setItems]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');
  const [ok,      setOk]      = useState('');
  const [form,    setForm]    = useState({ title: '', originalUrl: '', agency: '', department: '' });

  async function refresh() {
    setBusy(true); setError('');
    try {
      const r = await api.listTrackingLinks();
      setItems(r.items || []);
      setTotal(r.totalClicks || 0);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function onCreate(e) {
    e.preventDefault();
    setError(''); setOk('');
    if (!form.title.trim() || !form.originalUrl.trim()) {
      setError('제목과 원문 URL 은 필수입니다.');
      return;
    }
    setBusy(true);
    try {
      const r = await api.createTrackingLink(form);
      setItems(list => [r.link, ...list]);
      setForm({ title: '', originalUrl: '', agency: '', department: '' });
      setOk(`✅ 추적 링크 생성 — ${r.link.id}`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    if (!confirm('이 추적 링크를 삭제하시겠습니까? 누적 클릭 수도 사라집니다.')) return;
    setBusy(true); setError('');
    try {
      await api.deleteTrackingLink(id);
      setItems(list => list.filter(l => l.id !== id));
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function copyLink(id) {
    const url = api.trackingRedirectUrl(id);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(
        () => setOk(`📋 복사됨 — ${url}`),
        () => setError('클립보드 복사에 실패했습니다.'),
      );
    } else {
      window.prompt('이 URL 을 복사하세요', url);
    }
  }

  return (
    <div>
      <div style={S.head}>
        <div style={S.headInfo}>
          📊 등록 링크 <strong>{items.length}건</strong> · 누적 클릭 <strong>{total}회</strong>
        </div>
        <button onClick={refresh} disabled={busy} style={S.refresh}>
          {busy ? '⏳' : '↻'} 새로고침
        </button>
      </div>

      {error && <div style={S.err}>⚠️ {error}</div>}
      {ok    && <div style={S.ok}>{ok}</div>}

      <form onSubmit={onCreate} style={S.form}>
        <div style={S.label}>➕ 추적 링크 생성</div>
        <input style={S.inp} placeholder="제목 (예: 보호관찰 정책 홍보 보도자료)"
          value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
        <input style={S.inp} placeholder="원문 URL (https://...)"
          value={form.originalUrl} onChange={e => setForm(f => ({ ...f, originalUrl: e.target.value }))} />
        <div style={S.row2}>
          <input style={S.inp} placeholder="배포 기관 (예: 법무부)"
            value={form.agency} onChange={e => setForm(f => ({ ...f, agency: e.target.value }))} />
          <input style={S.inp} placeholder="담당 부서 (예: 대변인실)"
            value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
        </div>
        <button type="submit" style={S.btn} disabled={busy}>
          {busy ? '⏳ 생성 중…' : '추적 링크 생성'}
        </button>
        <div style={S.note}>
          생성된 링크는 <code>/r/추적ID</code> 형태로, 사용자가 클릭하면 자동으로 원문 URL 로 이동하면서 클릭 수가 1 증가합니다. 보도자료 배포 시 원문 URL 대신 이 추적 링크를 사용하세요.
        </div>
      </form>

      {items.length === 0 ? (
        <div style={S.empty}>아직 등록된 추적 링크가 없습니다.</div>
      ) : (
        <ul style={S.list}>
          {items.map(l => {
            const url = api.trackingRedirectUrl(l.id);
            return (
              <li key={l.id} style={S.item}>
                <div style={S.itemHead}>
                  <strong style={S.itemTitle}>{l.title}</strong>
                  <span style={S.clicks}>👆 {l.clickCount || 0}회</span>
                </div>
                <div style={S.itemMeta}>
                  {l.agency && <span>🏛 {l.agency}</span>}
                  {l.department && <span> · {l.department}</span>}
                  <span> · 생성 {fmtRelative(l.createdAt)}</span>
                  {l.lastClickedAt && <span> · 최근 클릭 {fmtRelative(l.lastClickedAt)}</span>}
                </div>
                <div style={S.itemUrlRow}>
                  <span style={S.urlLabel}>추적 URL</span>
                  <a href={url} target="_blank" rel="noopener noreferrer" style={S.urlLink}>{url}</a>
                  <button onClick={() => copyLink(l.id)} style={S.copy}>📋 복사</button>
                </div>
                <div style={S.itemUrlRow}>
                  <span style={S.urlLabelDim}>원문</span>
                  <a href={l.originalUrl} target="_blank" rel="noopener noreferrer" style={S.origLink}>{l.originalUrl}</a>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button onClick={() => onDelete(l.id)} style={S.delBtn}>삭제</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const S = {
  head:     { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 },
  headInfo: { flex: 1, fontSize: 13, color: '#444' },
  refresh:  { padding: '7px 12px', minHeight: 38, borderRadius: 7,
              border: '1.5px solid #d5d0c8', background: 'white', fontSize: 12,
              cursor: 'pointer', fontFamily: 'inherit' },
  err:      { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030',
              padding: '10px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 11 },
  ok:       { background: '#dcfce7', border: '1px solid #86efac', color: '#166534',
              padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 11 },

  form:     { background: 'white', borderRadius: 10, padding: 13, marginBottom: 12,
              boxShadow: '0 1px 2px rgba(0,0,0,.06)', display: 'flex', flexDirection: 'column', gap: 7 },
  label:    { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 4 },
  inp:      { border: '2px solid #e5e0d8', borderRadius: 8, padding: '9px 11px',
              fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fafaf8', minHeight: 40 },
  row2:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 },
  btn:      { padding: '10px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', background: '#0d1117', color: 'white', fontFamily: 'inherit', minHeight: 42 },
  note:     { fontSize: 11.5, color: '#666', lineHeight: 1.6,
              background: '#fafaf6', borderRadius: 6, padding: '8px 11px' },

  empty:    { textAlign: 'center', padding: '40px 20px', color: '#888', fontSize: 13,
              background: 'white', borderRadius: 12 },

  list:     { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  item:     { background: 'white', borderRadius: 10, padding: '12px 14px',
              boxShadow: '0 1px 2px rgba(0,0,0,.06)', display: 'flex', flexDirection: 'column', gap: 6 },
  itemHead: { display: 'flex', alignItems: 'center', gap: 8 },
  itemTitle:{ flex: 1, fontSize: 14, color: '#0d1117' },
  clicks:   { fontSize: 13, fontWeight: 700, color: '#16a34a',
              background: '#dcfce7', padding: '3px 10px', borderRadius: 12 },
  itemMeta: { fontSize: 11.5, color: '#666' },
  itemUrlRow:{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap' },
  urlLabel: { fontSize: 11, fontWeight: 700, color: '#0d1117' },
  urlLabelDim: { fontSize: 11, fontWeight: 700, color: '#888' },
  urlLink:  { color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all' },
  origLink: { color: '#666', wordBreak: 'break-all', fontSize: 11.5 },
  copy:     { padding: '4px 10px', minHeight: 28, borderRadius: 6,
              border: '1px solid #d5d0c8', background: 'white', color: '#444',
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  delBtn:   { padding: '4px 10px', minHeight: 28, borderRadius: 6,
              border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626',
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};
