// ─────────────────────────────────────────────
// ReportMetaSettings.jsx — 제출용 보고서 메타 (표지 정보)
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import * as api from '../../services/api.js';

const DEFAULT = {
  organization: '법무부',
  department:   '대변인실',
  author:       '',
  classification: '내부 검토용',
  purpose:      '법무부 정책 및 주요 업무 관련 언론 보도 동향을 일일 단위로 모니터링하여 신속한 대응 자료로 활용함.',
};

export default function ReportMetaSettings() {
  const [meta,    setMeta]    = useState(DEFAULT);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [ok,      setOk]      = useState('');

  useEffect(() => {
    api.getConfig()
      .then(c => setMeta({ ...DEFAULT, ...(c.reportMeta || {}) }))
      .catch(e => setError(e.message || String(e)));
  }, []);

  async function save() {
    setLoading(true); setError(''); setOk('');
    try {
      await api.putConfig({ reportMeta: meta });
      setOk('✅ 보고서 정보 저장됨.');
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function update(k, v) {
    setMeta(m => ({ ...m, [k]: v }));
  }

  return (
    <div style={S.box}>
      <div style={S.label}>📋 제출용 Word 보고서 표지 정보</div>
      {error && <div style={S.err}>⚠️ {error}</div>}
      {ok    && <div style={S.ok}>{ok}</div>}

      <div style={S.row2}>
        <Field label="기관명">
          <input style={S.inp} value={meta.organization}
            onChange={e => update('organization', e.target.value)} />
        </Field>
        <Field label="담당 부서">
          <input style={S.inp} value={meta.department}
            onChange={e => update('department', e.target.value)} />
        </Field>
      </div>
      <div style={S.row2}>
        <Field label="작성자">
          <input style={S.inp} placeholder="(자동 생성)"
            value={meta.author} onChange={e => update('author', e.target.value)} />
        </Field>
        <Field label="보안 등급">
          <select style={S.inp} value={meta.classification}
            onChange={e => update('classification', e.target.value)}>
            <option>내부 검토용</option>
            <option>대외 공개용</option>
            <option>대외주의</option>
            <option>대외비</option>
          </select>
        </Field>
      </div>
      <Field label="수집 목적 (보고서 1.보고개요에 표시)">
        <textarea style={{ ...S.inp, minHeight: 70, resize: 'vertical' }}
          value={meta.purpose} onChange={e => update('purpose', e.target.value)} />
      </Field>

      <button onClick={save} disabled={loading} style={S.btn}>
        {loading ? '⏳ 저장 중…' : '💾 저장'}
      </button>
      <div style={S.note}>
        이 정보는 Word 보고서의 <strong>표지</strong>와 <strong>1. 보고 개요</strong> 섹션에 자동 삽입됩니다. 모든 직원이 공유합니다.
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={S.field}>
      <span style={S.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

const S = {
  box:      { background: 'white', borderRadius: 10, padding: 14, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label:    { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 11 },
  err:      { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030',
              padding: '10px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 11 },
  ok:       { background: '#dcfce7', border: '1px solid #86efac', color: '#166534',
              padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 11 },
  row2:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 },
  field:    { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginBottom: 8 },
  fieldLabel:{ fontSize: 11.5, fontWeight: 600, color: '#444' },
  inp:      { border: '2px solid #e5e0d8', borderRadius: 8, padding: '9px 11px',
              fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fafaf8' },
  btn:      { padding: '10px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', background: '#0d1117', color: 'white', fontFamily: 'inherit', minHeight: 42, marginTop: 8 },
  note:     { fontSize: 11.5, color: '#666', lineHeight: 1.6, marginTop: 10,
              background: '#fafaf6', borderRadius: 6, padding: '8px 11px' },
};
