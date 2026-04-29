// ─────────────────────────────────────────────
// SourceSettings.jsx — 관리자 뉴스 소스 설정
// Naver News API 키를 환경변수 대신 웹에서 입력·테스트.
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import * as api from '../../services/api.js';

export default function SourceSettings() {
  const [stored, setStored]   = useState(null);
  const [prefs,  setPrefs]    = useState({ useGoogleNews: true, useNaverNews: false });
  const [active, setActive]   = useState({ naverConfigured: false, naverSource: 'none' });
  const [envHasNaver, setEnvHasNaver] = useState(false);
  const [form, setForm]       = useState({
    useGoogleNews: true, useNaverNews: false,
    naverEnabled: false, naverClientId: '', naverClientSecret: '',
  });
  const [secretTouched, setSecretTouched] = useState(false);
  const [testKeyword, setTestKeyword] = useState('법무부');
  const [busy, setBusy]       = useState('');
  const [msg,  setMsg]        = useState(null);

  async function refresh() {
    setBusy('load'); setMsg(null);
    try {
      const r = await api.getSourceSettings();
      setStored(r.stored);
      setPrefs(r.preferences || { useGoogleNews: true, useNaverNews: false });
      setActive({ naverConfigured: r.naverConfigured, naverSource: r.naverSource });
      setEnvHasNaver(!!r.envHasNaver);
      setForm({
        useGoogleNews:     !!r.preferences?.useGoogleNews,
        useNaverNews:      !!r.preferences?.useNaverNews,
        naverEnabled:      !!r.stored.naverEnabled,
        naverClientId:     r.stored.naverClientId || '',
        naverClientSecret: '',
      });
      setSecretTouched(false);
    } catch (e) {
      setMsg({ type: 'err', text: e.message || String(e) });
    } finally {
      setBusy('');
    }
  }
  useEffect(() => { refresh(); }, []);

  async function save() {
    setBusy('save'); setMsg(null);
    try {
      const patch = {
        useGoogleNews: form.useGoogleNews,
        useNaverNews:  form.useNaverNews,
        naverEnabled:  form.naverEnabled,
        naverClientId: form.naverClientId,
      };
      // secret 칸 안 건드린 경우 페이로드에서 제외 → 기존 값 유지
      if (secretTouched) patch.naverClientSecret = form.naverClientSecret;
      const r = await api.saveSourceSettings(patch);
      setStored(r.stored);
      setPrefs(r.preferences);
      setActive({ naverConfigured: r.naverConfigured, naverSource: r.naverSource });
      setForm(f => ({ ...f, naverClientSecret: '' }));
      setSecretTouched(false);
      setMsg({ type: 'ok', text: '✅ 저장 완료. Naver 모듈 캐시가 새 설정으로 재구성되었습니다.' });
    } catch (e) {
      setMsg({ type: 'err', text: e.message || String(e) });
    } finally {
      setBusy('');
    }
  }

  async function runTest() {
    setBusy('test'); setMsg(null);
    try {
      const r = await api.testNaver(testKeyword);
      setMsg({
        type: 'ok',
        text: `✅ 테스트 성공 — '${r.keyword}' 검색 결과 ${r.count}건 (전체 매칭 ${r.total}건). 샘플 5건:\n${
          (r.sample || []).slice(0, 5).map((x, i) => `${i+1}. [${x.source}] ${x.title.slice(0,60)}`).join('\n')
        }`,
      });
    } catch (e) {
      const detail = e.body?.hint ? ` — ${e.body.hint}` : '';
      setMsg({ type: 'err', text: `❌ 테스트 실패: ${e.message || e}${detail}` });
    } finally {
      setBusy('');
    }
  }

  if (!stored) return <div style={S.empty}>{busy === 'load' ? '⏳ 설정 불러오는 중…' : ''}</div>;

  return (
    <div>
      {/* 현재 적용 상태 */}
      <div style={S.statusCard}>
        <div style={S.statusLabel}>현재 적용 상태</div>
        {active.naverConfigured ? (
          <div style={S.statusOk}>
            ✅ 현재 Naver API는 <strong>
              {active.naverSource === 'env' ? 'Render 환경변수' : '관리자 저장값'}
            </strong>에서 사용 중입니다.
          </div>
        ) : (
          <div style={S.statusOff}>
            ⚠️ 현재 Naver API는 <strong>미설정</strong> 상태입니다.
            {envHasNaver ? ' (환경변수가 부분적으로만 설정되어 있을 수 있음)' : ''}
          </div>
        )}
        <div style={S.statusHint}>
          우선순위: <strong>1) Render 환경변수</strong> → 2) 관리자 저장값
        </div>
      </div>

      {/* Render 영구 보존 가이드 */}
      <div style={S.renderTip}>
        💡 <strong>Render 재배포 후에도 키를 유지하려면</strong> Render Dashboard → Environment 에
        <code style={S.code}>NAVER_CLIENT_ID</code> /
        <code style={S.code}>NAVER_CLIENT_SECRET</code> /
        <code style={S.code}>NAVER_ENABLED=true</code>
        를 등록하는 것을 권장합니다. 환경변수가 등록되어 있으면 관리자 저장값보다 우선 적용됩니다.
      </div>

      {/* 사용 토글 */}
      <div style={S.panel}>
        <div style={S.label}>📰 뉴스 소스 사용 토글</div>
        <label style={S.toggleRow}>
          <input type="checkbox" checked={!!form.useGoogleNews}
            onChange={e => setForm({ ...form, useGoogleNews: e.target.checked })} />
          <span><strong>Google News</strong> RSS 사용 (전 세계 매체, 추천)</span>
        </label>
        <label style={S.toggleRow}>
          <input type="checkbox" checked={!!form.useNaverNews}
            onChange={e => setForm({ ...form, useNaverNews: e.target.checked })} />
          <span><strong>Naver News</strong> 검색 API 사용 (국내 매체 커버리지)</span>
        </label>
      </div>

      {/* Naver API 키 */}
      <div style={S.panel}>
        <div style={S.label}>🔑 Naver News 검색 API 인증</div>
        <div style={S.help}>
          📖 <a href="https://developers.naver.com" target="_blank" rel="noopener noreferrer">developers.naver.com</a>
          에서 애플리케이션 등록 → 검색 API 사용 신청 후 발급된 클라이언트 ID 와 시크릿을 입력하세요. (일 25,000건 무료)
        </div>

        <label style={S.toggleRow}>
          <input type="checkbox" checked={!!form.naverEnabled}
            onChange={e => setForm({ ...form, naverEnabled: e.target.checked })} />
          <span>Naver API 활성화 (관리자 키 사용)</span>
        </label>

        <Field label="Client ID" placeholder="Naver 개발자센터에서 발급된 ID"
          value={form.naverClientId} onChange={v => setForm({ ...form, naverClientId: v })} />

        <Field label="Client Secret" type="password"
          placeholder={stored.hasNaverClientSecret ? '저장된 비밀 (변경하려면 입력)' : '비밀 키 입력'}
          value={form.naverClientSecret}
          onChange={v => { setForm({ ...form, naverClientSecret: v }); setSecretTouched(true); }}
          hint={stored.hasNaverClientSecret ? '※ 빈 칸으로 두면 기존 저장된 시크릿이 유지됩니다.' : ''} />

        <div style={S.testRow}>
          <input type="text" value={testKeyword}
            onChange={e => setTestKeyword(e.target.value)}
            placeholder="테스트 키워드 (기본: 법무부)"
            style={S.testInp} />
        </div>
        <div style={S.actions}>
          <button onClick={save} disabled={busy === 'save'} style={S.saveBtn}>
            {busy === 'save' ? '⏳ 저장 중…' : '💾 저장'}
          </button>
          <button onClick={runTest} disabled={busy === 'test' || !active.naverConfigured} style={S.testBtn}>
            {busy === 'test' ? '⏳ 테스트 중…' : '🧪 테스트 검색'}
          </button>
          <button onClick={refresh} disabled={!!busy} style={S.ghost}>↻ 새로고침</button>
        </div>
        {stored.updatedAt && (
          <div style={S.updated}>
            마지막 저장: {new Date(stored.updatedAt).toLocaleString('ko-KR')}
          </div>
        )}
        {!active.naverConfigured && (
          <div style={S.tip}>
            💡 테스트하려면 먼저 Naver API 활성화 ON + Client ID·Secret 을 입력 후 <strong>저장</strong>하세요.
          </div>
        )}
      </div>

      {msg && <div style={msg.type === 'ok' ? S.ok : S.err}>{msg.text}</div>}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder = '', hint = '' }) {
  return (
    <label style={S.field}>
      <span style={S.fLabel}>{label}</span>
      <input type={type} value={value || ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} style={S.fInp} />
      {hint && <span style={S.fHint}>{hint}</span>}
    </label>
  );
}

