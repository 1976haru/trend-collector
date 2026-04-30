// ─────────────────────────────────────────────
// MailSettings.jsx — 관리자 메일 설정 + 테스트 발송
// 발송 방식: SMTP / Resend API / SendGrid API / 저장만(none)
// 비밀 값(password / apiKey)은 화면에 표시되지 않음. 빈 값 저장 시 기존 값 유지.
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react';
import * as api from '../../services/api.js';

const PORT_HINTS = [
  { v: 25,  l: '25 (SMTP)' },
  { v: 587, l: '587 (STARTTLS, 권장)' },
  { v: 465, l: '465 (SSL, secure=true)' },
];

const PROVIDERS = [
  { v: 'smtp',     l: 'SMTP',         desc: 'SMTP 서버 직접 연결 — Render 무료 플랜에서 차단될 수 있음' },
  { v: 'resend',   l: 'Resend API',   desc: 'API 방식 — Render 무료 플랜에서도 정상 동작 (resend.com)' },
  { v: 'sendgrid', l: 'SendGrid API', desc: 'API 방식 — Render 무료 플랜에서도 정상 동작 (sendgrid.com)' },
  { v: 'none',     l: '저장만 하기',   desc: '실제 발송 안 함 — 기능개선 제안 등은 서버에 저장됨' },
];

