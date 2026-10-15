/**
 * 개인 PIN(휴대폰 번호 뒷자리 4자리) — 기존 코드를 고치지 않고 붙이는 보조 스크립트
 * index.html, task.html에서 config.js 바로 다음 줄에 불러와요.
 * 학번이 담긴 요청에만 PIN을 붙여 보내고, 교사용(admin…) 요청과 현황(state) 요청은 그대로 보내요.
 */
(function () {
  function apiUrl() {
    if (window.GOTHAM_CONFIG && window.GOTHAM_CONFIG.API_URL) return String(window.GOTHAM_CONFIG.API_URL).trim();
    try { if (typeof CONFIG !== 'undefined' && CONFIG.API_URL) return CONFIG.API_URL; } catch (e) {}
    try { if (typeof API_URL !== 'undefined' && API_URL) return API_URL; } catch (e) {}
    return (window.CONFIG && window.CONFIG.API_URL) || '';
  }
  const API = apiUrl();
  if (!API || !window.fetch) return;              // 데모 모드에서는 동작하지 않아요.

  const KEY = 'gotham_pin:';
  const orig = window.fetch.bind(window);
  let pending = null, nextMsg = '';

  function findId(o, depth) {
    if (!o || typeof o !== 'object' || depth > 3) return '';
    if (o.studentId) return String(o.studentId).trim();
    for (const k in o) { const r = findId(o[k], depth + 1); if (r) return r; }
    return '';
  }

  function askPin(sid) {
    if (pending) return pending;
    pending = new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,11,14,.72);display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit';
      const box = document.createElement('div');
      box.style.cssText = 'background:#FFFFFF;color:#17191E;border-radius:14px;padding:22px;width:100%;max-width:340px;box-shadow:0 10px 40px rgba(0,0,0,.35)';
      const h = document.createElement('h2');
      h.textContent = '개인 PIN을 입력해 주세요';
      h.style.cssText = 'margin:0 0 6px;font-size:19px';
      const p = document.createElement('p');
      p.textContent = '휴대폰 번호 뒷자리 4자리예요. 내 기록을 다른 사람이 보지 못하게 지켜 줘요.';
      p.style.cssText = 'margin:0 0 14px;font-size:15px;line-height:1.5;color:#4A4D55';
      const input = document.createElement('input');
      input.type = 'password'; input.inputMode = 'numeric'; input.maxLength = 4; input.autocomplete = 'off';
      input.setAttribute('aria-label', '휴대폰 번호 뒷자리 4자리');
      input.style.cssText = 'width:100%;box-sizing:border-box;font-size:24px;letter-spacing:.5em;text-align:center;padding:12px;border:1.5px solid #B9B5AB;border-radius:10px';
      const err = document.createElement('p');
      err.setAttribute('role', 'alert');
      err.textContent = nextMsg; nextMsg = '';
      err.style.cssText = 'margin:10px 0 0;min-height:1.4em;font-size:14px;color:#9A3412';
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = '확인';
      btn.style.cssText = 'margin-top:8px;width:100%;min-height:48px;border:0;border-radius:10px;background:#17191E;color:#FFFFFF;font-size:17px;font-weight:700;cursor:pointer';
      const done = () => {
        const v = input.value.replace(/\D/g, '');
        if (v.length !== 4) { err.textContent = '숫자 4자리를 입력해 주세요.'; input.focus(); return; }
        localStorage.setItem(KEY + sid, v);
        wrap.remove(); pending = null; resolve(v);
      };
      btn.addEventListener('click', done);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
      box.append(h, p, input, err, btn); wrap.appendChild(box);
      document.body.appendChild(wrap);
      setTimeout(() => input.focus(), 50);
    });
    return pending;
  }

  async function getPin(sid) {
    const v = localStorage.getItem(KEY + sid);
    return v || askPin(sid);
  }

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf(API) !== 0) return orig(input, init);
    init = init || {};
    const method = String(init.method || 'GET').toUpperCase();
    let sid = '', action = '', body = null, u = null;
    if (method === 'POST' && typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch (e) {}
      if (body) { sid = findId(body, 0); action = String(body.action || ''); }
    } else {
      u = new URL(url);
      sid = (u.searchParams.get('studentId') || '').trim();
      action = u.searchParams.get('action') || '';
    }
    if (!sid || action.indexOf('admin') === 0) return orig(input, init);

    const pin = await getPin(sid);
    if (body) { body.pin = pin; init = Object.assign({}, init, { body: JSON.stringify(body) }); }
    else { u.searchParams.set('pin', pin); input = u.toString(); }

    const res = await orig(input, init);
    try {
      const j = await res.clone().json();
      if (j && j.pinError) {
        localStorage.removeItem(KEY + sid);
        nextMsg = 'PIN이 맞지 않아요. 다시 입력해 주세요.';
        askPin(sid);
      }
    } catch (e) {}
    return res;
  };
})();
