// ─────────────────────────────────────────────
// ScheduleSettings.jsx — 자동 수집 / 발송 / 알림 풀에디터
// ─────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { fmtFull, fmtUntil } from '../../utils/datetime.js';

const QUICK_INTERVALS = [3, 6, 12, 24, 48];

function clampHours(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  if (n < 1)   return 1;
  if (n > 168) return 168;
  return n;
}

export default function ScheduleSettings({ config, health, onUpdate }) {
  const c = config || {};
  const h = health || {};
  const sch = h.schedule || {};

  const set = (patch) => onUpdate(patch);

  // n시간 직접 입력 — 로컬 입력은 string 으로, blur 시점에 검증·저장
  const [hoursStr, setHoursStr] = useState(String(c.intervalHours || 6));
  const [hoursErr, setHoursErr] = useState('');
  useEffect(() => { setHoursStr(String(c.intervalHours || 6)); }, [c.intervalHours]);

  function commitHours() {
    const n = clampHours(hoursStr);
    if (n === null) {
      setHoursErr('숫자만 입력하세요 (1~168)');
      return;
    }
    if (n !== Number(hoursStr)) setHoursStr(String(n));
    setHoursErr('');
    if (n !== c.intervalHours) set({ intervalHours: n });
  }

  return (
    <div>
      {/* 다음 실행 시각 카드 */}
      <div style={S.statusCard}>
        <div style={S.statusLabel}>현재 자동 수집 상태</div>
        <div style={S.statusValue}>
          {sch.autoCollect && sch.mode !== 'off' ? (
            <>
              <span style={S.dotOn} />
              {sch.mode === 'daily'
                ? `매일 ${sch.reportTime || c.reportTime || '09:00'}`
                : `${sch.intervalHours || c.intervalHours || 6}시간마다`}
            </>
          ) : (
            <>
              <span style={S.dotOff} />
              자동 수집 OFF
            </>
          )}
        </div>
        {sch.nextAt && (
          <div style={S.statusSub}>
            다음 예정: <strong>{fmtFull(sch.nextAt)}</strong> <span style={{ color: '#94a3b8' }}>({fmtUntil(sch.nextAt)})</span>
          </div>
        )}
      </div>

      {/* 자동 수집 ON/OFF + 모드 선택 */}
      <div style={S.panel}>
        <div style={S.label}>⏰ 자동 수집</div>

        <Toggle
          on={c.autoCollect !== false}
          onChange={v => set({ autoCollect: v })}
          label="자동 수집 ON"
        />

        <div style={{ ...S.sectionLabel, marginTop: 14 }}>수집 모드</div>
        <div style={S.modeRow}>
          {[
            { v: 'daily',    l: '📅 매일 특정 시각' },
            { v: 'interval', l: '⏱ N시간 간격' },
            { v: 'off',      l: '⏹ 사용 안 함' },
          ].map(m => (
            <button key={m.v}
              style={{ ...S.modeBtn, ...((c.scheduleMode || 'daily') === m.v ? S.modeOn : {}) }}
              onClick={() => set({ scheduleMode: m.v })}
              disabled={c.autoCollect === false}>
              {m.l}
            </button>
          ))}
        </div>

        {(c.scheduleMode || 'daily') === 'daily' && (
          <div style={S.field}>
            <label style={S.fieldLabel}>매일 수집 시각 (KST)</label>
            <input type="time" style={S.inp}
              value={c.reportTime || '09:00'}
              onChange={e => set({ reportTime: e.target.value })} />
          </div>
        )}

        {c.scheduleMode === 'interval' && (
          <div style={S.field}>
            <label style={S.fieldLabel}>수집 주기 (시간 단위, 1 ~ 168)</label>

            <div style={S.hoursRow}>
              <input type="number" min={1} max={168} step={1}
                style={{ ...S.hoursInp, ...(hoursErr ? S.hoursErr : {}) }}
                value={hoursStr}
                onChange={e => setHoursStr(e.target.value)}
                onBlur={commitHours}
                onKeyDown={e => e.key === 'Enter' && commitHours()} />
              <span style={S.hoursUnit}>시간마다 자동 수집</span>
            </div>
            {hoursErr && <div style={S.hoursWarn}>{hoursErr}</div>}

            <div style={{ ...S.fieldLabel, marginTop: 10 }}>빠른 선택</div>
            <div style={S.intRow}>
              {QUICK_INTERVALS.map(v => (
                <button key={v}
                  style={{ ...S.intBtn, ...(Number(c.intervalHours) === v ? S.intOn : {}) }}
                  onClick={() => { setHoursStr(String(v)); setHoursErr(''); set({ intervalHours: v }); }}>
                  {v}시간
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 발송 옵션 */}
      <div style={S.panel}>
        <div style={S.label}>📧 자동 발송</div>
        <Toggle on={c.autoEmail !== false}  onChange={v => set({ autoEmail: v })}
                label="수집 후 자동으로 메일 발송" />
        <Toggle on={!!c.attachPdf}          onChange={v => set({ attachPdf: v })}
                label="PDF 파일 첨부 (P2 — 활성화하면 향후 적용)" />
        {!h.smtp && (
          <div style={S.warn}>⚠️ SMTP_HOST 가 설정되어 있지 않아 실제 발송은 비활성 상태입니다.</div>
        )}
      </div>

      {/* 알림 트리거 */}
      <div style={S.panel}>
        <div style={S.label}>🔔 알림 조건 (메일에 ⚠️ 표시)</div>
        <Toggle on={!!c.alertOnNegative} onChange={v => set({ alertOnNegative: v })}
                label="부정 비율 50% 이상" />
        <Toggle on={!!c.alertOnTrending} onChange={v => set({ alertOnTrending: v })}
                label="급상승 이슈 발생" />
        <Toggle on={!!c.alertOnCentral}  onChange={v => set({ alertOnCentral: v })}
                label="중앙언론 보도 발생" />
        <Toggle on={!!c.alertOnGov}      onChange={v => set({ alertOnGov: v })}
                label="정부/공공기관 보도자료 발생" />
        <div style={S.tip}>
          💡 위 조건이 만족되면 메일 제목 앞에 ⚠️ 가 붙습니다 (별도 긴급 메일은 P2 후속 작업).
        </div>
      </div>

      <div style={S.tip}>
        💡 환경변수 <code>REPORT_TIME</code> 은 서버 부팅 시 기본값으로만 사용됩니다.
        실제 운영 중에는 위 설정이 우선합니다.
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <label style={S.toggle}>
      <input type="checkbox" checked={!!on} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

const S = {
  statusCard: { background: '#0d1117', color: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 11 },
  statusLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.7px' },
  statusValue: { fontSize: 16, fontWeight: 700, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 },
  statusSub:   { fontSize: 12, color: '#cbd5e1', marginTop: 6 },
  dotOn:  { width: 8, height: 8, borderRadius: '50%', background: '#22c55e' },
  dotOff: { width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' },

  panel: { background: 'white', borderRadius: 12, padding: 15, marginBottom: 11, boxShadow: '0 1px 2px rgba(0,0,0,.06)' },
  label: { fontSize: 10.5, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 12 },
  sectionLabel: { fontSize: 11.5, fontWeight: 600, color: '#666', marginBottom: 6 },

  toggle: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', fontSize: 13, color: '#222', cursor: 'pointer', userSelect: 'none' },

  modeRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  modeBtn: { flex: '1 1 140px', minHeight: 44, padding: '9px 10px', borderRadius: 8, border: '2px solid #e5e0d8',
             background: 'white', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#555' },
  modeOn:  { borderColor: '#0d1117', background: '#0d1117', color: 'white' },

  field:      { marginTop: 12 },
  fieldLabel: { fontSize: 11.5, fontWeight: 600, color: '#444', display: 'block', marginBottom: 5 },
  inp:        { padding: '9px 11px', fontSize: 14, border: '2px solid #e5e0d8', borderRadius: 8, outline: 'none', background: '#fafaf8', minWidth: 120 },
  intRow:     { display: 'flex', gap: 5, flexWrap: 'wrap' },
  intBtn:     { minHeight: 40, padding: '7px 12px', borderRadius: 8, border: '2px solid #e5e0d8', background: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: '#555' },
  intOn:      { borderColor: '#0d1117', background: '#0d1117', color: 'white' },

  warn: { background: '#fff5f5', border: '1px solid #ffd0d0', color: '#c53030', padding: '7px 10px', borderRadius: 7, fontSize: 11.5, marginTop: 8 },
  tip:  { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '8px 11px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.6 },

  hoursRow:  { display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 },
  hoursInp:  { width: 100, padding: '10px 12px', minHeight: 44, fontSize: 16, fontWeight: 700,
               border: '2px solid #e5e0d8', borderRadius: 8, outline: 'none', background: '#fafaf8',
               textAlign: 'right', fontFamily: 'inherit' },
  hoursErr:  { borderColor: '#c53030' },
  hoursUnit: { fontSize: 13, color: '#444' },
  hoursWarn: { color: '#c53030', fontSize: 11.5, marginTop: 4 },
};
