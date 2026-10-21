/**
 * API 클라이언트 — GAS 웹 앱 또는 데모(로컬) 백엔드로 요청을 보냅니다.
 * GAS 는 CORS preflight(OPTIONS)를 지원하지 않으므로 POST 는 text/plain 으로 보냅니다.
 */
const Mock = (() => {
  const KEY = 'gotham_demo_db_v2';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function load() {
    try {
      const s = localStorage.getItem(KEY);
      if (s) { const db = JSON.parse(s); Object.keys(GothamCore.SCHEMA).forEach((k) => { db[k] = db[k] || []; }); return db; }
    } catch (e) {}
    const db = GothamCore.seedDb(); save(db); return db;
  }
  function save(db) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  async function get(action, p) {
    await wait(80);
    const db = load();
    if (action === 'state') return GothamCore.computeState(db);
    if (action === 'me') return GothamCore.me(db, p.studentId, p.name);
    return { ok: false, error: '알 수 없는 요청' };
  }
  async function post(action, p) {
    await wait(120);
    const db = load();
    if (action === 'register') {
      // 미리보기에서는 실제 명렬표가 없으므로 어떤 학번·이름으로도 들어갈 수 있게 허용
      const sid = String(p.studentId || '').trim(), nm = String(p.name || '').trim();
      const st = db.Students.find((x) => String(x.studentId) === sid);
      if (st && !st.cardId) st.name = nm;
      if (!st && /^\d{3,10}$/.test(sid) && nm) db.Students.push({ studentId: sid, name: nm, gender: p.gender || '', cardId: '', roleName: '', groupId: '', seat: '', registeredAt: '' });
    }
    const out = GothamCore.handle(db, action, p);
    if (out.changed.length) save(db);
    return out.result;
  }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) {} }

  /** 데모용: 24명을 랜덤 카드에 배정하고 투표·탐구·제출·질문·평가를 채웁니다. */
  function fill() {
    const db = GothamCore.seedDb();
    const cards = db.Roles.map((r) => r.cardId).sort(() => Math.random() - 0.5);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const H = (a, p) => GothamCore.handle(db, a, p);
    const set = (k, v) => { const r = db.Settings.find((x) => x.key === k); if (r) r.value = v; };
    set('evalOpen', 'Y');
    const reasons = ['결과가 더 중요하다고 생각해서', '절차가 무너지면 모두가 위험해진다', '생명은 무엇과도 바꿀 수 없다', '권력은 견제받아야 한다', '시민의 신뢰가 핵심이다'];
    const careers = ['공학·IT', '법·행정', '미디어·언론', '보건·의료', '경제·경영', '교육·사회복지'];
    db.Students.forEach((s, i) => {
      const c = { studentId: s.studentId, name: s.name };
      H('register', { ...c, gender: s.gender, cardId: cards[i] });
      const w = [[0.3, 0.5, 0.2], [0.25, 0.45, 0.3], [0.35, 0.65]];
      ['D1', 'D2', 'D3'].forEach((d, di) => {
        let r = Math.random(), k = 0; while (k < w[di].length - 1 && r > w[di][k]) { r -= w[di][k]; k++; }
        H('vote', { ...c, dilemmaId: d, choice: 'ABC'[k], reason: Math.random() > 0.4 ? pick(reasons) : '' });
      });
      H('perspective', { ...c, dilemmaId: 'D1', stance: '제한적 허용', argument: '내 역할의 관점에서 보면 시민 안전과 법치가 함께 지켜져야 한다.' });
      if (i % 3 !== 2) H('reflection', { ...c, motivation: '평소 관심 있던 진로와 연결되는 역할이라 선택했고, 영화 속 딜레마가 현실 문제와 닮아 있어 궁금했다.',
        process: '조에서 맡은 세부 탐구 질문에 대해 기사 3건과 관련 제도를 조사하고, 토론에서 근거를 들어 반대 의견을 제시했다.',
        discovery: '처음에는 결과가 중요하다고 생각했지만, 절차와 권리를 지키지 않으면 더 큰 피해가 생길 수 있다는 점을 알게 되었다.',
        competencies: '[비판적 사고력] 찬반 근거를 표로 정리해 비교했다\n[협업·리더십] 조원 의견을 모아 공동 주제를 정리했다',
        reflection: '역할의 입장에서 생각해 보니 같은 문제도 전혀 다르게 보였다. 친구들과 의견을 조율하는 과정이 어려웠지만 의미 있었다.',
        nextStep: '관련 법 제도를 더 조사해 보고 싶다.' });
      H('memberPlan', { ...c, career: pick(careers), task: pick(['자료 조사', '발표', '슬라이드 디자인', '해결책 설계']), idea: '진로와 연결한 해결 아이디어 예시입니다.' });
    });
    const groups = db.Groups.map((g) => g.groupId);
    groups.forEach((g, gi) => {
      const members = db.Students.filter((s) => s.groupId === g);
      const ideas = db.Topics.filter((t) => t.roleKey === g);
      members.forEach((s, k) => {
        const c = { studentId: s.studentId, name: s.name };
        const t = ideas[k % 2];
        H('topicPick', { ...c, topicId: k === 3 ? 'custom' : t.topicId, customTitle: '우리 학교 주변 안전 지도 만들기', reason: k % 2 ? '내 진로와 바로 연결돼요' : '' });
      });
      const s0 = members[0]; if (!s0 || gi === 5) return;   // 마지막 조는 '토론 중' 상태로 남겨둠
      const c = { studentId: s0.studentId, name: s0.name };
      H('groupTopic', { ...c, topicId: ideas[0].topicId, title: ideas[0].title, problem: ideas[0].question, method: '현실 사례 3개 조사 → 공리주의·의무론 관점 비교 → 해결책 제안' });
      H('submission', { ...c, summary: '탐구 요약 예시', solution: '해결 대책 예시', slideLink: 'https://docs.google.com/presentation/' });
    });
    db.Students.slice(0, 10).forEach((s) => H('question', { studentId: s.studentId, name: s.name, targetGroup: s.groupId === 'CIT' ? 'GPD' : 'CIT', question: pick(['예산은 어디서 마련하나요?', '시민의 사생활은 어떻게 보호하나요?', '실제 사례가 있나요?', '부작용은 없을까요?']) }));
    db.Students.forEach((s) => groups.filter((g) => g !== s.groupId).forEach((g) =>
      H('evaluate', { studentId: s.studentId, name: s.name, targetGroup: g, logic: 3 + (Math.random() * 3 | 0), creativity: 2 + (Math.random() * 4 | 0), feasibility: 2 + (Math.random() * 4 | 0), delivery: 3 + (Math.random() * 3 | 0), comment: '' })));
    set('evalOpen', 'N'); set('presentingGroup', 'CIT');
    save(db);
  }
  return { get, post, reset, fill };
})();

