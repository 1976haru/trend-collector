// ─────────────────────────────────────────────
// ChangelogTab.jsx — 관리/설정 → 변경이력 탭
// /api/version 의 changelog 배열을 시간순으로 표시.
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { getVersionInfo } from '../../services/api.js';

export default function ChangelogTab() {
  const [info, setInfo] = useState(null);
  const [err,  setErr]  = useState('');

  useEffect(() => {
    getVersionInfo()
      .then(setInfo)
      .catch(e => setErr(e.message || String(e)));
  }, []);

  if (err)  return <div style={S.err}>⚠️ 변경이력을 불러오지 못했습니다: {err}</div>;
  if (!info) return <div style={S.loading}>⏳ 변경이력 로딩 중…</div>;

  return (
    <div>
      <div style={S.head}>
        <div>
          <div style={S.appName}>{info.appName}</div>
          <div style={S.version}>현재 버전 <strong>v{info.version}</strong></div>
          {info.latest?.date && (
            <div style={S.subDate}>최신 업데이트 {info.latest.date}</div>
          )}
        </div>
      </div>

      <ul style={S.list}>
        {(info.changelog || []).map(v => (
          <li key={v.version} style={S.versionBlock}>
            <div style={S.versionHead}>
              <span style={S.versionTag}>v{v.version}</span>
              <span style={S.versionTitle}>{v.title}</span>
              {v.date && <span style={S.versionDate}>{v.date}</span>}
              {v.type && <span style={{ ...S.typeTag, ...TYPE_STYLE[v.type] }}>{TYPE_LABEL[v.type] || v.type}</span>}
            </div>

            {v.highlights?.length > 0 && (
              <Group label="✨ 주요 개선" items={v.highlights} color="#1d4ed8" />
            )}
            {v.fixes?.length > 0 && (
              <Group label="🐛 오류 수정" items={v.fixes} color="#16a34a" />
            )}
            {v.notes?.length > 0 && (
              <Group label="ℹ️ 주의사항" items={v.notes} color="#9a3412" />
            )}
          </li>
        ))}
      </ul>

      <div style={S.note}>
        <strong>버전 증가 규칙</strong> — 1.0.0 운영 기준판 / 1.1.0 기능 추가·큰 개선 / 1.0.1 버그 수정 / 2.0.0 대규모 개편.
      </div>
    </div>
  );
}

function Group({ label, items, color }) {
  return (
    <div style={S.group}>
      <div style={{ ...S.groupHead, color }}>{label}</div>
      <ul style={S.itemList}>
        {items.map((t, i) => <li key={i} style={S.item}>{t}</li>)}
      </ul>
    </div>
  );
}

const TYPE_LABEL = { major: '메이저', minor: '마이너', patch: '패치', hotfix: '핫픽스' };
const TYPE_STYLE = {
  major:  { background: '#dbeafe', color: '#1d4ed8' },
  minor:  { background: '#dcfce7', color: '#166534' },
  patch:  { background: '#fef3c7', color: '#92400e' },
  hotfix: { background: '#fee2e2', color: '#b91c1c' },
};

const S = {
  err:        { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030', padding: '11px 14px', borderRadius: 9, fontSize: 13 },
  loading:    { padding: 24, textAlign: 'center', color: '#666', fontSize: 13 },
  head:       { background: 'white', borderRadius: 12, padding: '14px 16px', marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  appName:    { fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px' },
  version:    { fontSize: 17, color: '#0d1117', marginTop: 4 },
  subDate:    { fontSize: 11.5, color: '#666', marginTop: 4 },
  list:       { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 },
  versionBlock:{ background: 'white', borderRadius: 12, padding: '13px 16px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  versionHead:{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9, flexWrap: 'wrap' },
  versionTag: { fontSize: 11.5, fontWeight: 800, color: '#0d1117', background: '#f0ede8', padding: '3px 10px', borderRadius: 12 },
  versionTitle:{ fontSize: 14, fontWeight: 700, color: '#0d1117' },
  versionDate:{ fontSize: 11.5, color: '#888' },
  typeTag:    { fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 9 },
  group:      { marginTop: 6 },
  groupHead:  { fontSize: 11.5, fontWeight: 800, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' },
  itemList:   { listStyle: 'none', padding: 0, margin: 0 },
  item:       { fontSize: 12.5, color: '#0d1117', padding: '3px 0 3px 16px', position: 'relative', lineHeight: 1.6 },
  note:       { marginTop: 14, padding: '9px 12px', background: '#fafaf6', border: '1px solid #f0ede8', borderRadius: 7, fontSize: 11.5, color: '#666', lineHeight: 1.6 },
};
