/** 공통 유틸 & 렌더링 조각 */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
const LETTERS = 'ABCDEFGH';
const OPT_COLORS = ['var(--c0)', 'var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];
const pct = (n, t) => (t ? Math.round((n / t) * 100) : 0);

// 로고 아이콘: 고담 스카이라인 (저작권 캐릭터 로고 대신 오리지널 아이콘 사용)
const CITY_ICON = '<svg viewBox="0 0 24 24" fill="#0F172A" aria-hidden="true"><path d="M2 21V12h3V9h2v3h2V5h3v16h1V8l2-2 2 2v13h1v-8h4v8z"/></svg>';
const SKYLINE_SVG = '<svg class="skyline" viewBox="0 0 220 80" fill="#fff" aria-hidden="true"><path d="M0 80V52h12V38h10v14h8V24h14v56h6V30l8-10 8 10v50h6V44h16v36h6V14h6V4h4v10h6v66h6V40h12v40h8V28h14v52h6V48h10v32h8V34h12v46z"/></svg>';

function toast(msg, type = 'ok') {
  let box = $('#toast'); if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.appendChild(box); }
  const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg; box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

function groupOf(state, id) { return (state.groups || []).find((g) => g.groupId === id) || { groupId: id, groupName: id || '-', color: '#94A3B8', table: '' }; }
function dilemmaOf(state, id) { return (state.dilemmas || []).find((d) => d.dilemmaId === id); }
function roleTypeOf(state, key) { return (state.roleTypes || []).find((r) => r.roleKey === key) || { roleName: key, icon: '' }; }

/** 가로 막대 그래프 */
function barsHTML(dilemma, v, opts = {}) {
  if (!dilemma) return '';
  const counts = (v && v.counts) || dilemma.options.map(() => 0);
  const total = (v && v.total) || 0;
  const max = Math.max(...counts, 0);
  return `<div class="bars ${opts.big ? 'big-bars' : ''}">` + dilemma.options.map((o, i) => {
    const p = pct(counts[i], total);
    const lead = max > 0 && counts[i] === max;
    const label = opts.short ? o.split(' — ')[0] : o;
    return `<div class="bar-row">
      <div class="bar-label"><span class="L-dot" style="background:${OPT_COLORS[i]}">${LETTERS[i]}</span><span class="t">${esc(label)}</span>${lead && opts.big ? '<span class="badge badge-gold">최다</span>' : ''}</div>
      <div class="bar-num">${counts[i]}<span class="muted" style="font-weight:600"> 명 · ${p}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${p}%;background:${OPT_COLORS[i]}"></div></div>
    </div>`;
  }).join('') + '</div>';
}

/** 역할별 누적 막대 */
function stackHTML(counts) {
  const t = counts.reduce((a, b) => a + b, 0);
  if (!t) return '<div class="stack"></div>';
  return '<div class="stack">' + counts.map((c, i) => `<i style="width:${pct(c, t)}%;background:${OPT_COLORS[i]}" title="${LETTERS[i]}: ${c}명"></i>`).join('') + '</div>';
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = label || '저장 중…'; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

/** 재렌더링 시 입력값 보존 */
function snapshotInputs(root) {
  const m = {}; $$('input[id],textarea[id],select[id]', root).forEach((el) => { m[el.id] = el.value; }); return m;
}
function restoreInputs(root, m) {
  Object.keys(m || {}).forEach((id) => { const el = root.querySelector('#' + CSS.escape(id)); if (el && m[id] !== '' && el.type !== 'radio') el.value = m[id]; });
}