const Api = (() => {
  const URL = (window.GOTHAM_CONFIG && window.GOTHAM_CONFIG.API_URL || '').trim();
  // 주소 끝에 ?demo=1 을 붙이면 실제 시트와 상관없는 미리보기(데모) 모드로 열립니다.
  const FORCE_DEMO = new URLSearchParams(location.search).has('demo');
  const DEMO = !URL || FORCE_DEMO;
  if (FORCE_DEMO) {
    document.addEventListener('DOMContentLoaded', () => {
      // 같은 사이트의 다른 화면으로 이동해도 미리보기 모드가 유지되도록 링크에 ?demo=1 추가
      document.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a[href$=".html"]');
        if (a && !/^https?:/i.test(a.getAttribute('href'))) a.setAttribute('href', a.getAttribute('href') + '?demo=1');
      }, true);
      const bar = document.createElement('div');
      bar.textContent = '👀 미리보기 모드 — 이 화면에서 한 활동은 실제 시트에 저장되지 않아요 (이 브라우저에만 임시 저장)';
      bar.style.cssText = 'background:#F59E0B;color:#1F1300;font-weight:800;font-size:13px;text-align:center;padding:6px 10px';
      document.body.prepend(bar);
    });
  }
  async function unwrap(res) {
    if (!res || res.ok === false) throw new Error((res && res.error) || '요청에 실패했어요.');
    return res;
  }
  async function get(action, params = {}) {
    if (DEMO) return unwrap(await Mock.get(action, params));
    const q = new URLSearchParams({ action, ...params, _: Date.now() });
    const r = await fetch(URL + '?' + q.toString(), { method: 'GET', redirect: 'follow' });
    return unwrap(await r.json());
  }
  async function post(action, data = {}) {
    if (DEMO) return unwrap(await Mock.post(action, data));
    const r = await fetch(URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...data })
    });
    return unwrap(await r.json());
  }
  return { get, post, DEMO };
})();
