// ─────────────────────────────────────────────
// CustomSourceManager.jsx — 사용자 지정 뉴스 소스 + Render 안내 + 백업/복원
//
// 본 컴포넌트는 SourceSettings.jsx 의 보조 컴포넌트로, 다음 4 카드를 묶어 관리한다.
//   1) Render 무료 플랜 안내 (현재 출처 / 환경변수 가이드)
//   2) 설정 백업 / 복원
//   3) 공식기관 직접 수집 + 확장 검색 토글
//   4) 사용자 지정 뉴스 소스 (RSS / 검색 URL) CRUD
// ─────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import * as api from '../../services/api.js';

export default function CustomSourceManager({ stored, active, onChanged }) {
  const [items,   setItems]   = useState(stored?.customSources || []);
  const [busy,    setBusy]    = useState('');
  const [msg,     setMsg]     = useState('');
  const [err,     setErr]     = useState('');
  const [form,    setForm]    = useState({ name: '', url: '', type: 'rss', agencyCategory: '' });
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [renderGuideOpen, setRenderGuideOpen] = useState(false);
  const [officialEnabled, setOfficialEnabled] = useState(stored?.officialAgencyEnabled !== false);
  const [expandKW,        setExpandKW]        = useState(stored?.expandKeywords !== false);
  const fileRef = useRef(null);

  useEffect(() => { setItems(stored?.customSources || []); }, [stored]);
  useEffect(() => { setOfficialEnabled(stored?.officialAgencyEnabled !== false); }, [stored?.officialAgencyEnabled]);
  useEffect(() => { setExpandKW(stored?.expandKeywords !== false); }, [stored?.expandKeywords]);

  async function refresh() {
    try {
      const r = await api.listCustomSources();
      setItems(r.items || []);
    } catch (e) { setErr(e.message); }
  }

  async function onAdd(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) { setErr('소스명 / URL 은 필수입니다.'); return; }
    setBusy('add'); setErr(''); setMsg('');
    try {
      await api.addCustomSource({ ...form, name: form.name.trim(), url: form.url.trim() });
      setForm({ name: '', url: '', type: 'rss', agencyCategory: '' });
      setMsg('✅ 사용자 지정 소스가 추가되었습니다.');
      await refresh();
      onChanged && onChanged();
    } catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }
  async function onDelete(id) {
    if (!confirm('이 소스를 삭제하시겠습니까?')) return;
    setBusy(`del:${id}`); setErr(''); setMsg('');
    try { await api.deleteCustomSource(id); await refresh(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }
  async function onToggle(id, enabled) {
    setBusy(`tog:${id}`); setErr(''); setMsg('');
    try { await api.updateCustomSource(id, { enabled }); await refresh(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }
  async function onTest(s) {
    setBusy(`test:${s.id}`); setErr(''); setMsg('');
    try {
      const r = await api.testCustomSource(s, '보호관찰');
      if (r.ok) {
        setMsg(`✅ "${s.name}" 테스트 성공 — ${r.count}건 수신${r.sample?.[0] ? ` · 첫 결과: ${r.sample[0].title.slice(0, 50)}` : ''}`);
      } else {
        setErr(`❌ "${s.name}" 테스트 실패: ${r.error}`);
      }
    } catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }

  // 백업 다운로드 — 비밀값 포함은 사용자 명시 동의 필요
  function onDownloadBackup() {
    if (includeSecrets && !confirm('⚠️ 비밀값 포함 백업 — 이 파일에는 Naver Client Secret 평문이 포함됩니다. 외부 공유하지 마세요. 계속하시겠습니까?')) return;
    const url = api.backupSourceSettingsUrl(includeSecrets);
    const a = document.createElement('a');
    a.href = url; a.download = '';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setMsg('💾 백업 파일을 다운로드했습니다.');
  }
  // 백업 업로드 — 사용자가 파일 선택 후 자동 적용
  async function onUploadBackup(file) {
    if (!file) return;
    setBusy('restore'); setErr(''); setMsg('');
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const r = await api.restoreSourceSettings(backup);
      setMsg(`✅ 복원 완료 — Naver: ${r.naverConfigured ? '활성' : '미활성'} (${r.naverSource}) · 사용자 지정 소스: ${(r.stored.customSources || []).length}건`);
      await refresh();
      onChanged && onChanged();
    } catch (e) { setErr(`복원 실패: ${e.message}`); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  // 토글 저장 — 공식기관 / 확장 검색
  async function saveToggle(patch) {
    setBusy('toggle'); setErr(''); setMsg('');
    try {
      await api.saveSourceSettings(patch);
      setMsg('✅ 저장되었습니다.');
      onChanged && onChanged();
    } catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }

  const naverSrcLabel = active?.naverSource === 'env'   ? 'Render 환경변수'
                      : active?.naverSource === 'admin' ? '관리자 저장값'
                      : '미설정';
  const persistencePill = active?.naverSource === 'env'
    ? { color: '#166534', bg: '#dcfce7', txt: '✓ 재배포 후에도 유지됨' }
    : active?.naverSource === 'admin'
    ? { color: '#92400e', bg: '#fef3c7', txt: '⚠️ Render 무료 플랜 재배포 시 초기화될 수 있음' }
    : { color: '#b91c1c', bg: '#fee2e2', txt: '✗ 미설정 — Naver 수집 비활성' };

  return (
    <>
      {/* Render 안내 카드 */}
      <div style={S.panel}>
        <div style={S.label}>🚀 Render 무료 플랜에서 Naver API 를 유지하는 방법</div>
        <div style={S.statusRow}>
          <span>현재 출처: <strong>{naverSrcLabel}</strong></span>
          <span style={{ ...S.pill, color: persistencePill.color, background: persistencePill.bg }}>
            {persistencePill.txt}
          </span>
        </div>
        <button onClick={() => setRenderGuideOpen(o => !o)} style={S.btnLight}>
          {renderGuideOpen ? '▲ 안내 접기' : '▼ Render 환경변수 설정 방법 보기'}
        </button>
        {renderGuideOpen && (
          <div style={S.guide}>
            <ol style={{ paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
              <li>Render 대시보드 (<code>render.com</code>) 에 로그인</li>
              <li><strong>trend-collector</strong> Web Service 클릭</li>
              <li>좌측 <strong>Environment</strong> 메뉴 클릭</li>
              <li>아래 3 개 환경변수 추가:
                <pre style={S.pre}>{`NAVER_ENABLED=true
NAVER_CLIENT_ID=발급받은_값
NAVER_CLIENT_SECRET=발급받은_값`}</pre>
              </li>
              <li>저장 후 <strong>Manual Deploy → Clear build cache & deploy</strong> 실행</li>
              <li>이후 무료 플랜 재배포 / 재시작이 일어나도 키가 유지됩니다.</li>
            </ol>
            <div style={S.tip}>
              💡 환경변수가 설정되어 있으면 관리자 저장값보다 우선 적용됩니다 (출처가 "Render 환경변수" 로 표시).
            </div>
          </div>
        )}
      </div>

      {/* 백업 / 복원 카드 */}
      <div style={S.panel}>
        <div style={S.label}>💾 설정 백업 / 복원</div>
        <div style={S.note}>
          무료 플랜 재배포 시 관리자 저장값이 사라질 수 있습니다. 정기적으로 백업을 다운로드하고,
          초기화된 경우 백업 파일을 업로드하면 이전 설정 (Naver / 공식기관 / 사용자 지정 소스 / 자동 추적 기준)
          이 한 번에 복원됩니다.
        </div>
        <label style={S.toggleRow}>
          <input type="checkbox" checked={includeSecrets} onChange={e => setIncludeSecrets(e.target.checked)} />
          <span>비밀값 포함 백업 — Naver Client Secret 도 함께 저장 (외부 공유 금지)</span>
        </label>
        <div style={S.actions}>
          <button onClick={onDownloadBackup} disabled={!!busy} style={S.saveBtn}>
            📥 백업 다운로드
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
            onChange={e => onUploadBackup(e.target.files?.[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={busy === 'restore'} style={S.testBtn}>
            {busy === 'restore' ? '⏳ 복원 중…' : '📤 백업 업로드 → 복원'}
          </button>
        </div>
      </div>

      {/* 다중 소스 토글 */}
      <div style={S.panel}>
        <div style={S.label}>📡 검색 누락 보완 — 다중 소스 / 확장 검색</div>
        <label style={S.toggleRow}>
          <input type="checkbox" checked={!!officialEnabled}
            onChange={e => { setOfficialEnabled(e.target.checked); saveToggle({ officialAgencyEnabled: e.target.checked }); }} />
          <span><strong>공식기관 직접 수집</strong> — moj.go.kr / korea.kr / corrections.go.kr / immigration.go.kr / spo.go.kr / hikorea.go.kr 사이트별 검색 (권장 ON)</span>
        </label>
        <label style={S.toggleRow}>
          <input type="checkbox" checked={!!expandKW}
            onChange={e => { setExpandKW(e.target.checked); saveToggle({ expandKeywords: e.target.checked }); }} />
          <span><strong>관련어 확장 검색</strong> — '보호관찰' 검색 시 '보호관찰소 / 전자감독 / 준법지원센터' 도 함께 수집</span>
        </label>
      </div>

      {/* 사용자 지정 소스 */}
      <div style={S.panel}>
        <div style={S.label}>🔗 사용자 지정 뉴스 소스 ({items.length}건)</div>
        <div style={S.note}>
          RSS 피드 또는 검색 URL 템플릿을 추가하세요. 검색 URL 의 키워드 자리에는 <code>{'{{keyword}}'}</code> 또는 <code>%s</code> 를 넣으면
          수집 시 키워드로 치환됩니다. (예: <code>https://www.example.go.kr/rss?q={'{{keyword}}'}</code>) 응답이 RSS / Atom XML 인 경우만
          신뢰합니다.
        </div>

        <form onSubmit={onAdd} style={S.formRow}>
          <input style={S.inp} placeholder="소스명 (예: 법무부 보도자료)" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} />
          <input style={S.inp} placeholder="URL (RSS 또는 검색 URL)" value={form.url}
            onChange={e => setForm({ ...form, url: e.target.value })} />
          <select style={S.inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="rss">RSS 피드 (정적)</option>
            <option value="search">검색 URL 템플릿</option>
          </select>
          <input style={S.inp} placeholder="기관분류 (선택)" value={form.agencyCategory}
            onChange={e => setForm({ ...form, agencyCategory: e.target.value })} />
          <button type="submit" disabled={!!busy} style={S.saveBtn}>
            {busy === 'add' ? '⏳' : '➕ 추가'}
          </button>
        </form>

        {items.length === 0 ? (
          <div style={S.empty}>아직 등록된 사용자 지정 소스가 없습니다.</div>
        ) : (
          <ul style={S.list}>
            {items.map(s => (
              <li key={s.id} style={S.item}>
                <div style={S.itemHead}>
                  <strong>{s.name}</strong>
                  <span style={S.tag}>{s.type === 'rss' ? '📡 RSS' : '🔍 검색URL'}</span>
                  {s.agencyCategory && <span style={S.tagDim}>{s.agencyCategory}</span>}
                  <span style={s.enabled !== false ? S.pillOn : S.pillOff}>
                    {s.enabled !== false ? '활성' : '비활성'}
                  </span>
                </div>
                <div style={S.itemUrl}>{s.url}</div>
                <div style={S.itemActions}>
                  <button onClick={() => onTest(s)} disabled={busy === `test:${s.id}`} style={S.smBtn}>
                    {busy === `test:${s.id}` ? '⏳' : '🧪 테스트'}
                  </button>
                  <button onClick={() => onToggle(s.id, s.enabled === false)} disabled={busy === `tog:${s.id}`} style={S.smBtn}>
                    {s.enabled === false ? '활성화' : '비활성화'}
                  </button>
                  <button onClick={() => onDelete(s.id)} disabled={busy === `del:${s.id}`} style={S.smBtnDanger}>
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {msg && <div style={S.ok}>{msg}</div>}
      {err && <div style={S.err}>⚠️ {err}</div>}
    </>
  );
}

const S = {
  panel:    { background: 'white', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,.06)', marginBottom: 11 },
  label:    { fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 9 },
  note:     { fontSize: 12, color: '#666', marginBottom: 11, lineHeight: 1.6 },
  statusRow:{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, marginBottom: 9 },
  pill:     { fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 12 },
  pillOn:   { fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: '#166534', background: '#dcfce7' },
  pillOff:  { fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: '#92400e', background: '#fef3c7' },
  toggleRow:{ display: 'flex', gap: 7, alignItems: 'flex-start', padding: '6px 0', fontSize: 12.5, color: '#444', lineHeight: 1.5 },
  guide:    { marginTop: 9, padding: 12, background: '#fafaf6', border: '1px solid #f0ede8', borderRadius: 8, fontSize: 12.5, color: '#333' },
  pre:      { background: '#0d1117', color: '#86efac', padding: '10px 12px', borderRadius: 7, fontSize: 11.5, fontFamily: 'ui-monospace, monospace', overflow: 'auto', margin: '6px 0' },
  tip:      { marginTop: 8, padding: '6px 9px', background: '#dbeafe', color: '#1e40af', borderRadius: 6, fontSize: 12 },
  actions:  { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 9 },
  saveBtn:  { padding: '8px 14px', minHeight: 38, borderRadius: 7, border: 'none', background: '#0d1117', color: 'white', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  testBtn:  { padding: '8px 14px', minHeight: 38, borderRadius: 7, border: '1.5px solid #d5d0c8', background: 'white', color: '#444', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnLight: { padding: '7px 12px', minHeight: 36, borderRadius: 7, border: '1.5px solid #d5d0c8', background: 'white', color: '#444', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  formRow:  { display: 'grid', gridTemplateColumns: '1.2fr 2fr 0.9fr 0.9fr auto', gap: 7, marginBottom: 11 },
  inp:      { padding: '8px 10px', minHeight: 38, border: '1.5px solid #d5d0c8', borderRadius: 7, fontSize: 12.5, fontFamily: 'inherit', background: '#fafaf8' },
  empty:    { padding: '20px 12px', textAlign: 'center', color: '#888', fontSize: 12.5, background: '#fafaf6', borderRadius: 7 },
  list:     { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  item:     { background: '#fafaf6', border: '1px solid #f0ede8', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 },
  itemHead: { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  tag:      { fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: '#1d4ed8', background: '#dbeafe' },
  tagDim:   { fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#475569', background: '#e2e8f0' },
  itemUrl:  { fontSize: 11.5, color: '#475569', wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace' },
  itemActions: { display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  smBtn:       { padding: '4px 10px', minHeight: 28, borderRadius: 6, border: '1px solid #d5d0c8', background: 'white', color: '#444', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  smBtnDanger: { padding: '4px 10px', minHeight: 28, borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  ok:       { background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 10 },
  err:      { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 10 },
};
