/** 교사용: 학생별 활동 기록 모아보기 (records.html) — 생활기록부 작성 참고 */
const R = { pin: sessionStorage.getItem('gotham_pin') || '', list: [], group: '', q: '', onlyDone: false };

(function boot() {
  $('#logo').innerHTML = CITY_ICON;
  if (Api.DEMO) $('#demoBadge').classList.remove('hidden');
  $('#pinOk').onclick = () => login($('#pinIn').value.trim());
  $('#pinIn').onkeydown = (e) => { if (e.key === 'Enter') login($('#pinIn').value.trim()); };
  if (R.pin) login(R.pin, true);
})();

async function login(pin, silent) {
  try {
    const res = await Api.post('adminRecords', { pin });
    R.pin = pin; sessionStorage.setItem('gotham_pin', pin);
    R.list = res.records || [];
    renderShell(); render();
  } catch (e) { if (!silent) toast(e.message, 'err'); sessionStorage.removeItem('gotham_pin'); }
}
async function reload() {
  try { R.list = (await Api.post('adminRecords', { pin: R.pin })).records || []; render(); toast('최신 기록을 불러왔어요.'); }
  catch (e) { toast(e.message, 'err'); }
}

function renderShell() {
  const groups = [...new Map(R.list.filter((r) => r.groupId).map((r) => [r.groupId, r.groupName])).entries()];
  $('#app').innerHTML = `
  <section id="toolbar" class="card mb-4">
    <div class="flex flex-wrap items-end gap-3">
      <div><label class="label" for="fGroup">조</label>
        <select id="fGroup" class="select" style="min-width:180px"><option value="">전체</option>${groups.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select></div>
      <div class="flex-1 min-w-[160px]"><label class="label" for="fQ">이름·학번 검색</label><input id="fQ" class="input" placeholder="예: 20101 또는 김민준"></div>
      <label class="flex items-center gap-2 font-bold text-sm pb-3"><input type="checkbox" id="fDone"> 기록 작성한 학생만</label>
      <div class="flex gap-2 flex-wrap pb-0.5">
        <button class="btn btn-ghost" id="bReload">↻ 새로고침</button>
        <button class="btn btn-ghost" id="bCsv">⬇ CSV (엑셀)</button>
        <button class="btn btn-navy" id="bPrint">🖨 인쇄 / PDF</button>
      </div>
    </div>
    <p class="muted text-sm mt-3" id="stat"></p>
  </section>
  <div id="list" class="grid gap-4"></div>`;
  $('#fGroup').onchange = (e) => { R.group = e.target.value; render(); };
  $('#fQ').oninput = (e) => { R.q = e.target.value.trim(); render(); };
  $('#fDone').onchange = (e) => { R.onlyDone = e.target.checked; render(); };
  $('#bReload').onclick = reload;
  $('#bCsv').onclick = downloadCsv;
  $('#bPrint').onclick = () => window.print();
  $('#list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]'); if (!b) return;
    const r = R.list.find((x) => x.studentId === b.dataset.copy);
    copyText(plainText(r)).then(() => toast(`${r.name} 학생 기록을 복사했어요.`));
  });
}

function filtered() {
  return R.list.filter((r) => (!R.group || r.groupId === R.group)
    && (!R.q || r.name.includes(R.q) || r.studentId.includes(R.q))
    && (!R.onlyDone || r.reflection));
}

function render() {
  const rows = filtered();
  const registered = R.list.filter((r) => r.cardId).length, done = R.list.filter((r) => r.reflection).length;
  $('#stat').textContent = `등록 ${registered}명 · 개인 활동 기록 작성 ${done}명 / 전체 ${R.list.length}명 · 현재 ${rows.length}명 표시`;
  $('#list').innerHTML = rows.length ? rows.map(cardHTML).join('') : '<div class="card muted text-center">조건에 맞는 학생이 없어요.</div>';
}

