/** 빔프로젝터용 실시간 현황판 (dashboard.html) */
const CFG = window.GOTHAM_CONFIG || {};
const VIEWS = [
  { id: 'groups', label: '그룹 배치' },
  { id: 'vote', label: '딜레마 투표' },
  { id: 'topics', label: '그룹 주제' },
  { id: 'present', label: '발표·평가' }
];
const D = { state: null, view: 'groups', pickD: null, pin: sessionStorage.getItem('gotham_pin') || '' };

(async function boot() {
  $('#logo').innerHTML = CITY_ICON;
  if (Api.DEMO) $('#demoBadge').classList.remove('hidden');
  const q = new URLSearchParams(location.search);
  if (q.get('view')) { D.view = q.get('view'); $('#autoView').checked = false; }
  $('#themeBtn').onclick = () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t; try { localStorage.setItem('gotham_dash_theme', t); } catch (e) {}
  };
  $('#fsBtn').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  $('#adminBtn').onclick = openAdmin;
  $('#autoView').onchange = () => tick();
  renderViewTabs();
  setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); }, 1000);
  await tick();
  setInterval(tick, CFG.POLL_DASHBOARD_MS || 3000);
})();

async function tick() {
  try { D.state = await Api.get('state'); }
  catch (e) { if (!D.state) $('#view').innerHTML = `<div class="card text-center text-xl">서버 연결 실패: ${esc(e.message)}</div>`; return; }
  const s = D.state.settings;
  if ($('#autoView').checked && VIEWS.some((v) => v.id === s.dashboardView) && D.view !== s.dashboardView) { D.view = s.dashboardView; D.pickD = null; }
  $('#campTitle').textContent = s.campTitle || '고담시의 선택';
  $('#sessionLabel').textContent = `${s.currentSession}차시 진행 중 · 실시간 현황판`;
  $('#regCount').textContent = `${D.state.registeredCount}/${D.state.roles.length}`;
  renderViewTabs(); render();
}

function renderViewTabs() {
  $('#viewTabs').innerHTML = VIEWS.map((v) => `<button class="vtab ${D.view === v.id ? 'active' : ''}" data-v="${v.id}">${v.label}</button>`).join('');
  $$('#viewTabs .vtab').forEach((b) => b.onclick = () => { D.view = b.dataset.v; $('#autoView').checked = false; renderViewTabs(); render(); });
}

function render() {
  if (!D.state) return;
  $('#view').innerHTML = ({ groups: vGroups, vote: vVote, topics: vTopics, present: vPresent }[D.view] || vGroups)();
  $$('[data-pickd]').forEach((b) => b.onclick = () => { D.pickD = b.dataset.pickd; render(); });
  $$('[data-qid]').forEach((b) => b.onclick = () => markQuestion(b.dataset.qid, b.dataset.status));
}

/* ---------- 그룹 배치 ---------- */
function vGroups() {
  const st = D.state, total = st.roles.length, reg = st.registeredCount;
  return `
  <div class="flex items-end justify-between gap-4 flex-wrap mb-4">
    <div><div class="eyebrow">SEATING · 실시간 그룹 배치</div><h1 class="title">신분증 카드의 자리로 이동하세요</h1></div>
    <div class="min-w-[280px] flex-1 max-w-md">
      <div class="flex justify-between font-bold text-lg mb-1"><span>등록 현황</span><span>${reg} / ${total}명 (${pct(reg, total)}%)</span></div>
      <div class="bar-track" style="height:16px"><div class="bar-fill" style="width:${pct(reg, total)}%;background:var(--gold)"></div></div>
    </div>
  </div>
  <div class="grid gap-4" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
    ${st.groups.map((g) => {
      const seats = st.roles.filter((r) => r.groupId === g.groupId).sort((a, b) => a.seat - b.seat);
      const n = seats.filter((r) => r.taken).length;
      return `<section class="card group-col" style="--gc:${g.color}">
        <div class="flex items-baseline justify-between"><div class="text-3xl font-black" style="color:${g.color}">${esc(g.groupName)}</div><div class="text-xl font-extrabold">${n}/${seats.length}</div></div>
        <div class="muted font-semibold mb-3">${esc(g.table)}</div>
        <div class="grid gap-2">${seats.map((r) => `
          <div class="seat-row ${r.taken ? '' : 'empty'}"><div class="n">${r.seat}</div>
            <div class="min-w-0"><div class="who">${r.taken ? esc(r.studentName) : '<span class="muted">대기 중</span>'}</div>
            <div class="role">${r.icon} ${esc(r.roleName)} · ${esc(r.cardId)}</div></div></div>`).join('')}</div>
      </section>`;
    }).join('')}
  </div>`;
}

