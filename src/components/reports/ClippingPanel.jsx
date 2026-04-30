// ─────────────────────────────────────────────
// ClippingPanel.jsx — 편철형 / 분석형 출력 분리 패널
// 상단: 편철 설정 (제목/날짜/박스/기관/템플릿/배치/단수)
// 중단: 편철형 출력 (미리보기·PDF·Word·HTML)
// 하단: 분석형 보고서 (Word·Excel·HTML)
// 추가: 출력 전 품질 점검
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import {
  getPrintSettings, savePrintSettings, listClippingPresets, getQualityCheck,
  previewClippingPdf, downloadClippingPdf, downloadClippingWord, downloadClippingHtml,
  clippingPreviewUrl, clippingPdfUrl,
  previewAnalysisHtml, downloadAnalysisWord, downloadAnalysisExcel, downloadAnalysisHtml,
  analysisPreviewUrl,
} from '../../services/api.js';

const LAYOUT_OPTIONS = [
  { v: 'media',   l: '언론사별 페이지 나눔' },
  { v: 'article', l: '기사별 페이지 나눔' },
  { v: 'compact', l: '신문 스크랩형 압축' },
];

const COL_OPTIONS = [
  { v: 1, l: '1단' },
  { v: 2, l: '2단' },
  { v: 3, l: '3단' },
];

const IMG_OPTIONS = [
  { v: 'none', l: '없음' },
  { v: 'lead', l: '대표 이미지 1개' },
  { v: 'all',  l: '본문 이미지 포함' },
];

const ISSUE_OPTIONS = ['조간', '석간', '수시', '주간', '월간'];