const T = (s) => (s ? esc(s) : '<span class="empty">작성 없음</span>');
function compsHTML(text) {
  const lines = String(text || '').split('\n').filter(Boolean);
  if (!lines.length) return '<span class="empty">선택 없음</span>';
  return '<ul class="grid gap-1">' + lines.map((l) => {
    const m = l.match(/^\[(.+?)\]\s*(.*)$/);
    return m ? `<li><span class="badge badge-sky">${esc(m[1])}</span> ${m[2] ? esc(m[2]) : '<span class="empty">근거 미작성</span>'}</li>` : `<li>${esc(l)}</li>`;
  }).join('') + '</ul>';
}

function cardHTML(r) {
  const f = r.reflection;
  return `<article class="card rec">
    <div class="flex items-start gap-3 flex-wrap">
      <div class="text-3xl">${r.icon || '👤'}</div>
      <div class="flex-1 min-w-0">
        <div class="text-xl font-extrabold">${esc(r.name)} <span class="muted text-base font-semibold">${esc(r.studentId)} · ${esc(r.gender)}</span></div>
        <div class="text-sm ink2">${r.cardId ? `${esc(r.roleName)} · ${esc(r.groupName)} (${esc(r.cardId)})` : '<span class="empty">카드 미등록</span>'}</div>
      </div>
      ${f ? `<span class="badge badge-ok">기록 작성 ${esc(f.updatedAt.slice(5, 16))}</span>` : '<span class="badge badge-danger">기록 미작성</span>'}
      <button class="btn btn-sm btn-ghost no-print" data-copy="${esc(r.studentId)}">📋 텍스트 복사</button>
    </div>

    <div class="grid md:grid-cols-2 gap-x-8 rec-grid">
      <div>
        <div class="eyebrow mt-4" style="color:var(--navy)">학생 자기 성찰 (직접 작성)</div>
        <h4>탐구 동기</h4><p>${T(f && f.motivation)}</p>
        <h4>세부 활동 내용</h4><p>${T(f && f.process)}</p>
        <h4>알게 된 점 · 생각의 변화</h4><p>${T(f && f.discovery)}</p>
        <h4>스스로 발견한 역량</h4>${compsHTML(f && f.competencies)}
        <h4>활동 전체 소감</h4><p>${T(f && f.reflection)}</p>
        <h4>후속 탐구 계획</h4><p>${T(f && f.nextStep)}</p>
      </div>
      <div>
        <div class="eyebrow mt-4" style="color:var(--navy)">활동 데이터 (앱 자동 기록)</div>
        <h4>1차시 딜레마 투표</h4>${r.votes.length ? `<ul class="list-disc pl-5">${r.votes.map((v) => `<li><b>${esc(v.dilemma)}</b> → ${esc(v.choice)}${v.reason ? ` — ${esc(v.reason)}` : ''}</li>`).join('')}</ul>` : '<p class="empty">기록 없음</p>'}
        <h4>역할 관점 논리</h4>${r.perspectives.length ? r.perspectives.map((p) => `<div class="self mb-1"><b>${esc(p.dilemma)}</b> · ${esc(p.stance)}<p>${esc(p.argument)}</p></div>`).join('') : '<p class="empty">기록 없음</p>'}
        <h4>추천한 탐구 주제</h4><p>${r.topicPick ? `${esc(r.topicPick.title)}${r.topicPick.reason ? ` — ${esc(r.topicPick.reason)}` : ''}` : '<span class="empty">기록 없음</span>'}</p>
        <h4>조 공동 주제</h4>${r.groupTopic ? `<p><b>${esc(r.groupTopic.title)}</b>${r.groupTopic.problem ? `\n탐구 질문: ${esc(r.groupTopic.problem)}` : ''}${r.groupTopic.method ? `\n계획: ${esc(r.groupTopic.method)}` : ''}</p>` : '<p class="empty">미확정</p>'}
        <h4>심화 탐구 분담</h4><p>${r.plan ? `[${esc(r.plan.career)}] ${esc(r.plan.task)}${r.plan.idea ? `\n${esc(r.plan.idea)}` : ''}` : '<span class="empty">기록 없음</span>'}</p>
        <h4>조 발표 자료</h4><p>${r.submission ? `${esc(r.submission.summary)}${r.submission.solution ? `\n대책: ${esc(r.submission.solution)}` : ''}` : '<span class="empty">미제출</span>'}</p>
        <h4>질문 · 상호평가 참여</h4><p>질문 ${r.questions.length}개${r.questions.length ? ` (${r.questions.map((q) => `${esc(q.target)}: ${esc(q.question)}`).join(' / ')})` : ''} · 다른 조 평가 ${r.evalsGiven}회</p>
        <h4>우리 조가 받은 동료 평가</h4><p>${r.peer ? `${r.peer.n}명 평가 · 논리 ${r.peer.logic} · 창의 ${r.peer.creativity} · 실현 ${r.peer.feasibility} · 전달 ${r.peer.delivery}${r.peer.comments.length ? `\n“${r.peer.comments.slice(0, 4).map(esc).join('” “')}”` : ''}` : '<span class="empty">평가 없음</span>'}</p>
      </div>
    </div>
  </article>`;
}

