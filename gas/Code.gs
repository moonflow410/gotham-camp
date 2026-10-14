/**
 * 고담시의 선택 — Google Apps Script 백엔드 (API 진입점 + 시트 입출력)
 * ------------------------------------------------------------------
 * 파일 구성 (Apps Script 편집기에 2개 파일로 붙여넣기)
 *   - Code.gs : 이 파일 (doGet / doPost / 시트 읽기·쓰기 / 메뉴)
 *   - Core.gs : 비즈니스 로직 (프론트엔드의 assets/js/core.js 와 동일한 내용)
 *
 * 최초 설정
 *   1) 새 Google 스프레드시트 > 확장 프로그램 > Apps Script
 *   2) Code.gs, Core.gs 붙여넣기 → 저장
 *   3) 함수 선택 드롭다운에서 setupDatabase 실행 (권한 승인)
 *   4) 배포 > 새 배포 > 유형: 웹 앱 / 실행 사용자: 나 / 액세스: 모든 사용자 → 배포
 *   5) 발급된 .../exec URL 을 assets/js/config.js 의 API_URL 에 붙여넣기
 *
 * API
 *   GET  ?action=state                       → 전체 현황 (대시보드·학생 화면 공용, 2초 캐시)
 *   GET  ?action=me&studentId=..&name=..     → 학생 개인 기록
 *   POST {action, ...}  (Content-Type: text/plain — CORS preflight 회피)
 *        register | vote | perspective | groupTopic | memberPlan | submission | question | evaluate
 *        adminCheck | admin | adminRelease | adminQuestion   (교사 PIN 필요)
 */

var SPREADSHEET_ID = '';   // 비워두면 이 스크립트가 연결된 스프레드시트를 사용
var STATE_CACHE_SEC = 2;   // 동시 접속(24명 + 대시보드) 부하를 줄이기 위한 캐시 시간(초)

/* ========== 엔드포인트 ========== */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    var action = p.action || 'state';
    if (action === 'state') return json_(cachedState_());
    if (action === 'me') return json_(GothamCore.me(readDb_(), p.studentId, p.name));
    if (action === 'ping') return json_({ ok: true, time: GothamCore.now() });
    return json_({ ok: false, error: '알 수 없는 요청: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    lock.waitLock(20000);
    var db = readDb_();
    var out = GothamCore.handle(db, body.action, body);
    if (out.changed && out.changed.length) {
      writeTables_(db, out.changed);
      SpreadsheetApp.flush();
      CacheService.getScriptCache().remove('state');
    }
    return json_(out.result);
  } catch (err) {
    return json_({ ok: false, error: '서버가 잠시 바빠요. 다시 시도해 주세요. (' + (err && err.message || err) + ')' });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* ========== 시트 입출력 ========== */
function ss_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function readDb_() {
  var ss = ss_(), db = {};
  Object.keys(GothamCore.SCHEMA).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) throw new Error('시트 "' + name + '" 이(가) 없습니다. setupDatabase()를 먼저 실행하세요.');
    var values = sh.getDataRange().getDisplayValues();
    var head = values.shift().map(function (h) { return String(h).trim(); });
    db[name] = values.filter(function (r) { return r.some(function (c) { return c !== ''; }); }).map(function (r) {
      var o = {}; head.forEach(function (h, i) { if (h) o[h] = r[i]; }); return o;
    });
  });
  return db;
}

function writeTables_(db, names) {
  var ss = ss_();
  names.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    var rows = db[name].map(function (o) { return head.map(function (h) { return o[h] === undefined || o[h] === null ? '' : String(o[h]); }); });
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, head.length).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  });
}

function cachedState_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('state');
  if (hit) return JSON.parse(hit);
  var st = GothamCore.computeState(readDb_());
  try { cache.put('state', JSON.stringify(st), STATE_CACHE_SEC); } catch (ignore) {}
  return st;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ========== 관리 기능 (편집기에서 실행 or 시트 메뉴) ========== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🦇 고담 캠프')
    .addItem('1) DB 초기 설정 (시트 생성 + 샘플 데이터)', 'setupDatabase')
    .addSeparator()
    .addItem('활동 기록 초기화 (투표·탐구·제출·질문·평가)', 'resetActivityData')
    .addItem('카드 배정 초기화 (명렬표는 유지)', 'resetCardAssignments')
    .addToUi();
}

/** 시트를 만들고, 비어 있는 시트에만 샘플 데이터를 채웁니다. 여러 번 실행해도 기존 데이터는 지워지지 않습니다. */
function setupDatabase() {
  var ss = ss_();
  var seed = GothamCore.seedDb();
  Object.keys(GothamCore.SCHEMA).forEach(function (name) {
    var head = GothamCore.SCHEMA[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(head.length, sh.getMaxColumns())).setNumberFormat('@'); // 학번 앞자리 0, 문자 그대로 보존
    sh.getRange(1, 1, 1, head.length).setValues([head])
      .setFontWeight('bold').setBackground('#1E3A8A').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    if (sh.getLastRow() <= 1 && seed[name].length) {
      var rows = seed[name].map(function (o) { return head.map(function (h) { return o[h] === undefined ? '' : String(o[h]); }); });
      sh.getRange(2, 1, rows.length, head.length).setValues(rows);
    }
    sh.autoResizeColumns(1, head.length);
  });
  ['Sheet1', '시트1'].forEach(function (n) {
    var s = ss.getSheetByName(n); if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  CacheService.getScriptCache().remove('state');
  try { SpreadsheetApp.getUi().alert('DB 설정 완료! Settings 시트에서 adminPin(교사 PIN)을 꼭 바꿔 주세요.'); } catch (ignore) {}
}

function resetActivityData() {
  var ss = ss_();
  ['Votes', 'Perspectives', 'GroupTopics', 'MemberPlans', 'Submissions', 'Questions', 'Evaluations'].forEach(function (n) {
    var sh = ss.getSheetByName(n); if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  });
  CacheService.getScriptCache().remove('state');
}

function resetCardAssignments() {
  var db = readDb_();
  db.Students.forEach(function (s) { s.cardId = ''; s.roleName = ''; s.groupId = ''; s.seat = ''; s.registeredAt = ''; });
  writeTables_(db, ['Students']);
  CacheService.getScriptCache().remove('state');
}
