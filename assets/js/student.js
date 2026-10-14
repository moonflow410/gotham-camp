/** 학생용 웹앱 (index.html) */
const CFG = window.GOTHAM_CONFIG || {};
const CRED_KEY = 'gotham_cred_v1';
const CAREERS = ['공학·IT', '자연과학', '법·행정', '정치·외교', '미디어·언론', '보건·의료', '경제·경영', '교육·사회복지', '심리·상담', '예술·디자인', '기타'];
const CRITERIA = [
  ['logic', '논리성', '주장과 근거가 타당한가'],
  ['creativity', '창의성', '진로·관심사를 살린 새로운 해결책인가'],
  ['feasibility', '실현 가능성', '고담시(현실)에서 실행할 수 있는가'],
  ['delivery', '전달력', '발표가 명확하고 이해하기 쉬운가']
];
const TABS = [
  { id: 's1', n: 1, label: '1차시', sub: '브리핑 · 투표' },
  { id: 's2', n: 2, label: '2차시', sub: '관점 · 주제' },
  { id: 's3', n: 3, label: '3차시', sub: '발표 · 평가' }
];

const App = { state: null, me: null, cred: null, tab: null, picked: null, picks: {}, scores: {}, sig: '' };

/* ---------- 부팅 ---------- */
(async function boot() {
  $('#logo').innerHTML = CITY_ICON;
  if (Api.DEMO) $('#demoBadge').classList.remove('hidden');
  $('#logoutBtn').onclick = logout;
  try { App.state = await Api.get('state'); }
  catch (e) { return fatal(e); }
  $('#campTitle').textContent = App.state.settings.campTitle || '고담시의 선택';
  try { App.cred = JSON.parse(localStorage.getItem(CRED_KEY) || 'null'); } catch (e) {}
  if (App.cred) { try { const m = await Api.get('me', App.cred); if (m.registered) App.me = m; } catch (e) {} }
  App.me ? enterApp() : renderRegister();
  setInterval(poll, CFG.POLL_STUDENT_MS || 7000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
})();

function fatal(e) {
  $('#app').innerHTML = `<div class="card text-center"><div class="text-4xl mb-2">📡</div><h2>서버에 연결할 수 없어요</h2>
    <p class="muted mt-1">${esc(e.message)}</p><button class="btn btn-navy mt-4" onclick="location.reload()">다시 시도</button></div>`;
}

async function poll() {
  if (document.hidden) return;
  try {
    const st = await Api.get('state');
    const prev = App.state; App.state = st;
    if (!App.me) return updateCardGrid();
    if (prev && prev.settings.currentSession !== st.settings.currentSession) {
      toast(`${st.settings.currentSession}차시가 시작되었어요!`, 'ok'); renderTabs();
    }
    const sig = settingsSig();
    if (sig !== App.sig) renderTab(true); else updateLive();
  } catch (e) { /* 네트워크 일시 오류는 무시하고 다음 주기에 재시도 */ }
}
function settingsSig() {
  const s = App.state.settings;
  return [s.currentSession, s.voteOpen, s.submitOpen, s.evalOpen, s.presentingGroup, s.activeDilemmaId].join('|');
}
async function refreshMe() { try { const m = await Api.get('me', App.cred); if (m.registered) App.me = m; } catch (e) {} }
async function refreshState() { try { App.state = await Api.get('state'); } catch (e) {} }

function logout() {
  if (!confirm('이 기기에서 나갈까요? (기록은 서버에 그대로 남아 있어요)')) return;
  localStorage.removeItem(CRED_KEY); App.me = null; App.cred = null; App.tab = null;
  $('#logoutBtn').classList.add('hidden'); renderRegister();
}

/* ---------- 1. 등록 화면 ---------- */
function renderRegister() {
  const st = App.state;
  $('#app').innerHTML = `
  <section class="idcard mb-5">
    ${SKYLINE_SVG}
    <div class="k">GOTHAM CITY · CITIZEN REGISTRATION</div>
    <h1 class="text-2xl font-extrabold mt-1">고담시에 오신 것을 환영합니다</h1>
    <p class="text-indigo-100 mt-1 text-sm">받은 <b class="text-amber-300">신분증 카드</b>의 번호를 고르면, 오늘 여러분이 맡을 역할과 앉을 자리가 정해집니다.</p>
  </section>

  <section class="card mb-4">
    <div class="eyebrow">STEP 1</div><h2>나는 누구인가요?</h2>
    <div class="grid grid-cols-2 gap-3 mt-3">
      <div><label class="label" for="r-id">학번</label><input id="r-id" class="input" inputmode="numeric" autocomplete="off" placeholder="예: 20101" value="${esc(App.cred?.studentId || '')}"></div>
      <div><label class="label" for="r-name">이름</label><input id="r-name" class="input" autocomplete="off" placeholder="홍길동" value="${esc(App.cred?.name || '')}"></div>
    </div>
    <div class="mt-3"><span class="label">성별</span>
      <div class="grid grid-cols-2 gap-2" id="r-gender">
        <button class="opt" data-g="남" type="button"><span class="L" style="background:var(--navy)">남</span>남학생</button>
        <button class="opt" data-g="여" type="button"><span class="L" style="background:var(--c4)">여</span>여학생</button>
      </div>
    </div>
    <div class="mt-3 text-sm muted flex items-center justify-between gap-2 flex-wrap">이미 등록했나요? 학번·이름만 입력하고
      <button id="r-login" class="btn btn-sm btn-ghost" type="button">다시 입장하기</button></div>
  </section>

  <section class="card mb-4">
    <div class="flex items-end justify-between gap-2">
      <div><div class="eyebrow">STEP 2</div><h2>받은 신분증 카드 번호를 선택하세요</h2></div>
      <span class="badge whitespace-nowrap" id="r-count"></span>
    </div>
    <p class="muted text-sm mt-1">이미 다른 친구가 등록한 카드는 선택할 수 없어요.</p>
    <div id="cardGrid" class="mt-4 grid gap-4"></div>
  </section>

  <div class="sticky bottom-3">
    <button id="r-submit" class="btn btn-gold btn-block text-lg shadow-lg">역할 등록하고 입장하기</button>
  </div>`;
  App.gender = '';
  $$('#r-gender .opt').forEach((b) => b.onclick = () => { App.gender = b.dataset.g; $$('#r-gender .opt').forEach((x) => x.classList.toggle('sel', x === b)); });
  $('#r-submit').onclick = submitRegister;
  $('#r-login').onclick = relogin;
  updateCardGrid();
}

function updateCardGrid() {
  const grid = $('#cardGrid'); if (!grid) return;
  const st = App.state;
  $('#r-count').textContent = `등록 ${st.registeredCount} / ${st.roles.length}`;
  grid.innerHTML = st.roleTypes.map((rt) => {
    const cards = st.roles.filter((r) => r.roleKey === rt.roleKey);
    return `<div>
      <div class="flex items-center gap-2 mb-2"><span class="text-xl">${rt.icon}</span><b>${esc(rt.roleName)}</b></div>
      <div class="pick-grid">${cards.map((c) => `
        <button class="pick ${App.picked === c.cardId ? 'sel' : ''}" data-card="${esc(c.cardId)}" ${c.taken ? 'disabled' : ''} type="button">
          <b>${esc(c.cardId)}</b><small>${c.taken ? '등록됨' : '선택 가능'}</small>
        </button>`).join('')}</div>
    </div>`;
  }).join('');
  if (App.picked && st.roles.find((r) => r.cardId === App.picked && r.taken)) App.picked = null;
  $$('.pick', grid).forEach((b) => b.onclick = () => { App.picked = b.dataset.card; $$('.pick', grid).forEach((x) => x.classList.toggle('sel', x === b)); });
}

async function submitRegister() {
  const studentId = $('#r-id').value.trim(), name = $('#r-name').value.trim();
  if (!studentId || !name) return toast('학번과 이름을 입력하세요.', 'err');
  if (!App.gender) return toast('성별을 선택하세요.', 'err');
  if (!App.picked) return toast('받은 신분증 카드 번호를 선택하세요.', 'err');
  const card = App.state.roles.find((r) => r.cardId === App.picked);
  const g = groupOf(App.state, card.groupId);
  if (!confirm(`${name} 학생, ${App.picked} (${card.roleName}) 카드가 맞나요?\n→ ${g.groupName} · ${card.seat}번 좌석`)) return;
  const btn = $('#r-submit'); setBusy(btn, true, '등록 중…');
  try {
    const m = await Api.post('register', { studentId, name, gender: App.gender, cardId: App.picked });
    App.cred = { studentId, name }; localStorage.setItem(CRED_KEY, JSON.stringify(App.cred));
    App.me = m; await refreshState(); enterApp(); showSeatModal();
  } catch (e) { toast(e.message, 'err'); await refreshState(); updateCardGrid(); }
  finally { setBusy(btn, false); }
}

async function relogin() {
  const studentId = $('#r-id').value.trim(), name = $('#r-name').value.trim();
  if (!studentId || !name) return toast('학번과 이름을 입력하세요.', 'err');
  try {
    const m = await Api.get('me', { studentId, name });
    if (!m.registered) return toast(m.known ? '아직 카드를 등록하지 않았어요. 카드를 선택하세요.' : '학번 또는 이름이 일치하지 않아요.', 'err');
    App.cred = { studentId, name }; localStorage.setItem(CRED_KEY, JSON.stringify(App.cred));
    App.me = m; enterApp(); toast(`${name} 학생, 다시 오신 걸 환영해요!`);
  } catch (e) { toast(e.message, 'err'); }
}

function showSeatModal() {
  const m = App.me;
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal text-center">
    <div class="text-5xl mb-2">${m.role.icon}</div>
    <div class="eyebrow">등록 완료</div>
    <h2 class="text-2xl font-extrabold mt-1">${esc(m.role.roleName)}</h2>
    <div class="mt-4 rounded-2xl p-5" style="background:${m.group.color}1A;border:2px solid ${m.group.color}">
      <div class="muted text-sm">이동할 자리</div>
      <div class="text-3xl font-black mt-1" style="color:${m.group.color}">${esc(m.group.groupName)}</div>
      <div class="text-xl font-bold mt-1">${esc(m.group.table)} · ${m.role.seat}번 좌석</div>
    </div>
    <p class="muted mt-3 text-sm">대형 화면에서도 내 자리를 확인할 수 있어요.</p>
    <button class="btn btn-navy btn-block mt-4">확인</button></div>`;
  bg.querySelector('button').onclick = () => bg.remove();
  document.body.appendChild(bg);
}

/* ---------- 2. 메인 화면 ---------- */
function enterApp() {
  $('#logoutBtn').classList.remove('hidden');
  const m = App.me;
  App.tab = App.tab || 's' + Math.min(3, App.state.settings.currentSession);
  $('#app').innerHTML = `
  <section class="idcard mb-4">
    ${SKYLINE_SVG}
    <div class="flex items-center gap-4 relative">
      <div class="role-icon">${m.role.icon}</div>
      <div class="min-w-0 flex-1">
        <div class="k">GOTHAM ID · ${esc(m.role.cardId)}</div>
        <div class="text-xl font-extrabold leading-tight mt-0.5">${esc(m.role.roleName)}</div>
        <div class="text-sm text-indigo-100 mt-0.5">${esc(m.student.name)} · ${esc(m.student.studentId)}</div>
      </div>
      <div class="text-right flex-none">
        <div class="text-xs text-indigo-200">내 자리</div>
        <div class="font-black text-lg" style="color:#FCD34D">${esc(m.group.groupName)}</div>
        <div class="text-sm">${m.role.seat}번 좌석</div>
      </div>
    </div>
  </section>
  <nav class="tabs mb-4 sticky top-[68px] z-20" id="tabs"></nav>
  <div id="content"></div>`;
  renderTabs();
  renderTab();
  bindContent();
}

function renderTabs() {
  const cur = App.state.settings.currentSession;
  $('#tabs').innerHTML = TABS.map((t) => `<button class="tab ${App.tab === t.id ? 'active' : ''} ${t.n > cur ? 'locked' : ''}" data-tab="${t.id}" data-n="${t.n}">
    <b>${t.n > cur ? '🔒 ' : ''}${t.label}</b><small>${t.sub}</small></button>`).join('');
  $$('#tabs .tab').forEach((b) => b.onclick = () => {
    if (Number(b.dataset.n) > App.state.settings.currentSession) return toast('아직 열리지 않은 차시예요. 선생님 안내를 기다려 주세요.', 'err');
    App.tab = b.dataset.tab; renderTabs(); renderTab(); window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function renderTab(keepInputs) {
  const root = $('#content'); if (!root) return;
  const snap = keepInputs ? snapshotInputs(root) : null;
  App.sig = settingsSig();
  root.innerHTML = ({ s1: tabS1, s2: tabS2, s3: tabS3 }[App.tab] || tabS1)();
  if (snap) restoreInputs(root, snap);
  updateLive();
}

/* 실시간 영역: data-live 속성을 가진 요소만 주기적으로 갱신 (입력 중인 폼은 건드리지 않음) */
const LIVE = {
  voteResult(el) {
    const d = dilemmaOf(App.state, el.dataset.d), mine = App.me.votes[el.dataset.d];
    if (!mine) return `<p class="muted text-sm">투표하면 친구들의 선택 결과를 볼 수 있어요.</p>`;
    const v = App.state.votes[d.dilemmaId];
    return `<div class="flex items-center justify-between mb-2"><b class="text-sm">실시간 결과</b><span class="badge"><span class="live-dot"></span> ${v.total}명 참여</span></div>${barsHTML(d, v, { short: true })}`;
  },
  analysis() {
    const st = App.state, rk = App.me.role.roleKey;
    return st.dilemmas.filter((d) => d.session === 1).map((d) => {
      const v = st.votes[d.dilemmaId], mine = v.byRole[rk] || [], mt = mine.reduce((a, b) => a + b, 0);
      return `<div class="py-3">
        <h3 class="mb-2">${esc(d.title)}</h3>${barsHTML(d, v, { short: true })}
        <div class="mt-3 text-sm"><b>${App.me.role.icon} 같은 역할(${esc(App.me.role.roleName)}) 친구들</b> <span class="muted">${mt}명</span></div>
        <div class="mt-1">${stackHTML(mine)}</div>
        <div class="flex flex-wrap gap-2 mt-1 text-xs muted">${d.options.map((o, i) => `<span><span class="L-dot" style="width:14px;height:14px;font-size:.6rem;background:${OPT_COLORS[i]}">${LETTERS[i]}</span> ${mine[i] || 0}명</span>`).join('')}</div>
      </div>`;
    }).join('<div class="divider" style="margin:4px 0"></div>');
  },
  groupTopic() {
    const t = App.state.topics[App.me.group.groupId];
    if (!t) return `<p class="muted text-sm">아직 우리 그룹 주제가 정해지지 않았어요. 함께 논의한 뒤 아래에 등록하세요.</p>`;
    const d = dilemmaOf(App.state, t.dilemmaId);
    return `<div class="rounded-xl p-4" style="background:var(--gold-soft)">
      <div class="text-xs font-bold" style="color:var(--gold-ink)">공통 딜레마 · ${esc(d ? d.title : t.dilemmaId)}</div>
      <div class="text-lg font-extrabold mt-1">${esc(t.title)}</div>
      ${t.problem ? `<p class="text-sm mt-1 ink2">${nl2br(t.problem)}</p>` : ''}
      <div class="text-xs muted mt-2">마지막 수정: ${esc(t.updatedBy)} · ${esc(t.updatedAt.slice(5, 16))}</div></div>`;
  },
  groupPlans() {
    const st = App.state, gid = App.me.group.groupId;
    const members = st.roles.filter((r) => r.groupId === gid).sort((a, b) => a.seat - b.seat);
    return `<div class="grid gap-2">` + members.map((r) => {
      const p = st.plans.find((x) => x.name === r.studentName && x.groupId === gid);
      return `<div class="rounded-xl p-3" style="background:var(--surface-2);border:1px solid var(--line)">
        <div class="flex items-center gap-2"><span>${r.icon}</span><b>${esc(r.studentName || '(미등록)')}</b><span class="muted text-xs">${esc(r.roleName)}</span>
        ${p ? `<span class="badge badge-sky ml-auto">${esc(p.career)}</span>` : '<span class="badge ml-auto">작성 전</span>'}</div>
        ${p ? `<div class="text-sm mt-1"><b>담당:</b> ${esc(p.task || '-')}</div>${p.idea ? `<div class="text-sm ink2 mt-0.5">💡 ${esc(p.idea)}</div>` : ''}` : ''}
      </div>`;
    }).join('') + '</div>';
  },
  presenting() {
    const s = App.state.settings, g = s.presentingGroup ? groupOf(App.state, s.presentingGroup) : null;
    if (!g) return `<div class="card text-center"><div class="muted">발표 대기 중 — 선생님이 발표 그룹을 지정하면 여기에 표시돼요.</div></div>`;
    const t = App.state.topics[g.groupId];
    return `<div class="card" style="border:2px solid ${g.color}"><div class="flex items-center gap-2"><span class="badge badge-danger"><span class="live-dot"></span> 지금 발표 중</span></div>
      <div class="text-2xl font-black mt-2" style="color:${g.color}">${esc(g.groupName)}</div>
      ${t ? `<div class="font-bold mt-1">${esc(t.title)}</div>` : ''}
      ${g.groupId === App.me.group.groupId ? '<p class="text-sm mt-2 badge-gold rounded-lg p-2">우리 그룹 발표 차례예요. 화이팅!</p>' : ''}</div>`;
  },
  submissionMeta() {
    const s = App.state.submissions[App.me.group.groupId];
    return s ? `마지막 저장: ${esc(s.updatedBy)} · ${esc(s.updatedAt.slice(5, 16))}` : '아직 제출된 자료가 없어요.';
  },
  questions() {
    const st = App.state, target = st.settings.presentingGroup;
    const list = st.questions.filter((q) => !target || q.targetGroup === target).slice(0, 12);
    if (!list.length) return `<p class="muted text-sm">아직 등록된 질문이 없어요.</p>`;
    return `<div class="grid gap-2">` + list.map((q) => `<div class="rounded-xl p-3 text-sm ${q.status === 'answered' ? 'opacity-50' : ''}" style="background:var(--surface-2);border:1px solid var(--line)">
      <div class="text-xs muted mb-0.5">${esc(groupOf(st, q.fromGroup).groupName)} → ${esc(groupOf(st, q.targetGroup).groupName)} ${q.status === 'answered' ? '· 답변 완료' : ''}</div>${esc(q.question)}</div>`).join('') + '</div>';
  }
};
function updateLive() {
  $$('[data-live]').forEach((el) => { const f = LIVE[el.dataset.live]; if (f) el.innerHTML = f(el); });
}

/* ---------- 1차시 ---------- */
function tabS1() {
  const st = App.state, s = st.settings, open = s.voteOpen === 'Y';
  const dils = st.dilemmas.filter((d) => d.session === 1);
  return `
  <section class="card mb-4">
    <div class="eyebrow">BRIEFING · 고담시 상황 보고</div>
    <h2>범죄와 공포의 도시, 고담</h2>
    <p class="ink2 mt-2">부패와 범죄가 뒤엉킨 도시 고담. 경찰과 법원은 시민의 신뢰를 잃었고, 그 틈에 <b>법 밖에서 정의를 행하는 가면의 자경단원</b>이 나타났습니다.
      혼돈을 즐기는 테러리스트는 시민에게 끊임없이 잔혹한 선택을 강요합니다. 오늘 여러분은 이 도시의 시민·경찰·행정가·언론인·법조인·과학자가 되어 <b>“무엇이 옳은가”</b>를 결정합니다.</p>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-sm">
      ${[['🦇', '배트맨', '법 밖의 자경단원'], ['🃏', '조커', '혼돈을 퍼뜨리는 테러리스트'], ['⚖️', '하비 덴트', '시민의 희망이던 검사'], ['🚔', '고든 경감', '자경단과 손잡은 경찰']]
        .map(([i, n, d]) => `<div class="rounded-xl p-3" style="background:var(--surface-2);border:1px solid var(--line)"><div class="text-xl">${i}</div><b>${n}</b><div class="muted text-xs">${d}</div></div>`).join('')}
    </div>
  </section>

  <div class="flex items-center justify-between mb-2 px-1">
    <h2 class="text-lg font-extrabold">딜레마 투표</h2>
    ${open ? '<span class="badge badge-ok"><span class="live-dot" style="background:#16A34A"></span> 투표 진행 중</span>' : '<span class="badge badge-danger">투표 마감</span>'}
  </div>
  ${dils.map((d, idx) => {
    const mine = App.me.votes[d.dilemmaId], cur = App.picks[d.dilemmaId] ?? mine?.choice;
    const active = s.activeDilemmaId === d.dilemmaId;
    return `<article class="card mb-4" style="${active ? 'border:2px solid var(--gold)' : ''}">
      <div class="flex items-center gap-2 flex-wrap"><span class="badge">딜레마 ${idx + 1}</span>${active ? '<span class="badge badge-gold">📽 지금 함께 보는 중</span>' : ''}${mine ? '<span class="badge badge-ok">✓ 투표 완료</span>' : ''}</div>
      <h3 class="text-lg font-extrabold mt-2">${esc(d.title)}</h3>
      <p class="ink2 mt-1">${esc(d.scenario)}</p>
      <div class="grid gap-2 mt-4">${d.options.map((o, i) => `
        <button class="opt ${cur === LETTERS[i] ? 'sel' : ''}" data-act="pick" data-d="${d.dilemmaId}" data-c="${LETTERS[i]}" ${open ? '' : 'disabled'}>
          <span class="L" style="background:${OPT_COLORS[i]}">${LETTERS[i]}</span><span>${esc(o)}</span></button>`).join('')}
      </div>
      <label class="label mt-3" for="reason-${d.dilemmaId}">선택 이유 <span class="muted font-normal">(한 줄이라도 좋아요)</span></label>
      <textarea id="reason-${d.dilemmaId}" class="textarea" style="min-height:70px" placeholder="왜 이렇게 선택했나요?" ${open ? '' : 'disabled'}>${esc(mine?.reason || '')}</textarea>
      <button class="btn btn-gold btn-block mt-3" data-act="vote" data-d="${d.dilemmaId}" ${open ? '' : 'disabled'}>${mine ? '선택 변경하기' : '투표하기'}</button>
      <div class="divider"></div>
      <div data-live="voteResult" data-d="${d.dilemmaId}"></div>
    </article>`;
  }).join('')}

  <section class="card" style="background:var(--sky-soft);border-color:transparent">
    <div class="eyebrow" style="color:#0369A1">NEXT · 다음 차시 안내</div>
    <p class="mt-1 font-semibold">${esc(s.notice || '')}</p>
  </section>`;
}

/* ---------- 2차시 ---------- */
function tabS2() {
  const st = App.state, m = App.me, gid = m.group.groupId;
  const t = st.topics[gid] || {};
  const firstD = st.dilemmas[0];
  const pvD = App.pvD || (firstD ? firstD.dilemmaId : '');
  const myP = m.perspectives[pvD] || {};
  const plan = m.plan || {};
  return `
  <section class="card mb-4">
    <div class="eyebrow">STEP 1 · 결과 분석</div>
    <h2>1차시 투표 결과 돌아보기</h2>
    <p class="muted text-sm">전체 결과와 <b>나와 같은 역할</b> 친구들의 선택을 비교해 보세요. 왜 차이가 날까요?</p>
    <div data-live="analysis" class="mt-2"></div>
  </section>

  <section class="card mb-4">
    <div class="eyebrow">STEP 2 · 역할별 관점 탐구</div>
    <h2>${m.role.icon} ${esc(m.role.roleName)}의 눈으로 다시 보기</h2>
    <div class="rounded-xl p-3 mt-2 text-sm" style="background:var(--gold-soft);color:var(--gold-ink)"><b>생각 질문</b> — ${esc(m.role.prompt)}</div>
    <div class="grid sm:grid-cols-2 gap-3 mt-3">
      <div><label class="label" for="pv-d">딜레마</label>
        <select id="pv-d" class="select">${st.dilemmas.map((d) => `<option value="${d.dilemmaId}" ${d.dilemmaId === pvD ? 'selected' : ''}>${esc(d.title)}${m.perspectives[d.dilemmaId] ? ' ✓' : ''}</option>`).join('')}</select></div>
      <div><label class="label" for="pv-s">나의 입장</label><select id="pv-s" class="select">${stanceOptions(pvD, myP.stance)}</select></div>
    </div>
    <label class="label mt-3" for="pv-arg">역할 관점의 논리 (주장 → 근거 → 예상 반론)</label>
    <textarea id="pv-arg" class="textarea" placeholder="나는 ${esc(m.role.roleName)}로서 … 라고 생각한다. 왜냐하면 …">${esc(myP.argument || '')}</textarea>
    <button class="btn btn-navy btn-block mt-3" data-act="perspective">관점 저장하기</button>
  </section>

  <section class="card mb-4">
    <div class="eyebrow">STEP 3 · 그룹 공통 주제</div>
    <h2>‘고담시 문제 해결 대책’ 주제 선정</h2>
    <p class="muted text-sm">그룹원과 논의해 딜레마 1개를 고르고, 해결할 문제를 정의하세요. 그룹원 누구나 수정할 수 있어요.</p>
    <div data-live="groupTopic" class="mt-3"></div>
    <div class="divider"></div>
    <label class="label" for="gt-d">공통 딜레마</label>
    <select id="gt-d" class="select">${st.dilemmas.filter((d) => d.isTopic).map((d) => `<option value="${d.dilemmaId}" ${t.dilemmaId === d.dilemmaId ? 'selected' : ''}>${esc(d.title)}</option>`).join('')}</select>
    <label class="label mt-3" for="gt-title">탐구 주제 (제목)</label>
    <input id="gt-title" class="input" placeholder="예: 자경단 없이도 안전한 고담 만들기" value="${esc(t.title || '')}">
    <label class="label mt-3" for="gt-problem">고담시가 겪는 문제 정의 (현실 사회와 연결)</label>
    <textarea id="gt-problem" class="textarea" placeholder="고담시의 어떤 문제를, 왜 해결해야 하나요? 현실 사회의 비슷한 사례는?">${esc(t.problem || '')}</textarea>
    <button class="btn btn-navy btn-block mt-3" data-act="groupTopic">그룹 주제 저장하기</button>
  </section>

  <section class="card mb-4">
    <div class="eyebrow">STEP 4 · 진로 연계</div>
    <h2>나의 진로·관심사로 해결책 더하기</h2>
    <p class="muted text-sm">추천 분야: ${esc(m.role.careerHint)}</p>
    <div class="grid sm:grid-cols-2 gap-3 mt-3">
      <div><label class="label" for="mp-career">진로/관심 분야</label>
        <select id="mp-career" class="select"><option value="">선택하세요</option>${CAREERS.map((c) => `<option ${plan.career === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div><label class="label" for="mp-task">그룹 내 담당 역할</label><input id="mp-task" class="input" placeholder="예: 자료 조사, 정책 설계, 발표" value="${esc(plan.task || '')}"></div>
    </div>
    <label class="label mt-3" for="mp-idea">내 분야로 제안하는 해결 아이디어</label>
    <textarea id="mp-idea" class="textarea" placeholder="예: (공학) 사생활을 지키는 익명화 CCTV 기술을 도입한다">${esc(plan.idea || '')}</textarea>
    <button class="btn btn-navy btn-block mt-3" data-act="memberPlan">진로 연계 계획 저장하기</button>
  </section>

  <section class="card">
    <div class="flex items-center justify-between"><h2>우리 그룹 계획 현황</h2><span class="badge" style="background:${m.group.color}22;color:${m.group.color};border-color:transparent">${esc(m.group.groupName)}</span></div>
    <div data-live="groupPlans" class="mt-3"></div>
  </section>`;
}
function stanceOptions(dilemmaId, current) {
  const d = dilemmaOf(App.state, dilemmaId); if (!d) return '';
  const opts = d.options.map((o, i) => `${LETTERS[i]}. ${o.split(' — ')[0]}`).concat(['기타 (새로운 대안)']);
  return opts.map((o) => `<option ${current === o ? 'selected' : ''}>${esc(o)}</option>`).join('');
}

/* ---------- 3차시 ---------- */
function tabS3() {
  const st = App.state, s = st.settings, m = App.me, gid = m.group.groupId;
  const sub = st.submissions[gid] || {};
  const others = st.groups.filter((g) => g.groupId !== gid);
  const subOpen = s.submitOpen === 'Y', evOpen = s.evalOpen === 'Y';
  const target = App.evalTarget && App.evalTarget !== gid ? App.evalTarget : (s.presentingGroup && s.presentingGroup !== gid ? s.presentingGroup : others[0]?.groupId);
  App.evalTarget = target;
  const prev = m.evals[target];
  if (prev && !App.scores[target]) App.scores[target] = { logic: prev.logic, creativity: prev.creativity, feasibility: prev.feasibility, delivery: prev.delivery };
  const sc = App.scores[target] || {};
  return `
  <div data-live="presenting" class="mb-4"></div>

  <section class="card mb-4">
    <div class="eyebrow">STEP 1 · 자료 제출</div>
    <h2>우리 그룹 발표 자료 등록</h2>
    <p class="muted text-sm" data-live="submissionMeta"></p>
    <label class="label mt-3" for="sb-summary">탐구 요약</label>
    <textarea id="sb-summary" class="textarea" placeholder="선택한 딜레마, 역할별 관점, 핵심 논점" ${subOpen ? '' : 'disabled'}>${esc(sub.summary || '')}</textarea>
    <label class="label mt-3" for="sb-solution">고담시 문제 해결 대책</label>
    <textarea id="sb-solution" class="textarea" placeholder="구성원의 진로·관심사를 살린 구체적 해결책" ${subOpen ? '' : 'disabled'}>${esc(sub.solution || '')}</textarea>
    <label class="label mt-3" for="sb-link">발표 자료 링크 (Google Slides, Canva 등 · 공유 설정 ‘링크가 있는 모든 사용자’)</label>
    <input id="sb-link" class="input" inputmode="url" placeholder="https://" value="${esc(sub.slideLink || '')}" ${subOpen ? '' : 'disabled'}>
    ${sub.slideLink ? `<a class="text-sm font-bold inline-block mt-2" href="${esc(sub.slideLink)}" target="_blank" rel="noopener">↗ 제출한 자료 열기</a>` : ''}
    <button class="btn btn-navy btn-block mt-3" data-act="submission" ${subOpen ? '' : 'disabled'}>${subOpen ? '그룹 자료 저장하기' : '제출 마감'}</button>
  </section>

  <section class="card mb-4">
    <div class="eyebrow">STEP 2 · 실시간 질문</div>
    <h2>발표 그룹에 질문하기</h2>
    <div class="grid sm:grid-cols-3 gap-3 mt-3">
      <div><label class="label" for="q-target">질문할 그룹</label>
        <select id="q-target" class="select">${others.map((g) => `<option value="${g.groupId}" ${s.presentingGroup === g.groupId ? 'selected' : ''}>${esc(g.groupName)}</option>`).join('')}</select></div>
      <div class="sm:col-span-2"><label class="label" for="q-text">질문</label><input id="q-text" class="input" maxlength="300" placeholder="궁금한 점이나 반론을 적어 주세요"></div>
    </div>
    <button class="btn btn-gold btn-block mt-3" data-act="question">질문 보내기</button>
    <div class="divider"></div>
    <div data-live="questions"></div>
  </section>

  <section class="card">
    <div class="flex items-center justify-between gap-2"><div><div class="eyebrow">STEP 3 · 상호 평가</div><h2>다른 그룹 평가하기</h2></div>
      ${evOpen ? '<span class="badge badge-ok">평가 진행 중</span>' : '<span class="badge">평가 대기</span>'}</div>
    ${evOpen ? `
    <div class="flex flex-wrap gap-2 mt-3">${others.map((g) => `<button class="btn btn-sm ${g.groupId === target ? 'btn-navy' : 'btn-ghost'}" data-act="evalTarget" data-g="${g.groupId}">${m.evals[g.groupId] ? '✓ ' : ''}${esc(g.groupName)}</button>`).join('')}</div>
    <div class="grid gap-4 mt-4">${CRITERIA.map(([k, n, d]) => `<div>
      <div class="flex items-baseline justify-between"><b>${n}</b><span class="muted text-xs">${d}</span></div>
      <div class="score mt-1">${[1, 2, 3, 4, 5].map((v) => `<button data-act="score" data-k="${k}" data-v="${v}" class="${sc[k] === v ? 'sel' : ''}">${v}</button>`).join('')}</div></div>`).join('')}</div>
    <label class="label mt-4" for="ev-comment">한 줄 피드백</label>
    <input id="ev-comment" class="input" maxlength="300" placeholder="좋았던 점 / 보완할 점" value="${esc(prev?.comment || '')}">
    <button class="btn btn-gold btn-block mt-3" data-act="evaluate">${prev ? '평가 수정하기' : '평가 제출하기'}</button>`
    : '<p class="muted text-sm mt-2">선생님이 평가를 열면 여기에서 다른 그룹을 평가할 수 있어요.</p>'}
  </section>`;
}

/* ---------- 이벤트 (위임) ---------- */
function bindContent() {
  const root = $('#content');
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'pick') {
      App.picks[b.dataset.d] = b.dataset.c;
      $$(`[data-act="pick"][data-d="${b.dataset.d}"]`).forEach((x) => x.classList.toggle('sel', x === b));
      return;
    }
    if (act === 'score') {
      const t = App.evalTarget; App.scores[t] = App.scores[t] || {}; App.scores[t][b.dataset.k] = Number(b.dataset.v);
      $$(`[data-act="score"][data-k="${b.dataset.k}"]`).forEach((x) => x.classList.toggle('sel', x === b));
      return;
    }
    if (act === 'evalTarget') { App.evalTarget = b.dataset.g; return renderTab(); }
    await submitAction(act, b);
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'pv-d') {
      App.pvD = e.target.value;
      const p = App.me.perspectives[e.target.value] || {};
      $('#pv-s').innerHTML = stanceOptions(e.target.value, p.stance);
      $('#pv-arg').value = p.argument || '';
    }
  });
}

