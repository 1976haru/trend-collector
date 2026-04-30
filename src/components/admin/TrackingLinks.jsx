// ─────────────────────────────────────────────
// TrackingLinks.jsx — 추적 링크 관리 (자동/수동 탭)
//
// 자동 탭: 기관 배포자료가 자동으로 등록된 추적 링크 목록.
//          최신 리포트 ID 를 입력하면 해당 리포트로 재동기화 가능.
// 수동 탭: 사용자가 직접 등록 — 기존 동작 그대로.
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import * as api from '../../services/api.js';
import { fmtRelative } from '../../utils/datetime.js';

const TABS = [
  { id: 'auto',   label: '🤖 자동 추적',   desc: '기관 배포자료가 자동으로 등록됩니다 (수집 시 자동 sync).' },
  { id: 'manual', label: '✍️ 수동 추적',   desc: '직원이 직접 등록한 외부 보도자료 / 캠페인 링크입니다.' },
];

export default function TrackingLinks() {
  const [tab,     setTab]     = useState('auto');
  const [items,   setItems]   = useState([]);
  const [stats,   setStats]   = useState({ total: 0, auto: 0, manual: 0, autoClicks: 0, manualClicks: 0 });
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');
  const [ok,      setOk]      = useState('');
  const [form,    setForm]    = useState({ title: '', originalUrl: '', agency: '', department: '' });
  const [syncReportId, setSyncReportId] = useState('');

  async function refresh() {
    setBusy(true); setError('');
    try {
      const r = await api.listTrackingLinks(tab);
      setItems(r.items || []);
      setStats(r.stats || { total: 0, auto: 0, manual: 0, autoClicks: 0, manualClicks: 0 });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [tab]);

  // 최신 리포트 ID 자동 감지 — 수집 후 동기화 편의
  useEffect(() => {
    if (tab !== 'auto' || syncReportId) return;
    api.listReports().then(r => {
      const items = Array.isArray(r) ? r : (r?.items || []);
      if (items[0]?.id) setSyncReportId(items[0].id);
    }).catch(() => {});
    // eslint-disable-next-line
  }, [tab]);

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
      setOk(`✅ 수동 추적 링크 생성 — ${r.link.id}`);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onAutoSync() {
    if (!syncReportId.trim()) {
      setError('동기화할 리포트 ID 를 입력하세요.');
      return;
    }
    setBusy(true); setError(''); setOk('');
    try {
      const r = await api.autoSyncTrackingLinks(syncReportId.trim());
      setOk(`🔄 자동 추적 동기화 완료 — 신규 ${r.created}건 · 기존 ${r.existing}건 · 제외 ${r.skipped}건 (총 자동 ${r.totalAutoLinks}건)`);
      await refresh();
    } catch (e) {
      setError(`자동 sync 실패: ${e.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id, mode) {
    const label = mode === 'auto'
      ? '이 자동 추적 링크를 제외하시겠습니까? 누적 클릭 수도 사라집니다.\n(다음 자동 sync 시 다시 등록될 수 있습니다.)'
      : '이 수동 추적 링크를 삭제하시겠습니까? 누적 클릭 수도 사라집니다.';
    if (!confirm(label)) return;
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

  function downloadCsv() {
    const rows = [
      ['추적방식', '기관분류', '기관', '부서', '제목', '추적URL', '원문URL', '클릭수', '마지막클릭', '등록일'],
      ...items.map(l => [
        l.trackingMode === 'auto' ? '자동' : '수동',
        l.agencyCategory || '',
        l.agency || '',
        l.department || '',
        l.title || '',
        api.trackingRedirectUrl(l.id),
        l.originalUrl || '',
        l.clickCount || 0,
        l.lastClickedAt || '',
        l.createdAt || '',
      ]),
    ];
    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tracking-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const totalClicks = items.reduce((s, l) => s + (l.clickCount || 0), 0);
  const tabInfo = TABS.find(t => t.id === tab);

  return (
    <div>
      {/* 통계 카드 */}
      <div style={S.statRow}>
        <div style={S.statCard}>
          <div style={S.statHead}>전체</div>
          <div style={S.statValue}>{stats.total}건</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statHead}>🤖 자동</div>
          <div style={S.statValue}>{stats.auto}건</div>
          <div style={S.statSub}>{stats.autoClicks}회 클릭</div>
        </div>
        <div style={S.statCard}>
          <div style={S.statHead}>✍️ 수동</div>
          <div style={S.statValue}>{stats.manual}건</div>
          <div style={S.statSub}>{stats.manualClicks}회 클릭</div>
        </div>
      </div>

      {/* 탭 */}
      <div style={S.tabBar}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ ...S.tab, ...(tab === t.id ? S.tabOn : {}) }}>
            {t.label}
          </button>
        ))}
        <div style={S.spacer} />
        <button onClick={refresh} disabled={busy} style={S.refresh}>{busy ? '⏳' : '↻'} 새로고침</button>
        <button onClick={downloadCsv} disabled={busy || items.length === 0} style={S.refresh}>📊 CSV</button>
      </div>
      <div style={S.tabDesc}>{tabInfo?.desc}</div>

      {error && <div style={S.err}>⚠️ {error}</div>}
      {ok    && <div style={S.ok}>{ok}</div>}

      {/* 자동 탭 — 동기화 폼 */}
      {tab === 'auto' && (
        <div style={S.form}>
          <div style={S.label}>🔄 자동 추적 동기화</div>
          <div style={S.row2}>
            <input style={S.inp} placeholder="리포트 ID (예: mokhlbl5-je4sn)"
              value={syncReportId} onChange={e => setSyncReportId(e.target.value)} />
            <button onClick={onAutoSync} disabled={busy} style={S.btn}>
              {busy ? '⏳' : '🔄 동기화 실행'}
            </button>
          </div>
          <div style={S.note}>
            수집이 완료되면 자동으로 sync 가 실행됩니다. 이 버튼은 누락된 기사를 다시 등록하거나
            특정 리포트로 강제 동기화할 때 사용합니다. 카테고리별 ON/OFF 는 <strong>관리 → 뉴스 소스 설정</strong>에서 변경하세요.
          </div>
        </div>
      )}

      {/* 수동 탭 — 등록 폼 */}
      {tab === 'manual' && (
        <form onSubmit={onCreate} style={S.form}>
          <div style={S.label}>➕ 수동 추적 링크 생성</div>
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
            생성된 링크는 <code>/r/추적ID</code> 형태로, 사용자가 클릭하면 자동으로 원문 URL 로 이동하면서 클릭 수가 1 증가합니다.
            기관 배포자료는 <strong>자동 추적</strong> 탭에서 자동으로 등록되므로 이 화면에서 직접 입력할 필요가 없습니다.
          </div>
        </form>
      )}

      <div style={S.headInfo}>
        📊 {tab === 'auto' ? '자동' : '수동'} 추적 <strong>{items.length}건</strong> · 누적 클릭 <strong>{totalClicks}회</strong>
      </div>

      {items.length === 0 ? (
        <div style={S.empty}>
          {tab === 'auto'
            ? '아직 자동 등록된 기관 배포자료가 없습니다. 다음 수집 후 자동으로 등록됩니다.'
            : '아직 수동 등록된 추적 링크가 없습니다.'}
        </div>
      ) : (
        <ul style={S.list}>
          {items.map(l => {
            const url = api.trackingRedirectUrl(l.id);
            const isAuto = l.trackingMode === 'auto';
            return (
              <li key={l.id} style={S.item}>
                <div style={S.itemHead}>
                  <span style={isAuto ? S.badgeAuto : S.badgeManual}>{isAuto ? '🤖 자동' : '✍️ 수동'}</span>
                  {l.agencyCategory && <span style={S.badgeCat}>{l.agencyCategory}</span>}
                  <strong style={S.itemTitle}>{l.title}</strong>
                  <span style={S.clicks}>👆 {l.clickCount || 0}회</span>
                </div>
                <div style={S.itemMeta}>
                  {l.agency && <span>🏛 {l.agency}</span>}
                  {l.department && <span> · {l.department}</span>}
                  <span> · 등록 {fmtRelative(l.createdAt)}</span>
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
                  <button onClick={() => onDelete(l.id, l.trackingMode)} style={S.delBtn}>
                    {isAuto ? '제외' : '삭제'}
                  </button>
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
  statRow:  { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 11 },
  statCard: { background: 'white', borderRadius: 10, padding: '10px 12px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  statHead: { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.7px' },
  statValue:{ fontSize: 19, fontWeight: 800, color: '#0d1117', marginTop: 3 },
  statSub:  { fontSize: 11, color: '#666', marginTop: 1 },

  tabBar:   { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  tab:      { padding: '7px 13px', minHeight: 38, borderRadius: 7, border: '1.5px solid #d5d0c8', background: 'white', fontSize: 12.5, color: '#444', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
  tabOn:    { background: '#0d1117', color: 'white', borderColor: '#0d1117' },
  tabDesc:  { fontSize: 11.5, color: '#666', marginBottom: 11, lineHeight: 1.5 },
  spacer:   { flex: 1 },
  refresh:  { padding: '7px 12px', minHeight: 38, borderRadius: 7, border: '1.5px solid #d5d0c8', background: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },

  err:      { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030', padding: '10px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 11 },
  ok:       { background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 11 },

  form:     { background: 'white', borderRadius: 10, padding: 13, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,.06)', display: 'flex', flexDirection: 'column', gap: 7 },
  label:    { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 4 },
  inp:      { border: '2px solid #e5e0d8', borderRadius: 8, padding: '9px 11px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fafaf8', minHeight: 40 },
  row2:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 },
  btn:      { padding: '10px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#0d1117', color: 'white', fontFamily: 'inherit', minHeight: 42 },
  note:     { fontSize: 11.5, color: '#666', lineHeight: 1.6, background: '#fafaf6', borderRadius: 6, padding: '8px 11px' },

  headInfo: { fontSize: 12.5, color: '#444', marginBottom: 8 },
  empty:    { textAlign: 'center', padding: '30px 20px', color: '#888', fontSize: 13, background: 'white', borderRadius: 12 },

  list:     { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  item:     { background: 'white', borderRadius: 10, padding: '12px 14px', boxShadow: '0 1px 2px rgba(0,0,0,.06)', display: 'flex', flexDirection: 'column', gap: 6 },
  itemHead: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  itemTitle:{ flex: 1, fontSize: 14, color: '#0d1117', minWidth: 200 },
  clicks:   { fontSize: 13, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '3px 10px', borderRadius: 12 },
  badgeAuto:{ fontSize: 10.5, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '2px 8px', borderRadius: 10 },
  badgeManual:{ fontSize: 10.5, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 10 },
  badgeCat: { fontSize: 10.5, fontWeight: 600, color: '#475569', background: '#e2e8f0', padding: '2px 8px', borderRadius: 10 },
  itemMeta: { fontSize: 11.5, color: '#666' },
  itemUrlRow:{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap' },
  urlLabel: { fontSize: 11, fontWeight: 700, color: '#0d1117' },
  urlLabelDim: { fontSize: 11, fontWeight: 700, color: '#888' },
  urlLink:  { color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all' },
  origLink: { color: '#666', wordBreak: 'break-all', fontSize: 11.5 },
  copy:     { padding: '4px 10px', minHeight: 28, borderRadius: 6, border: '1px solid #d5d0c8', background: 'white', color: '#444', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  delBtn:   { padding: '4px 10px', minHeight: 28, borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
};