/* 생기부 작성용 평문 (복사) */
function plainText(r) {
  const f = r.reflection || {};
  const L = [];
  L.push(`■ ${r.name} (${r.studentId}) — ${r.roleName || '-'} / ${r.groupName || '-'}`);
  L.push(`[탐구 동기] ${f.motivation || '-'}`);
  L.push(`[세부 활동] ${f.process || '-'}`);
  L.push(`[알게 된 점·변화] ${f.discovery || '-'}`);
  L.push(`[역량] ${(f.competencies || '-').replace(/\n/g, ' / ')}`);
  L.push(`[소감] ${f.reflection || '-'}`);
  L.push(`[후속 계획] ${f.nextStep || '-'}`);
  L.push(`[투표] ${r.votes.map((v) => `${v.dilemma}: ${v.choice}${v.reason ? ` (${v.reason})` : ''}`).join(' / ') || '-'}`);
  L.push(`[역할 관점] ${r.perspectives.map((p) => `${p.dilemma}: ${p.stance} — ${p.argument}`).join(' / ') || '-'}`);
  L.push(`[조 공동 주제] ${r.groupTopic ? `${r.groupTopic.title} (${r.groupTopic.problem})` : '-'}`);
  L.push(`[심화 탐구 분담] ${r.plan ? `[${r.plan.career}] ${r.plan.task} — ${r.plan.idea}` : '-'}`);
  L.push(`[참여] 질문 ${r.questions.length}개, 상호평가 ${r.evalsGiven}회`);
  return L.join('\n');
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); }
}

function downloadCsv() {
  const head = ['학번', '이름', '성별', '조', '역할', '카드', '탐구 동기', '세부 활동 내용', '알게 된 점·생각의 변화', '역량', '활동 소감', '후속 탐구 계획',
    '딜레마 투표', '역할 관점 논리', '추천 주제', '조 공동 주제', '탐구 질문', '심화 탐구 분담(진로)', '세부 탐구 질문', '탐구 방법·아이디어', '질문 수', '상호평가 수', '기록 저장 시각'];
  const rows = filtered().map((r) => {
    const f = r.reflection || {};
    return [r.studentId, r.name, r.gender, r.groupName, r.roleName, r.cardId, f.motivation, f.process, f.discovery, (f.competencies || '').replace(/\n/g, ' / '), f.reflection, f.nextStep,
      r.votes.map((v) => `${v.dilemma}: ${v.choice}${v.reason ? ` (${v.reason})` : ''}`).join(' / '),
      r.perspectives.map((p) => `${p.dilemma}: ${p.stance} — ${p.argument}`).join(' / '),
      r.topicPick ? r.topicPick.title : '', r.groupTopic ? r.groupTopic.title : '', r.groupTopic ? r.groupTopic.problem : '',
      r.plan ? r.plan.career : '', r.plan ? r.plan.task : '', r.plan ? r.plan.idea : '', r.questions.length, r.evalsGiven, f.updatedAt || ''];
  });
  const csv = [head, ...rows].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `고담캠프_활동기록_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
