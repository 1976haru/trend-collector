// ─────────────────────────────────────────────
// FeedbackModal.jsx — 기능 개선 제안 모달
// 제출 시 POST /api/feedback → 관리자 메일 발송.
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { submitFeedback } from '../../services/api.js';

const SEVERITY = ['낮음', '보통', '높음', '긴급'];

export default function FeedbackModal({ open, onClose }) {
  const [name,     setName]     = useState('');
  const [contact,  setContact]  = useState('');
  const [title,    setTitle]    = useState('');
  const [content,  setContent]  = useState('');
  const [severity, setSeverity] = useState('보통');
  const [sending,  setSending]  = useState(false);
  const [status,   setStatus]   = useState(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setStatus({ type: 'error', msg: '제목과 내용을 입력하세요.' });
      return;
    }
    setSending(true); setStatus(null);
    try {
      await submitFeedback({
        name, contact, title, content, severity,
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      });
      setStatus({ type: 'ok', msg: '제안이 접수되었습니다. 감사합니다.' });
      setName(''); setContact(''); setTitle(''); setContent(''); setSeverity('보통');
      setTimeout(() => onClose?.(), 1500);
    } catch (err) {
      setStatus({ type: 'error', msg: err.message || '메일 발송에 실패했습니다. 관리자에게 문의하세요.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={S.overlay} onClick={onClose}>
      <form style={S.modal} onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div style={S.head}>
          <div>
            <div style={S.title}>📨 기능 개선 제안하기</div>
            <div style={S.sub}>요청·개선 사항이 있으면 관리자에게 메일로 전달됩니다.</div>
          </div>
          <button type="button" onClick={onClose} style={S.close}>✕</button>
        </div>

        <div style={S.row}>
          <label style={S.field}>
            <span style={S.label}>이름 / 부서</span>
            <input style={S.inp} value={name}    onChange={e => setName(e.target.value)} placeholder="예: 홍길동 / 행정관리과" />
          </label>
          <label style={S.field}>
            <span style={S.label}>연락처 / 이메일</span>
            <input style={S.inp} value={contact} onChange={e => setContact(e.target.value)} placeholder="회신용 (선택)" />
          </label>
        </div>

        <label style={S.field}>
          <span style={S.label}>제안 제목 *</span>
          <input style={S.inp} required value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 부정 이슈 알림 메일을 별도로 받고 싶습니다" />
        </label>

        <label style={S.field}>
          <span style={S.label}>제안 내용 *</span>
          <textarea style={S.area} required rows={7} value={content} onChange={e => setContent(e.target.value)}
            placeholder="개선이 필요한 부분, 사용 중 불편한 점, 새로 추가되었으면 하는 기능 등을 자유롭게 적어주세요." />
        </label>

        <div style={S.field}>
          <span style={S.label}>중요도</span>
          <div style={S.sevRow}>
            {SEVERITY.map(s => (
              <button key={s} type="button"
                style={{ ...S.sev, ...(severity === s ? S.sevOn : {}) }}
                onClick={() => setSeverity(s)}>{s}</button>
            ))}
          </div>
        </div>

        {status && (
          <div style={status.type === 'ok' ? S.ok : S.err}>
            {status.msg}
          </div>
        )}

        <div style={S.actions}>
          <button type="button" onClick={onClose} style={S.cancel}>취소</button>
          <button type="submit" disabled={sending} style={S.submit}>
            {sending ? '발송 중…' : '📧 제안 보내기'}
          </button>
        </div>

        <div style={S.foot}>
          ※ 첨부파일은 추후 지원 예정입니다.
        </div>
      </form>
    </div>
  );
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(13,17,23,.55)', zIndex: 50,
             display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 },
  modal:   { width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
             background: 'white', borderRadius: 14, padding: '18px 20px',
             boxShadow: '0 10px 30px rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column', gap: 10 },
  head:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  title:   { fontSize: 17, fontWeight: 800 },
  sub:     { fontSize: 12, color: '#666', marginTop: 3 },
  close:   { background: 'transparent', border: 'none', fontSize: 20, color: '#888', cursor: 'pointer', minWidth: 32, minHeight: 32 },

  row:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  field:   { display: 'flex', flexDirection: 'column', gap: 4 },
  label:   { fontSize: 12, color: '#444', fontWeight: 600 },
  inp:     { padding: '10px 12px', minHeight: 44, fontSize: 14, border: '1.5px solid #e5e0d8', borderRadius: 8, outline: 'none', background: '#fafaf8', fontFamily: 'inherit' },
  area:    { padding: '10px 12px', fontSize: 14, border: '1.5px solid #e5e0d8', borderRadius: 8, outline: 'none', background: '#fafaf8', fontFamily: 'inherit', resize: 'vertical' },

  sevRow:  { display: 'flex', gap: 6 },
  sev:     { flex: 1, minHeight: 38, padding: '7px 10px', border: '1.5px solid #e5e0d8', background: 'white', borderRadius: 8,
             fontSize: 12.5, cursor: 'pointer', color: '#555', fontFamily: 'inherit' },
  sevOn:   { background: '#0d1117', color: 'white', borderColor: '#0d1117' },

  ok:      { background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '8px 12px', borderRadius: 7, fontSize: 13 },
  err:     { background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '8px 12px', borderRadius: 7, fontSize: 13 },

  actions: { display: 'flex', gap: 8, marginTop: 4 },
  cancel:  { flex: 1, minHeight: 44, padding: 12, border: '1.5px solid #d5d0c8', background: 'white', borderRadius: 8,
             fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  submit:  { flex: 2, minHeight: 44, padding: 12, border: 'none', background: '#0d1117', color: 'white', borderRadius: 8,
             fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },

  foot:    { fontSize: 11, color: '#888', textAlign: 'center' },
};