export default function MailSettings() {
  const [stored, setStored]     = useState(null);
  const [active, setActive]     = useState(null);
  const [envHasSmtp, setEnvHasSmtp] = useState(false);
  const [form, setForm]         = useState({
    enabled: false, provider: 'smtp',
    host: '', port: 587, secure: false,
    user: '', password: '',
    apiKey: '',
    from: '', feedbackTo: '', reportDefaultTo: '',
  });
  const [pwTouched, setPwTouched] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [testTo, setTestTo]     = useState('');
  const [busy, setBusy]         = useState('');
  const [msg, setMsg]           = useState(null);

  async function refresh() {
    setBusy('load'); setMsg(null);
    try {
      const r = await api.getMailSettings();
      setStored(r.stored);
      setActive(r.active);
      setEnvHasSmtp(!!r.envHasSmtp);
      setForm(prev => ({
        ...prev,
        enabled:         !!r.stored.enabled,
        provider:        r.stored.provider || 'smtp',
        host:            r.stored.host || prev.host,
        port:            r.stored.port || 587,
        secure:          !!r.stored.secure,
        user:            r.stored.user || prev.user,
        from:            r.stored.from || prev.from,
        feedbackTo:      r.stored.feedbackTo || prev.feedbackTo,
        reportDefaultTo: r.stored.reportDefaultTo || prev.reportDefaultTo,
        password:        '',
        apiKey:          '',
      }));
      setPwTouched(false);
      setKeyTouched(false);
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
      const patch = { ...form };
      // 비밀번호 / API key 칸을 건드리지 않은 경우 서버로 보내지 않아 기존 값 유지
      if (!pwTouched)  delete patch.password;
      if (!keyTouched) delete patch.apiKey;
      const r = await api.saveMailSettingsApi(patch);
      setStored(r.stored);
      setMsg({ type: 'ok', text: '✅ 저장 완료. 메일 발송 모듈이 새 설정으로 다시 초기화되었습니다.' });
      setForm(f => ({ ...f, password: '', apiKey: '' }));
      setPwTouched(false);
      setKeyTouched(false);
      const r2 = await api.getMailSettings();
      setActive(r2.active);
    } catch (e) {
      setMsg({ type: 'err', text: e.message || String(e) });
    } finally {
      setBusy('');
    }
  }

  async function sendTest() {
    if (!testTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
      setMsg({ type: 'err', text: '테스트 메일 받을 주소를 올바른 이메일 형식으로 입력하세요.' });
      return;
    }
    setBusy('test'); setMsg(null);
    try {
      const r = await api.sendTestMail(testTo);
      setMsg({ type: 'ok', text: `✅ 테스트 메일을 ${r.sentTo} 로 보냈습니다.` });
    } catch (e) {
      const body = e.body || {};
      const hint = body.hint || '';
      const friendly = errorTitleByType(body.type);
      const text = `❌ ${friendly} ${hint ? `\n${hint}` : ''}\n원본 오류: ${e.message || e}`;
      setMsg({ type: 'err', text, errType: body.type });
    } finally {
      setBusy('');
    }
  }

  if (!stored) return <div style={S.empty}>{busy === 'load' ? '⏳ 메일 설정 불러오는 중…' : ''}</div>;

  const isSmtp     = form.provider === 'smtp';
  const isResend   = form.provider === 'resend';
  const isSendGrid = form.provider === 'sendgrid';
  const isNone     = form.provider === 'none';
  const isApi      = isResend || isSendGrid;

  return (
    <div>
      {/* 현재 적용 상태 */}
      <div style={S.statusCard}>
        <div style={S.statusLabel}>현재 적용 상태</div>
        {active ? (
          <div style={S.statusValueOk}>
            ✅ 활성 — <strong>{providerLabel(active.provider)}</strong>
            {active.host ? ` · ${active.host}:${active.port}${active.secure ? ' (TLS)' : ''}` : ''}
            {' · '}출처: <strong>{active.source === 'ui' ? '관리자 화면' : '환경변수(.env)'}</strong>
          </div>
        ) : (
          <div style={S.statusValueOff}>
            ⚠️ 비활성 — 메일 발송이 설정되지 않아 자동 발송이 동작하지 않습니다.
            {envHasSmtp ? ' (환경변수 SMTP_HOST 가 설정되어 있으나 활성 조건이 충족되지 않음)' : ''}
          </div>
        )}
      </div>

      {/* Render Free 안내 */}
      <div style={S.infoBanner}>
        <div style={S.infoTitle}>ℹ️ Render 무료 플랜 사용자 안내</div>
        <div style={S.infoText}>
          Render 무료 플랜은 SMTP 포트(25 / 465 / 587) 연결이 제한될 수 있습니다.
          테스트 메일이 <strong>Connection timeout</strong> 으로 실패하면 SMTP 설정 문제가 아니라 서버 플랜 문제일 수 있습니다.
          이 경우 <strong>Resend / SendGrid 같은 메일 API 방식</strong> 사용 또는 <strong>Render 유료 플랜 전환</strong>을 권장합니다.
        </div>
      </div>

      {/* 발송 방식 (provider) */}
      <div style={S.panel}>
        <div style={S.label}>📤 발송 방식</div>
        <div style={S.providerRow}>
          {PROVIDERS.map(p => {
            const on = form.provider === p.v;
            return (
              <button key={p.v}
                style={{ ...S.providerBtn, ...(on ? S.providerOn : {}) }}
                onClick={() => setForm({ ...form, provider: p.v })}>
                <div style={S.providerName}>{p.l}</div>
                <div style={S.providerDesc}>{p.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 폼 */}
      <div style={S.panel}>
        <div style={S.label}>{isSmtp ? '📨 SMTP 설정' : isApi ? '🔑 API 설정' : '📁 저장 전용'}</div>
        <label style={S.toggleRow}>
          <input type="checkbox" checked={!!form.enabled}
            onChange={e => setForm({ ...form, enabled: e.target.checked })}
            disabled={isNone} />
          <span><strong>메일 발송 사용</strong> — OFF 시 메일은 보내지 않고 저장만 합니다.</span>
        </label>

        {isSmtp && (
          <>
            <div style={S.grid2}>
              <Field label="SMTP 호스트 *" placeholder="예: smtp.naver.com / smtp.gmail.com"
                value={form.host} onChange={v => setForm({ ...form, host: v })} />
              <Field label="포트" placeholder="587" type="number" min={1} max={65535}
                value={form.port} onChange={v => setForm({ ...form, port: Number(v) || 587 })}
                hint={PORT_HINTS.map(p => p.l).join(' · ')} />
            </div>

            <label style={S.toggleRow}>
              <input type="checkbox" checked={!!form.secure}
                onChange={e => setForm({ ...form, secure: e.target.checked })} />
              <span>secure (SSL/TLS) — 포트 465 사용 시 ON, 587(STARTTLS) 은 OFF</span>
            </label>

            <div style={S.grid2}>
              <Field label="사용자 (SMTP_USER)" placeholder="user@example.com"
                value={form.user} onChange={v => setForm({ ...form, user: v })} />
              <Field label="비밀번호 (SMTP_PASS)" type="password"
                placeholder={stored.hasPassword ? '저장된 비밀번호 (변경하려면 입력)' : '비밀번호 입력'}
                value={form.password}
                onChange={v => { setForm({ ...form, password: v }); setPwTouched(true); }}
                hint={stored.hasPassword ? '※ 빈 칸으로 두면 기존 저장 비밀번호를 유지합니다.' : ''} />
            </div>
          </>
        )}

        {isApi && (
          <>
            <Field
              label={`${isResend ? 'Resend' : 'SendGrid'} API 키`}
              type="password"
              placeholder={stored.hasApiKey ? '저장된 API 키 (변경하려면 입력)' : (isResend ? 're_xxxxxxxx...' : 'SG.xxxxxxxx...')}
              value={form.apiKey}
              onChange={v => { setForm({ ...form, apiKey: v }); setKeyTouched(true); }}
              hint={isResend
                ? '※ resend.com 에서 발급. FROM 주소가 검증된 도메인이어야 합니다.'
                : '※ sendgrid.com 에서 발급. Single Sender 또는 Domain Authentication 필요.'} />
          </>
        )}

        {isNone && (
          <div style={S.tipNote}>
            메일은 발송하지 않고 서버에 저장만 합니다. 기능개선 제안 · 리포트 등은 화면 / 다운로드로 확인할 수 있습니다.
          </div>
        )}

        <Field label="발신자 표시 (From)" placeholder='예: "Trend Collector <user@example.com>"'
          value={form.from} onChange={v => setForm({ ...form, from: v })}
          hint={isApi ? 'API 발송은 인증된 발신자 도메인의 주소를 사용해야 합니다.' : ''} />

        <div style={S.divider} />

        <Field label="기능개선 제안 수신 이메일"
          placeholder={stored.feedbackTo ? '' : '비워두면 환경변수/기본값 (hsuhyun77@naver.com) 사용'}
          value={form.feedbackTo} onChange={v => setForm({ ...form, feedbackTo: v })} />

        <Field label="리포트 수신 기본 이메일 (참고용)"
          placeholder='실제 리포트 수신자는 "수신자" 탭에서 관리합니다.'
          value={form.reportDefaultTo} onChange={v => setForm({ ...form, reportDefaultTo: v })} />

        <div style={S.actions}>
          <button onClick={save} disabled={busy === 'save'} style={S.saveBtn}>
            {busy === 'save' ? '⏳ 저장 중…' : '💾 저장'}
          </button>
          <button onClick={refresh} disabled={!!busy} style={S.ghost}>↻ 새로고침</button>
        </div>
      </div>

      {/* 테스트 메일 */}
      <div style={S.panel}>
        <div style={S.label}>🧪 테스트 메일 발송</div>
        <div style={S.testRow}>
          <input type="email" placeholder="테스트 받을 이메일 주소"
            value={testTo} onChange={e => setTestTo(e.target.value)}
            style={S.testInp} />
          <button onClick={sendTest} disabled={busy === 'test' || !testTo || isNone} style={S.testBtn}>
            {busy === 'test' ? '⏳ 발송 중…' : '📤 테스트 보내기'}
          </button>
        </div>
        <div style={S.tip}>
          💡 저장 후 테스트하세요. 실패 시 인증/포트/TLS/네트워크/API 오류 원인을 한국어로 안내합니다.
          {isNone && ' 현재 "저장만" 으로 설정되어 테스트 메일은 발송되지 않습니다.'}
        </div>
      </div>

      {msg && (
        <div style={msg.type === 'ok' ? S.ok : S.err}>
          {msg.errType && <div style={S.errType}>{errorTitleByType(msg.errType)}</div>}
          <div style={S.errBody}>{msg.text}</div>
        </div>
      )}
    </div>
  );
}

function providerLabel(p) {
  return ({ smtp: 'SMTP', resend: 'Resend API', sendgrid: 'SendGrid API', none: '저장만' })[p] || p || '미설정';
}
function errorTitleByType(t) {
  return ({
    'connection-timeout': 'SMTP 서버에 연결하지 못했습니다 (Connection timeout).',
    'dns-or-host':        'SMTP 호스트 이름을 찾을 수 없습니다.',
    'refused':            '서버가 연결을 거부했습니다.',
    'auth':               '메일 인증에 실패했습니다 (아이디/비밀번호 오류).',
    'tls':                '보안 연결(TLS) 설정 오류입니다.',
    'missing-config':     'SMTP / API 설정값이 비어 있습니다.',
    'provider-none':      '발송 방식이 "저장만" 으로 설정되어 있습니다.',
    'resend':             'Resend API 호출이 거부되었습니다.',
    'sendgrid':           'SendGrid API 호출이 거부되었습니다.',
  })[t] || '메일 발송 실패';
}

function Field({ label, value, onChange, type = 'text', placeholder = '', hint = '', min, max }) {
  return (
    <label style={S.field}>
      <span style={S.fLabel}>{label}</span>
      <input type={type} value={value || ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        min={min} max={max}
        style={S.fInp} />
      {hint && <span style={S.fHint}>{hint}</span>}
    </label>
  );
}

const S = {
  empty:  { padding: 30, color: '#888', textAlign: 'center', background: 'white', borderRadius: 12 },

  statusCard:  { background: '#0d1117', color: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 11 },
  statusLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.7px' },
  statusValueOk:  { fontSize: 14, fontWeight: 500, marginTop: 4, color: '#86efac' },
  statusValueOff: { fontSize: 14, fontWeight: 500, marginTop: 4, color: '#fdba74' },

  infoBanner: { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
                borderRadius: 10, padding: '10px 14px', marginBottom: 11, fontSize: 12.5, lineHeight: 1.6 },
  infoTitle:  { fontWeight: 700, marginBottom: 4 },
  infoText:   { fontSize: 12, color: '#92400e' },

  panel: { background: 'white', borderRadius: 12, padding: 16, marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label: { fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 12 },
  divider: { height: 1, background: '#f0ede8', margin: '14px 0 10px' },

  providerRow: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 },
  providerBtn: { background: 'white', border: '1.5px solid #e5e0d8', borderRadius: 9, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  providerOn:  { background: '#0d1117', color: 'white', borderColor: '#0d1117' },
  providerName:{ fontSize: 13, fontWeight: 700, marginBottom: 2 },
  providerDesc:{ fontSize: 11, color: '#888', lineHeight: 1.5 },

  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  field:    { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 },
  fLabel:   { fontSize: 12, fontWeight: 600, color: '#444' },
  fInp:     { padding: '10px 12px', minHeight: 44, fontSize: 14, border: '1.5px solid #e5e0d8',
              borderRadius: 8, outline: 'none', background: '#fafaf8', fontFamily: 'inherit' },
  fHint:    { fontSize: 11, color: '#888' },

  toggleRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', fontSize: 13.5, color: '#222', cursor: 'pointer' },

  actions: { display: 'flex', gap: 8, marginTop: 8 },
  saveBtn: { padding: '10px 16px', minHeight: 44, borderRadius: 8, border: 'none',
             background: '#0d1117', color: 'white', fontSize: 13, fontWeight: 700,
             cursor: 'pointer', fontFamily: 'inherit' },
  ghost:   { padding: '10px 14px', minHeight: 44, borderRadius: 8, border: '1.5px solid #d5d0c8',
             background: 'white', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },

  testRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  testInp: { flex: '1 1 220px', minHeight: 44, padding: '10px 12px', fontSize: 14,
             border: '1.5px solid #e5e0d8', borderRadius: 8, outline: 'none', background: '#fafaf8', fontFamily: 'inherit' },
  testBtn: { minHeight: 44, padding: '10px 16px', borderRadius: 8, border: 'none',
             background: '#22c55e', color: 'white', fontSize: 13, fontWeight: 700,
             cursor: 'pointer', fontFamily: 'inherit' },
  tip:     { fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a',
             padding: '8px 11px', borderRadius: 7, marginTop: 8 },
  tipNote: { background: '#f8f6f2', border: '1px solid #d5d0c8', color: '#444',
             padding: '10px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.6, margin: '8px 0' },

  ok:  { background: '#dcfce7', border: '1px solid #86efac', color: '#166534',
         padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10, whiteSpace: 'pre-wrap' },
  err: { background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b',
         padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10, whiteSpace: 'pre-wrap' },
  errType: { fontWeight: 700, marginBottom: 4 },
  errBody: { fontSize: 12.5, lineHeight: 1.6 },
};