/* ---------- 딜레마 투표 ---------- */
function vVote() {
  const st = D.state, s = st.settings;
  const id = D.pickD || s.activeDilemmaId || st.dilemmas[0]?.dilemmaId;
  const d = dilemmaOf(st, id); if (!d) return '<div class="card">딜레마가 없습니다.</div>';
  const v = st.votes[d.dilemmaId];
  const reasons = v.reasons.slice(-6).reverse();
  return `
  <div class="flex gap-2 flex-wrap mb-4">${st.dilemmas.map((x) => `<button class="btn btn-sm ${x.dilemmaId === d.dilemmaId ? 'btn-gold' : 'btn-ghost'}" data-pickd="${x.dilemmaId}">${x.session}차시 · ${esc(x.title)}</button>`).join('')}</div>
  <div class="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
    <section class="card" style="padding:28px">
      <div class="flex items-center gap-3 flex-wrap">
        ${s.voteOpen === 'Y' ? '<span class="badge badge-danger" style="font-size:1rem"><span class="live-dot"></span> LIVE 투표 중</span>' : '<span class="badge" style="font-size:1rem">투표 마감</span>'}
        <span class="badge" style="font-size:1rem">참여 ${v.total} / ${st.registeredCount}명</span>
      </div>
      <h1 class="title mt-3">${esc(d.title)}</h1>
      <p class="scenario mt-2">${esc(d.scenario)}</p>
      <div class="mt-6">${barsHTML(d, v, { big: true })}</div>
    </section>
    <div class="grid gap-5 content-start">
      <section class="card">
        <h2 class="text-xl">역할별 선택 분포</h2>
        <div class="grid gap-3 mt-3">${st.roleTypes.map((rt) => {
          const c = v.byRole[rt.roleKey] || [], t = c.reduce((a, b) => a + b, 0);
          return `<div><div class="flex justify-between font-bold text-lg"><span>${rt.icon} ${esc(rt.roleName)}</span><span class="muted">${t}명</span></div>${stackHTML(c)}</div>`;
        }).join('')}</div>
        <div class="flex flex-wrap gap-3 mt-3 text-sm font-bold">${d.options.map((o, i) => `<span class="flex items-center gap-1"><span class="L-dot" style="background:${OPT_COLORS[i]}">${LETTERS[i]}</span>${esc(o.split(' — ')[0])}</span>`).join('')}</div>
      </section>
      <section class="card">
        <h2 class="text-xl">학생들의 이유</h2>
        <div class="grid gap-2 mt-3">${reasons.length ? reasons.map((r) => `<div class="q-item" style="font-size:1.05rem"><span class="L-dot" style="background:${OPT_COLORS[LETTERS.indexOf(r.choice)]}">${r.choice}</span> ${esc(r.reason)} <span class="muted text-sm">— ${esc(roleTypeOf(st, r.roleKey).roleName)}</span></div>`).join('') : '<p class="muted">아직 작성된 이유가 없어요.</p>'}</div>
      </section>
    </div>
  </div>`;
}

/* ---------- 그룹 주제 ---------- */
function vTopics() {
  const st = D.state;
  return `
  <div class="eyebrow">SESSION 2 · 고담시 문제 해결 대책</div><h1 class="title mb-4">그룹별 탐구 주제 & 진로 연계</h1>
  <div class="grid gap-4" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
  ${st.groups.map((g) => {
    const t = st.topics[g.groupId], d = t && dilemmaOf(st, t.dilemmaId);
    const plans = st.plans.filter((p) => p.groupId === g.groupId);
    return `<section class="card group-col" style="--gc:${g.color}">
      <div class="text-2xl font-black" style="color:${g.color}">${esc(g.groupName)}</div>
      ${t ? `<div class="badge badge-gold mt-2" style="font-size:.9rem">${esc(d ? d.title : t.dilemmaId)}</div>
        <div class="text-2xl font-extrabold mt-2 leading-snug">${esc(t.title)}</div>
        ${t.problem ? `<p class="ink2 mt-1">${nl2br(t.problem)}</p>` : ''}`
      : '<div class="muted text-xl mt-3">주제 선정 중…</div>'}
      <div class="divider"></div>
      <div class="grid gap-2">${plans.length ? plans.map((p) => `<div class="flex items-center gap-2 text-lg"><span>${p.icon}</span><b>${esc(p.name)}</b><span class="badge badge-sky">${esc(p.career)}</span><span class="muted text-base truncate">${esc(p.task)}</span></div>`).join('') : '<span class="muted">구성원 계획 작성 전</span>'}</div>
    </section>`;
  }).join('')}</div>`;
}