async function submitAction(act, btn) {
  const c = App.cred, v = (id) => ($('#' + id)?.value || '').trim();
  let payload, okMsg;
  switch (act) {
    case 'vote': {
      const d = btn.dataset.d, choice = App.picks[d] || App.me.votes[d]?.choice;
      if (!choice) return toast('선택지를 먼저 골라 주세요.', 'err');
      payload = { dilemmaId: d, choice, reason: v('reason-' + d) }; okMsg = '투표가 반영되었어요!'; break;
    }
    case 'perspective': payload = { dilemmaId: v('pv-d'), stance: v('pv-s'), argument: v('pv-arg') }; okMsg = '관점을 저장했어요.'; break;
    case 'groupTopic': payload = { dilemmaId: v('gt-d'), title: v('gt-title'), problem: v('gt-problem') }; okMsg = '그룹 주제를 저장했어요.'; break;
    case 'memberPlan': payload = { career: v('mp-career'), task: v('mp-task'), idea: v('mp-idea') }; okMsg = '진로 연계 계획을 저장했어요.'; break;
    case 'submission': payload = { summary: v('sb-summary'), solution: v('sb-solution'), slideLink: v('sb-link') }; okMsg = '그룹 자료를 저장했어요.'; break;
    case 'question': payload = { targetGroup: v('q-target'), question: v('q-text') }; okMsg = '질문을 보냈어요!'; break;
    case 'evaluate': {
      const t = App.evalTarget, sc = App.scores[t] || {};
      if (CRITERIA.some(([k]) => !sc[k])) return toast('모든 항목에 점수를 매겨 주세요.', 'err');
      payload = { targetGroup: t, ...sc, comment: v('ev-comment') }; okMsg = '평가를 제출했어요.'; break;
    }
    default: return;
  }
  setBusy(btn, true);
  try {
    await Api.post(act, { ...c, ...payload });
    toast(okMsg, 'ok');
    if (act === 'question') $('#q-text').value = '';
    await Promise.all([refreshMe(), refreshState()]);
    if (act === 'vote') { delete App.picks[payload.dilemmaId]; }
    if (act === 'vote' || act === 'evaluate' || act === 'perspective') renderTab(true); else updateLive();
  } catch (e) { toast(e.message, 'err'); }
  finally { setBusy(btn, false); }
}