const S = {
  empty:       { padding: 30, color: '#888', textAlign: 'center', background: 'white', borderRadius: 12 },

  statusCard:  { background: '#0d1117', color: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 11 },
  statusLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.7px' },
  statusOk:    { fontSize: 14, fontWeight: 500, marginTop: 4, color: '#86efac' },
  statusOff:   { fontSize: 14, fontWeight: 500, marginTop: 4, color: '#fdba74' },
  statusHint:  { fontSize: 11.5, color: '#94a3b8', marginTop: 6 },

  renderTip:   { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af',
                 padding: '10px 13px', borderRadius: 8, fontSize: 12, lineHeight: 1.7,
                 marginBottom: 11 },
  code:        { background: '#dbeafe', color: '#1e3a8a', padding: '1px 6px',
                 borderRadius: 4, margin: '0 3px', fontSize: 11.5,
                 fontFamily: 'SFMono-Regular, Consolas, monospace' },

  panel:  { background: 'white', borderRadius: 12, padding: 16, marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label:  { fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 12 },
  help:   { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
            padding: '8px 11px', borderRadius: 7, fontSize: 11.5, lineHeight: 1.6, marginBottom: 12 },

  toggleRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', fontSize: 13.5, color: '#222', cursor: 'pointer' },

  field:  { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 },
  fLabel: { fontSize: 12, fontWeight: 600, color: '#444' },
  fInp:   { padding: '10px 12px', minHeight: 44, fontSize: 14, border: '1.5px solid #e5e0d8',
            borderRadius: 8, outline: 'none', background: '#fafaf8', fontFamily: 'inherit' },
  fHint:  { fontSize: 11, color: '#888' },

  actions: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  saveBtn: { padding: '10px 16px', minHeight: 44, borderRadius: 8, border: 'none',
             background: '#0d1117', color: 'white', fontSize: 13, fontWeight: 700,
             cursor: 'pointer', fontFamily: 'inherit' },
  testBtn: { padding: '10px 16px', minHeight: 44, borderRadius: 8, border: 'none',
             background: '#22c55e', color: 'white', fontSize: 13, fontWeight: 700,
             cursor: 'pointer', fontFamily: 'inherit' },
  ghost:   { padding: '10px 14px', minHeight: 44, borderRadius: 8, border: '1.5px solid #d5d0c8',
             background: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },

  tip: { fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a',
         padding: '8px 11px', borderRadius: 7, marginTop: 10 },

  ok:  { background: '#dcfce7', border: '1px solid #86efac', color: '#166534',
         padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10,
         whiteSpace: 'pre-wrap', lineHeight: 1.6 },
  err: { background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b',
         padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10 },

  testRow: { marginTop: 14, marginBottom: 6 },
  testInp: { width: '100%', padding: '9px 11px', fontSize: 13, minHeight: 40,
             border: '1.5px solid #e5e0d8', borderRadius: 8, outline: 'none',
             background: '#fafaf8', fontFamily: 'inherit' },
  updated: { marginTop: 10, fontSize: 11, color: '#888' },
};