/* ---------- 발표·평가 ---------- */
function vPresent() {
  const st = D.state, s = st.settings, gid = s.presentingGroup;
  const g = gid ? groupOf(st, gid) : null;
  const t = g && st.topics[gid], sub = g && st.submissions[gid];
  const qs = st.questions.filter((q) => q.targetGroup === gid);
  const rows = st.groups.map((x) => ({ g: x, e: st.evalSummary[x.groupId] }));
  const crit = [['logic', '논리성'], ['creativity', '창의성'], ['feasibility', '실현 가능성'], ['delivery', '전달력']];
  return `
  <div class="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
    <section class="card group-col" style="--gc:${g ? g.color : 'var(--line)'};padding:28px">
      ${g ? `<span class="badge badge-danger" style="font-size:1rem"><span class="live-dot"></span> 지금 발표 중</span>
        <h1 class="title mt-3" style="color:${g.color}">${esc(g.groupName)}</h1>
        ${t ? `<div class="text-3xl font-extrabold mt-2">${esc(t.title)}</div>` : ''}
        ${sub ? `<div class="grid md:grid-cols-2 gap-4 mt-5">
          <div><div class="eyebrow">탐구 요약</div><p class="text-lg mt-1">${nl2br(sub.summary || '-')}</p></div>
          <div><div class="eyebrow">해결 대책</div><p class="text-lg mt-1">${nl2br(sub.solution || '-')}</p></div></div>
          ${sub.slideLink ? `<a class="btn btn-navy mt-5" href="${esc(sub.slideLink)}" target="_blank" rel="noopener">발표 자료 열기 ↗</a>` : ''}` : '<p class="muted text-xl mt-4">제출된 자료가 없습니다.</p>'}`
      : `<h1 class="title">발표 대기 중</h1><p class="muted text-xl mt-2">교사 제어에서 발표 그룹을 선택하세요.</p>`}
    </section>
    <section class="card">
      <div class="flex items-center justify-between"><h2 class="text-2xl">실시간 질문</h2><span class="badge" style="font-size:1rem">${qs.length}개</span></div>
      <p class="muted text-sm">${D.pin ? '질문을 누르면 답변 완료로 표시됩니다.' : ''}</p>
      <div class="grid gap-2 mt-3 max-h-[60vh] overflow-auto">${qs.length ? qs.map((q) => `<button class="q-item text-left ${q.status === 'answered' ? 'answered' : ''}" data-qid="${q.id}" data-status="${q.status === 'answered' ? 'open' : 'answered'}">
        <div class="text-sm muted font-semibold">${esc(groupOf(st, q.fromGroup).groupName)}에서</div>${esc(q.question)}</button>`).join('') : '<p class="muted text-lg">질문을 기다리는 중…</p>'}</div>
    </section>
  </div>
  <section class="card mt-5">
    <div class="flex items-center justify-between"><h2 class="text-2xl">상호 평가 현황 <span class="muted text-base">(평균, 5점 만점)</span></h2>
      ${s.evalOpen === 'Y' ? '<span class="badge badge-ok" style="font-size:1rem">평가 진행 중</span>' : '<span class="badge" style="font-size:1rem">평가 닫힘</span>'}</div>
    <div class="overflow-auto"><table class="table mt-2"><thead><tr><th style="text-align:left">그룹</th><th>참여</th>${crit.map(([, n]) => `<th>${n}</th>`).join('')}<th>합계 (20)</th></tr></thead>
    <tbody>${rows.map(({ g: x, e }) => `<tr><td style="text-align:left;color:${x.color}">${esc(x.groupName)}</td><td>${e.n}</td>${crit.map(([k]) => `<td>${e.n ? e[k].toFixed(1) : '-'}</td>`).join('')}<td style="color:var(--gold)">${e.n ? e.total.toFixed(1) : '-'}</td></tr>`).join('')}</tbody></table></div>
  </section>`;
}

async function markQuestion(id, status) {
  if (!D.pin) return;
  try { await Api.post('adminQuestion', { pin: D.pin, id, status }); tick(); } catch (e) { toast(e.message, 'err'); }
}