export default function ClippingPanel({ reportId }) {
  const [settings, setSettings] = useState(null);
  const [presets, setPresets]   = useState([]);
  const [busy, setBusy]         = useState('');
  const [msg, setMsg]           = useState('');
  const [err, setErr]           = useState('');
  const [quality, setQuality]   = useState(null);

  useEffect(() => {
    let alive = true;
    getPrintSettings(reportId).then(r => alive && setSettings(r.printSettings || {})).catch(() => {});
    listClippingPresets().then(r => alive && setPresets(r.presets || [])).catch(() => {});
    return () => { alive = false; };
  }, [reportId]);

  function update(patch) {
    setSettings(s => ({ ...(s || {}), ...patch }));
  }

  async function handleSave() {
    setBusy('save'); setMsg(''); setErr('');
    try {
      await savePrintSettings(reportId, settings || {});
      setMsg('편철 설정이 저장되었습니다.');
    } catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(''); }
  }

  async function applyPreset(id) {
    if (!id) return;
    const p = presets.find(x => x.id === id);
    if (!p) return;
    setBusy('preset'); setMsg(''); setErr('');
    try {
      const next = { ...(settings || {}), ...p.settings, presetId: id };
      setSettings(next);
      await savePrintSettings(reportId, { ...next, applyPreset: true });
      setMsg(`프리셋 적용: ${p.label}`);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(''); }
  }

  async function runQuality() {
    setBusy('quality'); setMsg(''); setErr('');
    try {
      const q = await getQualityCheck(reportId);
      setQuality(q);
    } catch (e) { setErr(e.message || String(e)); }
    finally { setBusy(''); }
  }

  async function safeRun(label, fn) {
    setBusy(label); setMsg(''); setErr('');
    try {
      const r = await fn();
      const note = r?.mode === 'auto-fast'
        ? ' · 리포트가 커서 빠른 PDF 모드로 자동 전환되었습니다 (전체 원문은 Word/HTML 로 받아주세요).'
        : r?.mode === 'fast'
        ? ' · 빠른 PDF 모드'
        : '';
      setMsg(typeof r === 'string' ? r : r?.filename ? `${label} 완료 — ${r.filename}${note}` : `${label} 완료`);
    } catch (e) {
      // 서버가 PDF_TIMEOUT / CHROME_NOT_FOUND 코드를 부착해 보낸다 — UI 에 fallback 안내 표시
      const code = e.code || '';
      const baseMsg = e.message || String(e);
      if (code === 'PDF_TIMEOUT' || code === 'CHROME_NOT_FOUND' || /시간이 초과|설치되지 않/.test(baseMsg)) {
        setErr(`${baseMsg}\n→ 아래 [📝 편철 Word] 또는 [🌐 편철 HTML] 버튼으로 대신 받아주세요. PDF 는 [⚡ 빠른 PDF] 로 다시 시도할 수 있습니다.`);
      } else {
        setErr(baseMsg);
      }
    }
    finally { setBusy(''); }
  }

  if (!settings) return <div style={S.loading}>편철 설정 로딩 중…</div>;

  const qIssues = quality ? Object.entries(quality.counts || {}).filter(([, n]) => n > 0) : [];

  return (
    <div style={S.wrap}>
      {/* ── 1) 편철 설정 패널 ─────────────────── */}
      <div style={S.panel}>
        <div style={S.head}>📰 편철 설정 — 출력 전에 표지/목차/배치를 수정하세요</div>

        <div style={S.row}>
          <label style={S.lbl}>출력 템플릿</label>
          <select style={S.input} value={settings.presetId || ''} onChange={e => applyPreset(e.target.value)}>
            <option value="">프리셋 선택…</option>
            {presets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        <div style={S.row}>
          <label style={S.lbl}>상단 제목</label>
          <input style={S.input} value={settings.title || ''} onChange={e => update({ title: e.target.value })} />
        </div>

        <div style={S.row2}>
          <div>
            <label style={S.lbl}>출력 기준일</label>
            <input style={S.input} value={settings.dateText || ''} onChange={e => update({ dateText: e.target.value })} placeholder="2026. 4. 30.(목)" />
          </div>
          <div>
            <label style={S.lbl}>발행 구분</label>
            <select style={S.input} value={settings.issueLabel || ''} onChange={e => update({ issueLabel: e.target.value })}>
              {ISSUE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div style={S.row2}>
          <div>
            <label style={S.lbl}>중앙 큰 제목</label>
            <input style={S.input} value={settings.mainBoxTitle || ''} onChange={e => update({ mainBoxTitle: e.target.value })} />
          </div>
          <div>
            <label style={S.lbl}>중앙 부제</label>
            <input style={S.input} value={settings.mainBoxSub || ''} onChange={e => update({ mainBoxSub: e.target.value })} />
          </div>
        </div>

        <div style={S.row2}>
          <div>
            <label style={S.lbl}>추가 분류 1</label>
            <input style={S.input} value={settings.extraTag1 || ''} onChange={e => update({ extraTag1: e.target.value })} />
          </div>
          <div>
            <label style={S.lbl}>추가 분류 2</label>
            <input style={S.input} value={settings.extraTag2 || ''} onChange={e => update({ extraTag2: e.target.value })} />
          </div>
        </div>

        <div style={S.row}>
          <label style={S.lbl}>하단 기관명</label>
          <input style={S.input} value={settings.organization || ''} onChange={e => update({ organization: e.target.value })} />
        </div>

        <div style={S.row3}>
          <div>
            <label style={S.lbl}>페이지 배치</label>
            <select style={S.input} value={settings.pageLayout || 'media'} onChange={e => update({ pageLayout: e.target.value })}>
              {LAYOUT_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>본문 단수</label>
            <select style={S.input} value={settings.columnCount || 1} onChange={e => update({ columnCount: Number(e.target.value) })}>
              {COL_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>이미지</label>
            <select style={S.input} value={settings.imageMode || 'lead'} onChange={e => update({ imageMode: e.target.value })}>
              {IMG_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        </div>

        <div style={S.checks}>
          <label style={S.chk}>
            <input type="checkbox" checked={settings.showSourceLink !== false} onChange={e => update({ showSourceLink: e.target.checked })} />
            <span>원문 링크 표시</span>
          </label>
          <label style={S.chk}>
            <input type="checkbox" checked={!!settings.includeAnalysisAppendix} onChange={e => update({ includeAnalysisAppendix: e.target.checked })} />
            <span>분석 부록 포함</span>
          </label>
          <label style={S.chk}>
            <input type="checkbox" checked={settings.printOptimized !== false} onChange={e => update({ printOptimized: e.target.checked })} />
            <span>흑백 인쇄 최적화</span>
          </label>
        </div>

        <div style={S.btnRow}>
          <button style={S.saveBtn}  onClick={handleSave} disabled={busy === 'save'}>
            {busy === 'save' ? '⏳ 저장 중…' : '💾 편철 설정 저장'}
          </button>
          <button style={S.qBtn} onClick={runQuality} disabled={busy === 'quality'}>
            {busy === 'quality' ? '⏳ 점검 중…' : '🔍 출력 전 품질 점검'}
          </button>
        </div>

        {quality && (
          <div style={S.qBox}>
            <div style={S.qHead}>품질 점검 결과 — 대상 {quality.total}건</div>
            {qIssues.length === 0
              ? <div style={S.qOk}>✅ 큰 문제가 발견되지 않았습니다.</div>
              : qIssues.map(([k, n]) => (
                  <div key={k} style={S.qRow}>· {labelOfQuality(k)} <strong>{n}건</strong></div>
                ))}
          </div>
        )}
      </div>

      {/* ── 2) 편철형 출력물 ──────────────────── */}
      <div style={S.panel}>
        <div style={S.head}>📰 편철형 출력물</div>
        <div style={S.note}>
          기사 원문을 언론사별로 묶어 인쇄하는 용도입니다. 표지 → 언론사별 목차 → 기사 본문 순서로 구성됩니다.
        </div>
        <div style={S.actRow}>
          <a href={clippingPreviewUrl(reportId)} target="_blank" rel="noopener noreferrer" style={S.btnLight}>
            🖥 편철 미리보기 (HTML)
          </a>
          <a href={clippingPdfUrl(reportId, '?preview=1&fast=1')} target="_blank" rel="noopener noreferrer" style={S.btnLight}>
            🔍 편철 PDF 미리보기
          </a>
          {/* 기본 버튼은 빠른 PDF — Render 콜드 스타트 / 외부 폰트 timeout 방지 */}
          <button style={S.btnDark} onClick={() => safeRun('빠른 편철 PDF', () => downloadClippingPdf(reportId, { fast: true }))} disabled={busy === '빠른 편철 PDF'} title="외부 폰트 / 본문 이미지 제외 — 가장 빠르고 timeout 위험이 낮습니다">
            {busy === '빠른 편철 PDF' ? '⏳' : '⚡ 빠른 편철 PDF'}
          </button>
          <button style={S.btnLight} onClick={() => safeRun('이미지 포함 편철 PDF', () => downloadClippingPdf(reportId, { fast: false }))} disabled={busy === '이미지 포함 편철 PDF'} title="원문 이미지 + 본문 포함. 기사가 많으면 시간이 오래 걸릴 수 있습니다.">
            {busy === '이미지 포함 편철 PDF' ? '⏳' : '🖼 이미지 포함 PDF'}
          </button>
          <button style={S.btnBlue}  onClick={() => safeRun('편철 Word 다운로드', () => downloadClippingWord(reportId))} disabled={busy === '편철 Word 다운로드'}>
            {busy === '편철 Word 다운로드' ? '⏳' : '📝 편철 Word'}
          </button>
          <button style={S.btnLight} onClick={() => safeRun('편철 HTML 다운로드', () => downloadClippingHtml(reportId))} disabled={busy === '편철 HTML 다운로드'}>
            {busy === '편철 HTML 다운로드' ? '⏳' : '🌐 편철 HTML'}
          </button>
        </div>
        <div style={S.hint}>
          ⚡ <strong>빠른 PDF</strong>가 기본입니다 — 외부 폰트와 본문 이미지를 제외해 가장 안정적으로 생성됩니다.{' '}
          이미지가 필요하면 <strong>🖼 이미지 포함 PDF</strong>를, PDF 가 실패하면 <strong>📝 Word</strong> / <strong>🌐 HTML</strong> 로 받아주세요.
        </div>
      </div>

      {/* ── 3) 분석형 보고서 ─────────────────── */}
      <div style={S.panel}>
        <div style={S.head}>📊 분석형 보고서</div>
        <div style={S.note}>
          주요 이슈·긍부정·홍보성과·대응 필요사항을 정리한 보고자료입니다. 편집 가능한 Word/Excel 로 제공됩니다.
        </div>
        <div style={S.actRow}>
          <a href={analysisPreviewUrl(reportId)} target="_blank" rel="noopener noreferrer" style={S.btnLight}>
            🖥 분석 보고서 미리보기
          </a>
          <button style={S.btnBlue}  onClick={() => safeRun('분석 Word 다운로드', () => downloadAnalysisWord(reportId))} disabled={busy === '분석 Word 다운로드'}>
            {busy === '분석 Word 다운로드' ? '⏳' : '📝 분석 Word'}
          </button>
          <button style={S.btnGreen} onClick={() => safeRun('분석 Excel 다운로드', () => downloadAnalysisExcel(reportId))} disabled={busy === '분석 Excel 다운로드'}>
            {busy === '분석 Excel 다운로드' ? '⏳' : '📊 분석 Excel'}
          </button>
          <button style={S.btnLight} onClick={() => safeRun('분석 HTML 다운로드', () => downloadAnalysisHtml(reportId))} disabled={busy === '분석 HTML 다운로드'}>
            {busy === '분석 HTML 다운로드' ? '⏳' : '🌐 분석 HTML'}
          </button>
        </div>
      </div>

      {msg && <div style={S.ok}>{msg}</div>}
      {err && <div style={S.err}>⚠️ {err}</div>}
    </div>
  );
}

function labelOfQuality(k) {
  return ({
    missingBody:   '본문 추출 실패',
    missingImage:  '이미지 누락',
    missingTitle:  '제목 누락',
    missingSource: '언론사 누락',
    missingPage:   '지면 정보 누락',
  })[k] || k;
}

const S = {
  wrap:    { display: 'flex', flexDirection: 'column', gap: 11 },
  panel:   { background: 'white', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  head:    { fontSize: 13, fontWeight: 800, marginBottom: 8, color: '#0d1117' },
  note:    { fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 1.5 },
  loading: { padding: 20, textAlign: 'center', color: '#666' },

  row:    { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 },
  row2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 },
  row3:   { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 8 },
  lbl:    { fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' },
  input:  { padding: '8px 10px', border: '1.5px solid #d5d0c8', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', background: 'white' },

  checks:   { display: 'flex', flexWrap: 'wrap', gap: 16, padding: '6px 0 12px' },
  chk:      { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#444', cursor: 'pointer' },

  btnRow:   { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  actRow:   { display: 'flex', gap: 8, flexWrap: 'wrap' },

  saveBtn:  { padding: '10px 16px', minHeight: 40, borderRadius: 8, border: 'none', background: '#0d1117', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  qBtn:     { padding: '10px 14px', minHeight: 40, borderRadius: 8, border: '1.5px solid #d5d0c8', background: 'white', color: '#0d1117', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnDark:  { padding: '9px 13px', minHeight: 40, borderRadius: 8, border: 'none', background: '#0d1117', color: 'white', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnBlue:  { padding: '9px 13px', minHeight: 40, borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnGreen: { padding: '9px 13px', minHeight: 40, borderRadius: 8, border: 'none', background: '#16a34a', color: 'white', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnLight: { padding: '9px 13px', minHeight: 40, borderRadius: 8, border: '1.5px solid #d5d0c8', background: 'white', color: '#444', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },

  qBox:    { marginTop: 10, background: '#fafaf6', border: '1px solid #f0ede8', borderRadius: 8, padding: '10px 12px' },
  qHead:   { fontSize: 12, color: '#666', fontWeight: 700, marginBottom: 5 },
  qRow:    { fontSize: 12.5, color: '#9a3412', padding: '2px 0' },
  qOk:     { fontSize: 12.5, color: '#166534' },

  ok:      { background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, whiteSpace: 'pre-wrap' },
  err:     { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, whiteSpace: 'pre-wrap' },
  hint:    { marginTop: 8, padding: '7px 10px', fontSize: 12, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, lineHeight: 1.55 },
};
