/**
 * API 클라이언트 — GAS 웹 앱 또는 데모(로컬) 백엔드로 요청을 보냅니다.
 * GAS 는 CORS preflight(OPTIONS)를 지원하지 않으므로 POST 는 text/plain 으로 보냅니다.
 */
const Mock = (() => {
  const KEY = 'gotham_demo_db_v1';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function load() {
    try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) {}
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
      H('memberPlan', { ...c, career: pick(careers), task: pick(['자료 조사', '발표', '슬라이드 디자인', '해결책 설계']), idea: '진로와 연결한 해결 아이디어 예시입니다.' });
    });
    const firstOf = (g) => db.Students.find((s) => s.groupId === g);
    const topics = { A: ['D1', '자경단 없이도 안전한 고담 만들기'], B: ['D4', '내로우스 청소년 범죄 예방 예산'], C: ['D2', '감시 기술, 어디까지 허용할까'], D: ['D5', '공적 인물의 진실과 언론의 책임'] };
    Object.keys(topics).forEach((g) => {
      const s = firstOf(g); if (!s) return;
      const c = { studentId: s.studentId, name: s.name };
      H('groupTopic', { ...c, dilemmaId: topics[g][0], title: topics[g][1], problem: '고담시가 마주한 문제를 정의한 예시 문장입니다.' });
      H('submission', { ...c, summary: '탐구 요약 예시', solution: '해결 대책 예시', slideLink: 'https://docs.google.com/presentation/' });
    });
    db.Students.slice(0, 8).forEach((s) => H('question', { studentId: s.studentId, name: s.name, targetGroup: s.groupId === 'A' ? 'B' : 'A', question: pick(['예산은 어디서 마련하나요?', '시민의 사생활은 어떻게 보호하나요?', '실제 사례가 있나요?', '부작용은 없을까요?']) }));
    db.Students.forEach((s) => ['A', 'B', 'C', 'D'].filter((g) => g !== s.groupId).forEach((g) =>
      H('evaluate', { studentId: s.studentId, name: s.name, targetGroup: g, logic: 3 + (Math.random() * 3 | 0), creativity: 2 + (Math.random() * 4 | 0), feasibility: 2 + (Math.random() * 4 | 0), delivery: 3 + (Math.random() * 3 | 0), comment: '' })));
    set('evalOpen', 'N'); set('presentingGroup', 'A');
    save(db);
  }
  return { get, post, reset, fill };
})();

const Api = (() => {
  const URL = (window.GOTHAM_CONFIG && window.GOTHAM_CONFIG.API_URL || '').trim();
  const DEMO = !URL;
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