/* ---------- 교사 제어판 ---------- */
async function openAdmin() {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" id="adminModal"></div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  if (D.pin) { try { await Api.post('adminCheck', { pin: D.pin }); return adminPanel(bg); } catch (e) { D.pin = ''; sessionStorage.removeItem('gotham_pin'); } }
  $('#adminModal').innerHTML = `<h2 class="text-xl font-extrabold">교사 제어</h2>
    <p class="muted text-sm mt-1">Settings 시트의 adminPin 을 입력하세요.${Api.DEMO ? ' (데모 기본값: 0000)' : ''}</p>
    <input id="pinIn" type="password" inputmode="numeric" class="input mt-3" placeholder="PIN" autofocus>
    <button class="btn btn-gold btn-block mt-3" id="pinOk">확인</button>`;
  const go = async () => {
    try { await Api.post('adminCheck', { pin: $('#pinIn').value.trim() }); D.pin = $('#pinIn').value.trim(); sessionStorage.setItem('gotham_pin', D.pin); adminPanel(bg); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#pinOk').onclick = go; $('#pinIn').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

function adminPanel(bg) {
  const st = D.state, s = st.settings;
  const yn = (k, label) => `<label class="flex items-center justify-between rounded-xl p-3" style="background:var(--surface-2);border:1px solid var(--line)"><b>${label}</b><input type="checkbox" data-k="${k}" ${s[k] === 'Y' ? 'checked' : ''} style="width:22px;height:22px"></label>`;
  $('#adminModal').innerHTML = `
    <div class="flex items-center justify-between"><h2 class="text-xl font-extrabold">교사 제어</h2><button class="btn btn-sm btn-ghost" id="adClose">닫기</button></div>
    <div class="grid grid-cols-2 gap-3 mt-4">
      <div><label class="label">현재 차시</label><select class="select" data-k="currentSession">${[1, 2, 3].map((n) => `<option value="${n}" ${s.currentSession === n ? 'selected' : ''}>${n}차시</option>`).join('')}</select></div>
      <div><label class="label">대시보드 화면</label><select class="select" data-k="dashboardView">${VIEWS.map((v) => `<option value="${v.id}" ${s.dashboardView === v.id ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div class="col-span-2"><label class="label">크게 띄울 딜레마</label><select class="select" data-k="activeDilemmaId">${st.dilemmas.map((d) => `<option value="${d.dilemmaId}" ${s.activeDilemmaId === d.dilemmaId ? 'selected' : ''}>${d.session}차시 · ${esc(d.title)}</option>`).join('')}</select></div>
      <div class="col-span-2"><label class="label">발표 그룹</label><select class="select" data-k="presentingGroup"><option value="">(없음)</option>${st.groups.map((g) => `<option value="${g.groupId}" ${s.presentingGroup === g.groupId ? 'selected' : ''}>${esc(g.groupName)}</option>`).join('')}</select></div>
    </div>
    <div class="grid gap-2 mt-3">${yn('voteOpen', '투표 열기')}${yn('submitOpen', '자료 제출 열기')}${yn('evalOpen', '상호 평가 열기')}</div>
    <label class="label mt-3">학생 화면 공지 (다음 차시 안내)</label>
    <textarea class="textarea" data-k="notice" style="min-height:70px">${esc(s.notice || '')}</textarea>
    <button class="btn btn-gold btn-block mt-3" id="adSave">적용하기</button>
    <div class="divider"></div>
    <label class="label">카드 배정 해제 (잘못 등록한 학생)</label>
    <div class="flex gap-2"><input class="input" id="relId" placeholder="학번"><button class="btn btn-ghost" id="relBtn">해제</button></div>
    ${Api.DEMO ? `<div class="divider"></div><div class="label">데모 도구</div>
      <div class="flex gap-2"><button class="btn btn-ghost flex-1" id="demoFill">샘플 데이터 채우기</button><button class="btn btn-ghost flex-1" id="demoReset">데모 초기화</button></div>` : ''}`;
  $('#adClose').onclick = () => bg.remove();
  $('#adSave').onclick = async (e) => {
    const out = {};
    $$('#adminModal [data-k]').forEach((el) => { out[el.dataset.k] = el.type === 'checkbox' ? (el.checked ? 'Y' : 'N') : el.value; });
    setBusy(e.currentTarget, true, '적용 중…');
    try { await Api.post('admin', { pin: D.pin, settings: out }); toast('적용했어요.'); $('#autoView').checked = true; D.pickD = null; bg.remove(); tick(); }
    catch (err) { toast(err.message, 'err'); setBusy($('#adSave'), false); }
  };
  $('#relBtn').onclick = async () => {
    const id = $('#relId').value.trim(); if (!id) return;
    if (!confirm(id + ' 학생의 카드 배정을 해제할까요?')) return;
    try { await Api.post('adminRelease', { pin: D.pin, studentId: id }); toast('해제했어요.'); tick(); } catch (err) { toast(err.message, 'err'); }
  };
  if (Api.DEMO) {
    $('#demoFill').onclick = () => { Mock.fill(); toast('샘플 데이터를 채웠어요.'); bg.remove(); tick(); };
    $('#demoReset').onclick = () => { if (confirm('데모 데이터를 모두 지울까요?')) { Mock.reset(); toast('초기화했어요.'); bg.remove(); tick(); } };
  }
}
