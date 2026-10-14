/**
 * 고담시의 선택 — 공용 비즈니스 로직 (GothamCore)
 * ------------------------------------------------------------
 * 이 파일은 두 곳에서 "똑같이" 쓰입니다.
 *   1) 브라우저 데모 모드 (assets/js/mock.js 가 localStorage 를 DB 처럼 사용)
 *   2) Google Apps Script 백엔드 (gas/Core.gs 로 복사해서 붙여넣기)
 * 따라서 DOM, fetch, SpreadsheetApp 같은 환경 의존 코드를 넣지 마세요.
 *
 * db 형태: { 시트이름: [ {헤더: 값, ...}, ... ], ... }  (모든 값은 문자열)
 */
var GothamCore = (function () {
  'use strict';

  /* ===== 1. 테이블(시트) 스키마 ===== */
  var SCHEMA = {
    Settings:     ['key', 'value', 'note'],
    Groups:       ['groupId', 'groupName', 'table', 'color', 'motto'],
    Roles:        ['cardId', 'roleKey', 'roleName', 'groupId', 'seat', 'icon', 'description', 'prompt', 'careerHint'],
    Students:     ['studentId', 'name', 'gender', 'cardId', 'roleName', 'groupId', 'seat', 'registeredAt'],
    Dilemmas:     ['dilemmaId', 'session', 'title', 'scenario', 'options', 'isTopic', 'order'],
    Votes:        ['studentId', 'name', 'groupId', 'roleKey', 'dilemmaId', 'choice', 'reason', 'updatedAt'],
    Perspectives: ['studentId', 'name', 'groupId', 'roleKey', 'dilemmaId', 'stance', 'argument', 'updatedAt'],
    Topics:       ['topicId', 'roleKey', 'title', 'question', 'dilemmaId', 'realWorld', 'careers', 'order'],
    TopicPicks:   ['studentId', 'name', 'groupId', 'topicId', 'customTitle', 'reason', 'updatedAt'],
    GroupTopics:  ['groupId', 'topicId', 'dilemmaId', 'title', 'problem', 'method', 'updatedBy', 'updatedAt'],
    MemberPlans:  ['studentId', 'name', 'groupId', 'roleKey', 'career', 'task', 'idea', 'updatedAt'],
    Submissions:  ['groupId', 'summary', 'solution', 'slideLink', 'updatedBy', 'updatedAt'],
    Questions:    ['id', 'studentId', 'name', 'fromGroup', 'targetGroup', 'question', 'status', 'createdAt'],
    Evaluations:  ['studentId', 'name', 'fromGroup', 'targetGroup', 'logic', 'creativity', 'feasibility', 'delivery', 'comment', 'updatedAt'],
    Reflections:  ['studentId', 'name', 'groupId', 'roleKey', 'motivation', 'process', 'discovery', 'competencies', 'reflection', 'nextStep', 'updatedAt']
  };

  /* 학생 자기 성찰용 역량 목록 (생활기록부 작성 참고) */
  var COMPETENCIES = [
    { key: '비판적 사고력', hint: '주장과 근거를 따져 보고 다른 관점을 검토했다' },
    { key: '윤리적 판단력', hint: '가치가 충돌하는 상황에서 원칙과 결과를 함께 고려해 판단했다' },
    { key: '공감·관점 수용', hint: '다른 역할과 입장의 처지를 이해하려 했다' },
    { key: '의사소통·토론', hint: '근거를 들어 의견을 말하고 다른 의견을 경청했다' },
    { key: '협업·리더십', hint: '조원과 역할을 나누고 공동의 결론을 이끌었다' },
    { key: '자료 탐색·정보 활용', hint: '현실 사례와 자료를 찾아 분석했다' },
    { key: '창의적 문제해결', hint: '새로운 해결책을 설계했다' },
    { key: '진로 탐색·연계', hint: '탐구를 나의 진로·관심 분야와 연결했다' },
    { key: '공동체 의식', hint: '공동체의 문제에 책임감을 갖고 참여했다' }
  ];

  /* ===== 2. 샘플(초기) 데이터 — 시트에서 자유롭게 수정 가능 ===== */
  var SETTINGS_SEED = [
    { key: 'campTitle',        value: '고담시의 선택',  note: '캠프 제목' },
    { key: 'currentSession',   value: '1',  note: '현재 차시 (1/2/3) — 학생 화면 탭 잠금 해제 기준' },
    { key: 'activeDilemmaId',  value: 'D1', note: '대시보드에 크게 띄울 딜레마' },
    { key: 'voteOpen',         value: 'Y',  note: '투표 허용 Y/N' },
    { key: 'submitOpen',       value: 'Y',  note: '3차시 자료 제출 허용 Y/N' },
    { key: 'evalOpen',         value: 'N',  note: '상호평가 허용 Y/N' },
    { key: 'presentingGroup',  value: '',   note: '현재 발표 그룹 ID (예: A)' },
    { key: 'dashboardView',    value: 'groups', note: 'groups / vote / topics / present' },
    { key: 'notice',           value: '다음 2차시에는 오늘의 투표 결과를 우리 역할의 눈으로 다시 분석합니다. 같은 역할 4명이 역할별 예시 탐구 주제를 살펴보고, 공동 토론으로 하나를 정해 심화 탐구를 시작해요.', note: '학생 화면 공지' },
    { key: 'reflectionOpen',   value: 'Y',  note: '개인 활동 기록(성찰) 작성 허용 Y/N' },
    { key: 'allowUnlisted',    value: 'N',  note: '명렬표에 없는 학번 등록 허용 Y/N' },
    { key: 'adminPin',         value: '0000', note: '교사용 PIN — 반드시 변경하세요 (화면에 노출되지 않음)' }
  ];

  // 그룹 = 역할 (같은 역할 4명이 한 조). groupId 는 역할 코드와 같습니다.
  var GROUPS_SEED = [
    { groupId: 'CIT', groupName: '고담 시민회의',     table: '1테이블', color: '#F59E0B', motto: '평범한 사람들의 일상을 지킨다' },
    { groupId: 'GPD', groupName: 'GCPD 수사본부',     table: '2테이블', color: '#3B82F6', motto: '법의 테두리 안에서 도시를 지킨다' },
    { groupId: 'CTY', groupName: '시청 정책실',       table: '3테이블', color: '#14B8A6', motto: '한정된 자원으로 최선의 도시를 설계한다' },
    { groupId: 'PRS', groupName: '고담 가제트 편집국', table: '4테이블', color: '#F43F5E', motto: '진실을 기록하고 시민에게 알린다' },
    { groupId: 'LAW', groupName: '지방검사실',        table: '5테이블', color: '#8B5CF6', motto: '정의와 적법 절차를 수호한다' },
    { groupId: 'MED', groupName: '웨인 재단 연구소',   table: '6테이블', color: '#10B981', motto: '과학과 의료로 생명을 지킨다' }
  ];

  var ROLE_TYPES = [
    { roleKey: 'CIT', roleName: '고담 시민', icon: '🏙️',
      description: '평범한 고담 시민. 안전과 자유 사이에서 하루하루를 살아간다.',
      prompt: '이 결정으로 내 가족과 이웃의 일상은 어떻게 달라질까? 나는 무엇을 감수할 수 있고, 무엇은 절대 양보할 수 없을까?',
      careerHint: '교육, 사회복지, 심리·상담, 도시·공동체' },
    { roleKey: 'GPD', roleName: '고담 경찰 (GCPD)', icon: '🚓',
      description: '치안과 법 집행을 책임진다. 자경단과 협력할지 고민한다.',
      prompt: '범죄를 막는 효과와 적법한 절차 중 무엇이 더 무거운가? 경찰에 대한 시민의 신뢰는 어떻게 지킬 수 있을까?',
      careerHint: '경찰·보안, 범죄학, 보안기술' },
    { roleKey: 'CTY', roleName: '시 행정가 (시청)', icon: '🏛️',
      description: '예산과 정책을 결정한다. 한정된 자원을 어디에 쓸지 판단한다.',
      prompt: '이 선택에 드는 비용과 혜택은 누구에게 돌아가는가? 장기적으로 고담시 전체에 가장 이로운 정책은 무엇일까?',
      careerHint: '행정·정책, 경제·경영, 도시계획' },
    { roleKey: 'PRS', roleName: '언론인 (고담 가제트)', icon: '📰',
      description: '진실 보도와 공공의 이익 사이에서 균형을 고민한다.',
      prompt: '시민은 무엇을 알 권리가 있는가? 진실을 알리는 것이 혼란을 낳는다면 그래도 보도해야 할까?',
      careerHint: '미디어·언론, 콘텐츠 제작, 광고·홍보' },
    { roleKey: 'LAW', roleName: '법조인 (지방검사실)', icon: '⚖️',
      description: '법치와 적법 절차, 인권을 수호한다.',
      prompt: '이 행동은 법과 인권의 원칙에 맞는가? 예외를 한 번 허용하면 어떤 선례가 남을까?',
      careerHint: '법학·인권, 정치·외교, 경찰행정' },
    { roleKey: 'MED', roleName: '의료·과학자 (웨인 재단)', icon: '🧪',
      description: '시민의 건강과 생명, 기술의 윤리적 사용을 다룬다.',
      prompt: '생명과 건강의 관점에서 무엇이 최선인가? 기술은 누구를 위해, 어디까지 쓰여야 할까?',
      careerHint: '보건·의료, 생명과학, 공학·IT, 뇌과학' }
  ];

  // 24장 신분증 카드: 역할 6종 × 4장. 같은 역할 4명이 한 조. (예: GPD-3 → GCPD 수사본부 3번 좌석)
  var CARDS_PER_ROLE = 4;
  function buildRoleCards() {
    var cards = [];
    ROLE_TYPES.forEach(function (r) {
      for (var n = 1; n <= CARDS_PER_ROLE; n++) {
        cards.push({
          cardId: r.roleKey + '-' + n, roleKey: r.roleKey, roleName: r.roleName,
          groupId: r.roleKey, seat: String(n), icon: r.icon,
          description: r.description, prompt: r.prompt, careerHint: r.careerHint
        });
      }
    });
    return cards;
  }

  // 역할별 예시 탐구 주제 — 그룹은 이 중 하나를 고르거나 직접 제안한 주제로 공동 토론 후 결정합니다.
  var T = function (id, rk, order, title, question, d, real, careers) {
    return { topicId: id, roleKey: rk, order: String(order), title: title, question: question, dilemmaId: d, realWorld: real, careers: careers };
  };
  var TOPICS_SEED = [
    T('CIT-T1', 'CIT', 1, '두려움의 도시, 시민의 안전감은 어떻게 회복될까', '범죄 불안이 공동체 신뢰를 무너뜨릴 때, 시민이 스스로 만들 수 있는 안전망은 무엇인가?', 'D1', '범죄예방 환경설계(CPTED), 마을 공동체 순찰, 안심귀갓길', '도시·공동체, 사회복지'),
    T('CIT-T2', 'CIT', 2, '자경단에 박수 치는 시민 — 정의감인가, 위험인가', '법이 무력할 때 사적 제재를 지지하는 여론은 정당한가?', 'D1', '온라인 신상 공개 사이트, 사적 제재 여론 조사', '심리·상담, 사회학'),
    T('CIT-T3', 'CIT', 3, '범죄 피해자와 가족을 위한 사회 안전망', '피해 회복을 위해 국가와 공동체는 무엇을 책임져야 하는가?', 'D4', '범죄피해자 지원 제도, 트라우마 상담', '사회복지, 심리·상담'),
    T('CIT-T4', 'CIT', 4, '청소년이 범죄 조직에 빠지지 않는 도시', '빈곤 지역 청소년에게 필요한 것은 처벌인가, 기회인가?', 'D4', '청소년 범죄 예방 프로그램, 방과후 지역 돌봄', '교육, 청소년 지도'),
    T('GPD-T1', 'GPD', 1, '예측 치안 AI, 범죄를 막을까 차별을 만들까', '범죄 발생을 예측하는 AI를 순찰에 활용해도 되는가?', 'D2', '해외 예측 치안 도입 사례와 알고리즘 편향 논란', '경찰·보안, 데이터 분석'),
    T('GPD-T2', 'GPD', 2, '경찰과 자경단의 협력, 어디까지 허용될까', '공권력이 민간의 힘을 빌릴 때 책임은 누가 지는가?', 'D1', '민간 경비, 시민 제보·포상 제도, 자율방범대', '경찰행정, 범죄학'),
    T('GPD-T3', 'GPD', 3, '모든 시민 감시 장치 — 수사를 위한 정보 활용의 한계', '생명을 구하기 위한 위치·통신 정보 수집은 어디까지 정당한가?', 'D2', 'CCTV 얼굴인식, 통신자료 조회 논란', '보안기술, 법학'),
    T('GPD-T4', 'GPD', 4, '부패한 조직을 바꾸는 내부고발과 감찰', '조직 내부의 부정을 고발하는 사람은 어떻게 보호되어야 하는가?', 'D5', '공익신고자 보호 제도', '경찰행정, 공공기관'),
    T('CTY-T1', 'CTY', 1, '한정된 예산 — 치안 강화인가, 복지·예방인가', '범죄를 줄이는 데 더 효과적이고 공정한 예산 배분은 무엇인가?', 'D4', '주민참여예산제, 지자체 안전·복지 예산', '행정·정책, 경제'),
    T('CTY-T2', 'CTY', 2, '낙후 지역 재개발과 젠트리피케이션', '도시를 개발하면 원래 살던 주민은 어디로 가는가?', 'D4', '도시 재생 사업, 젠트리피케이션 사례', '도시계획, 부동산·경제'),
    T('CTY-T3', 'CTY', 3, '위기 상황의 결정 — 다수를 위해 소수를 희생해도 되는가', '재난·테러 상황에서 공리주의적 판단의 한계는 무엇인가?', 'D3', '재난 대응 매뉴얼, 트롤리 딜레마', '행정·정책, 위기관리'),
    T('CTY-T4', 'CTY', 4, '스마트시티 데이터 행정과 시민 프라이버시', '편리한 도시를 위한 데이터 수집에 시민은 어디까지 동의해야 하는가?', 'D2', '스마트시티 플랫폼, 개인정보 보호법', '도시계획, 공학·IT'),
    T('PRS-T1', 'PRS', 1, '진실인가, 희망인가 — 알 권리와 공익', '진실 보도가 사회 혼란을 낳는다면 그래도 보도해야 하는가?', 'D5', '공인 보도와 고귀한 거짓말 논쟁', '미디어·언론, 철학'),
    T('PRS-T2', 'PRS', 2, '테러범의 메시지를 그대로 보도해야 할까', '공포를 퍼뜨리려는 범죄자에게 언론은 확성기가 되어도 되는가?', 'D3', '재난·테러 보도 준칙', '미디어·언론, 방송'),
    T('PRS-T3', 'PRS', 3, '가짜뉴스와 공포의 확산', 'SNS 시대에 도시의 불안은 어떻게 증폭되고, 어떻게 막을 수 있는가?', 'D2', '재난 시 허위정보 확산 사례, 팩트체크', '콘텐츠 제작, 데이터 저널리즘'),
    T('PRS-T4', 'PRS', 4, '언론은 영웅을 어떻게 그려야 하나', '자경단을 영웅이나 범죄자로 그리는 보도는 여론을 어떻게 바꾸는가?', 'D1', '프레이밍 효과, 사적 제재 보도 사례', '광고·홍보, 미디어 심리'),
    T('LAW-T1', 'LAW', 1, '사적 제재는 처벌해야 하는가', '정당방위·자력구제와 사적 제재의 경계는 어디인가?', 'D1', '정당방위 인정 판례, 사적 제재 처벌 사례', '법학, 인권'),
    T('LAW-T2', 'LAW', 2, '불법으로 얻은 증거로 범인을 처벌할 수 있을까', '진실 발견과 적법 절차가 충돌하면 무엇이 우선인가?', 'D2', '위법수집증거 배제 원칙', '법학, 경찰행정'),
    T('LAW-T3', 'LAW', 3, '처벌인가, 치료인가 — 정신질환 범죄자의 책임', '판단 능력이 없는 상태의 범죄에 형사 책임을 물을 수 있는가?', 'D4', '심신미약 감경 논란, 치료감호 제도', '법학, 정신건강'),
    T('LAW-T4', 'LAW', 4, '국가 비상사태와 기본권 제한', '테러 위협 앞에서 자유와 권리는 어디까지 제한될 수 있는가?', 'D2', '테러방지법, 비상사태 선포 사례', '정치·외교, 헌법'),
    T('MED-T1', 'MED', 1, '기술은 누구 편인가 — 이중 용도 기술의 윤리', '사람을 지키려 만든 기술이 무기가 될 때 과학자는 어떤 책임을 지는가?', 'D2', '드론·AI의 군사적 활용 논쟁, 연구 윤리', '공학·IT, 연구 윤리'),
    T('MED-T2', 'MED', 2, '테러와 재난 앞의 도시 공중보건', '대규모 위기에서 한정된 의료 자원은 누구에게 먼저 가야 하는가?', 'D3', '재난 의료 중증도 분류(트리아지), 감염병 대응', '보건·의료, 간호'),
    T('MED-T3', 'MED', 3, '범죄자의 뇌? 신경과학과 자유의지', '뇌 과학이 범죄 성향을 설명한다면 처벌의 의미는 달라지는가?', 'D1', '신경법학, 뇌 영상 증거 논쟁', '뇌과학, 생명과학'),
    T('MED-T4', 'MED', 4, '감시 AI 알고리즘의 편향과 공정성', '얼굴인식 AI가 특정 집단을 더 자주 오인한다면 써도 되는가?', 'D2', '얼굴인식 오인식 연구, AI 윤리 가이드라인', '공학·IT, 데이터 과학')
  ];

  var STUDENTS_SEED = [
    ['20101', '김민준', '남'], ['20102', '이서연', '여'], ['20103', '박도윤', '남'], ['20104', '최지우', '여'],
    ['20105', '정하준', '남'], ['20106', '강서윤', '여'], ['20107', '조시우', '남'], ['20108', '윤하은', '여'],
    ['20109', '장은우', '남'], ['20110', '임지아', '여'], ['20111', '한주원', '남'], ['20112', '오수아', '여'],
    ['20113', '서지호', '남'], ['20114', '신채원', '여'], ['20115', '권예준', '남'], ['20116', '황지유', '여'],
    ['20117', '안건우', '남'], ['20118', '송다인', '여'], ['20119', '류현우', '남'], ['20120', '홍예린', '여'],
    ['20121', '전우진', '남'], ['20122', '고나윤', '여'], ['20123', '문태윤', '남'], ['20124', '배소율', '여']
  ].map(function (r) {
    return { studentId: r[0], name: r[1], gender: r[2], cardId: '', roleName: '', groupId: '', seat: '', registeredAt: '' };
  });

  var DILEMMAS_SEED = [
    { dilemmaId: 'D1', session: '1', isTopic: 'Y', order: '1', title: '가면 쓴 자경단, 허용할 것인가?',
      scenario: '경찰이 범죄를 막지 못하는 사이, 가면을 쓴 자경단원 배트맨이 법적 절차 없이 범죄자를 붙잡고 있다. 범죄율은 줄었지만, 그는 누구에게도 책임을 지지 않는다.',
      options: '허용한다 — 결과적으로 시민을 지킨다|경찰의 통제 아래 제한적으로 허용한다|금지하고 처벌한다 — 법치가 우선이다' },
    { dilemmaId: 'D2', session: '1', isTopic: 'Y', order: '2', title: '모든 시민을 감시하는 장치',
      scenario: '테러범 조커를 잡기 위해, 고담 시민 모두의 휴대전화를 실시간으로 엿볼 수 있는 감시 장치가 만들어졌다. 사용하면 범인을 찾을 수 있지만, 모든 시민의 사생활이 노출된다.',
      options: '사용한다 — 생명이 우선이다|이번 한 번만 사용하고 즉시 파기한다|사용하지 않는다 — 사생활은 침해할 수 없다' },
    { dilemmaId: 'D3', session: '1', isTopic: 'N', order: '3', title: '두 척의 배',
      scenario: '조커가 시민이 탄 배와 죄수가 탄 배에 폭탄을 설치하고, 각 배에 상대 배의 기폭 장치를 주었다. 정해진 시간까지 아무도 누르지 않으면 두 배 모두 폭발한다고 한다. 당신이 시민 배에 타고 있다면?',
      options: '누른다 — 무고한 시민의 생명을 구해야 한다|누르지 않는다 — 누구도 타인의 생명을 빼앗을 권리는 없다' },
    { dilemmaId: 'D4', session: '2', isTopic: 'Y', order: '4', title: '한정된 예산, 어디에 쓸 것인가?',
      scenario: '고담시 예산은 한정되어 있다. 경찰력과 감시 기술을 강화할 것인가, 범죄의 뿌리인 빈곤 지역(내로우스)의 복지·교육·정신건강 지원에 쓸 것인가?',
      options: '치안·감시 기술 강화가 우선|복지·교육·예방이 우선|절반씩 균형 있게 배분' },
    { dilemmaId: 'D5', session: '2', isTopic: 'Y', order: '5', title: '진실인가, 희망인가?',
      scenario: '시민의 영웅이던 검사 하비 덴트가 타락해 범죄를 저질렀다. 이 진실을 밝히면 그가 기소한 범죄자들이 풀려나고 시민은 절망할 수 있다.',
      options: '진실을 공개한다|공익을 위해 진실을 덮는다' }
  ];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function seedDb() {
    var db = {};
    Object.keys(SCHEMA).forEach(function (k) { db[k] = []; });
    db.Settings = clone(SETTINGS_SEED);
    db.Groups = clone(GROUPS_SEED);
    db.Roles = buildRoleCards();
    db.Students = clone(STUDENTS_SEED);
    db.Dilemmas = clone(DILEMMAS_SEED);
    db.Topics = clone(TOPICS_SEED);
    return db;
  }

  /* ===== 3. 유틸 ===== */
  var LETTERS = 'ABCDEFGH';
  function S(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function clip(v, n) { return S(v).slice(0, n || 2000); }
  function now() { return new Date(Date.now() + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 19); }
  function fail(msg) { var e = new Error(msg); e.userFacing = true; throw e; }
  function find(arr, fn) { for (var i = 0; i < arr.length; i++) if (fn(arr[i])) return arr[i]; return null; }
  function upsert(arr, matchFn, obj) {
    for (var i = 0; i < arr.length; i++) {
      if (matchFn(arr[i])) { Object.keys(obj).forEach(function (k) { arr[i][k] = obj[k]; }); return arr[i]; }
    }
    arr.push(obj); return obj;
  }
  function settingsMap(db) {
    var m = {}; (db.Settings || []).forEach(function (r) { if (S(r.key)) m[S(r.key)] = S(r.value); }); return m;
  }
  function isY(v) { return /^(y|yes|true|1|on|o)$/i.test(S(v)); }
  function dilemmaList(db) {
    return (db.Dilemmas || []).filter(function (d) { return S(d.dilemmaId); }).map(function (d) {
      return { dilemmaId: S(d.dilemmaId), session: Number(d.session) || 1, title: S(d.title), scenario: S(d.scenario),
        options: S(d.options).split('|').map(function (x) { return x.trim(); }).filter(Boolean),
        isTopic: isY(d.isTopic), order: Number(d.order) || 99 };
    }).sort(function (a, b) { return a.order - b.order; });
  }
  function cardOf(db, cardId) { return find(db.Roles, function (r) { return S(r.cardId) === S(cardId); }); }

  function requireStudent(db, p) {
    var sid = S(p.studentId), name = S(p.name);
    if (!sid || !name) fail('학번과 이름이 필요합니다.');
    var st = find(db.Students, function (s) { return S(s.studentId) === sid; });
    if (!st || S(st.name) !== name) fail('학번 또는 이름이 일치하지 않습니다.');
    if (!S(st.cardId)) fail('먼저 역할 카드를 등록하세요.');
    var card = cardOf(db, st.cardId);
    if (!card) fail('카드 정보를 찾을 수 없습니다. 선생님께 문의하세요.');
    return { st: st, card: card };
  }
  function requireAdmin(db, p) {
    var pin = settingsMap(db).adminPin || '0000';
    if (S(p.pin) !== pin) fail('교사 PIN이 올바르지 않습니다.');
  }

  /* ===== 4. 화면용 전체 상태 ===== */
  function computeState(db) {
    var set = settingsMap(db);
    var pub = {}; Object.keys(set).forEach(function (k) { if (k !== 'adminPin') pub[k] = set[k]; });
    pub.currentSession = Number(set.currentSession) || 1;

    var byCard = {};
    db.Students.forEach(function (s) { if (S(s.cardId)) byCard[S(s.cardId)] = s; });
    var roleKeyOf = {};

    var roles = db.Roles.filter(function (r) { return S(r.cardId); }).map(function (r) {
      var st = byCard[S(r.cardId)];
      return { cardId: S(r.cardId), roleKey: S(r.roleKey), roleName: S(r.roleName), groupId: S(r.groupId),
        seat: Number(r.seat) || 0, icon: S(r.icon), taken: !!st, studentName: st ? S(st.name) : '', gender: st ? S(st.gender) : '' };
    });
    var roleTypes = [], seen = {};
    db.Roles.forEach(function (r) {
      var k = S(r.roleKey); if (!k || seen[k]) return; seen[k] = 1;
      roleTypes.push({ roleKey: k, roleName: S(r.roleName), icon: S(r.icon), description: S(r.description), prompt: S(r.prompt), careerHint: S(r.careerHint) });
    });
    db.Students.forEach(function (s) { var c = byCard[S(s.cardId)] && cardOf(db, s.cardId); if (c) roleKeyOf[S(s.studentId)] = S(c.roleKey); });

    var dilemmas = dilemmaList(db);
    var votes = {};
    dilemmas.forEach(function (d) {
      var v = { total: 0, counts: d.options.map(function () { return 0; }), byRole: {}, byGroup: {}, reasons: [] };
      roleTypes.forEach(function (rt) { v.byRole[rt.roleKey] = d.options.map(function () { return 0; }); });
      db.Groups.forEach(function (g) { v.byGroup[S(g.groupId)] = d.options.map(function () { return 0; }); });
      votes[d.dilemmaId] = v;
    });
    db.Votes.forEach(function (r) {
      var v = votes[S(r.dilemmaId)]; if (!v) return;
      var i = LETTERS.indexOf(S(r.choice)); if (i < 0 || i >= v.counts.length) return;
      v.total++; v.counts[i]++;
      var rk = S(r.roleKey); if (v.byRole[rk]) v.byRole[rk][i]++;
      var gk = S(r.groupId); if (v.byGroup[gk]) v.byGroup[gk][i]++;
      if (S(r.reason)) v.reasons.push({ choice: S(r.choice), roleKey: rk, reason: S(r.reason) });
    });

    var groups = db.Groups.filter(function (g) { return S(g.groupId); }).map(function (g) {
      return { groupId: S(g.groupId), groupName: S(g.groupName), table: S(g.table), color: S(g.color) || '#F59E0B', motto: S(g.motto) };
    });

    var topics = {};
    db.GroupTopics.forEach(function (t) {
      topics[S(t.groupId)] = { topicId: S(t.topicId), dilemmaId: S(t.dilemmaId), title: S(t.title), problem: S(t.problem), method: S(t.method), updatedBy: S(t.updatedBy), updatedAt: S(t.updatedAt) };
    });
    var topicIdeas = (db.Topics || []).filter(function (t) { return S(t.topicId); }).map(function (t) {
      return { topicId: S(t.topicId), roleKey: S(t.roleKey), title: S(t.title), question: S(t.question), dilemmaId: S(t.dilemmaId),
        realWorld: S(t.realWorld), careers: S(t.careers), order: Number(t.order) || 99 };
    }).sort(function (a, b) { return a.order - b.order; });
    var topicPicks = {};
    (db.TopicPicks || []).forEach(function (p) {
      var g = S(p.groupId), tid = S(p.topicId); if (!g || !tid) return;
      topicPicks[g] = topicPicks[g] || {};
      var key = tid === 'custom' ? 'custom:' + S(p.customTitle) : tid;
      var e = topicPicks[g][key] = topicPicks[g][key] || { topicId: tid, customTitle: S(p.customTitle), count: 0, names: [], reasons: [] };
      e.count++; e.names.push(S(p.name)); if (S(p.reason)) e.reasons.push({ name: S(p.name), reason: S(p.reason) });
    });
    var rtName = {}; roleTypes.forEach(function (r) { rtName[r.roleKey] = r; });
    var plans = db.MemberPlans.map(function (p) {
      var rt = rtName[S(p.roleKey)] || {};
      return { name: S(p.name), groupId: S(p.groupId), roleKey: S(p.roleKey), roleName: rt.roleName || '', icon: rt.icon || '',
        career: S(p.career), task: S(p.task), idea: S(p.idea), updatedAt: S(p.updatedAt) };
    });
    var submissions = {};
    db.Submissions.forEach(function (s) {
      submissions[S(s.groupId)] = { summary: S(s.summary), solution: S(s.solution), slideLink: S(s.slideLink), updatedBy: S(s.updatedBy), updatedAt: S(s.updatedAt) };
    });
    var questions = db.Questions.map(function (q) {
      return { id: S(q.id), name: S(q.name), fromGroup: S(q.fromGroup), targetGroup: S(q.targetGroup), question: S(q.question), status: S(q.status) || 'open', createdAt: S(q.createdAt) };
    }).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });

    var evalSummary = {};
    groups.forEach(function (g) { evalSummary[g.groupId] = { n: 0, logic: 0, creativity: 0, feasibility: 0, delivery: 0, total: 0, comments: [] }; });
    db.Evaluations.forEach(function (e) {
      var s = evalSummary[S(e.targetGroup)]; if (!s) return;
      s.n++; ['logic', 'creativity', 'feasibility', 'delivery'].forEach(function (k) { s[k] += Number(e[k]) || 0; });
      if (S(e.comment)) s.comments.push(S(e.comment));
    });
    Object.keys(evalSummary).forEach(function (g) {
      var s = evalSummary[g];
      ['logic', 'creativity', 'feasibility', 'delivery'].forEach(function (k) { s[k] = s.n ? Math.round(s[k] / s.n * 10) / 10 : 0; });
      s.total = s.n ? Math.round((s.logic + s.creativity + s.feasibility + s.delivery) * 10) / 10 : 0;
    });

    var perspectives = db.Perspectives.map(function (p) {
      return { name: S(p.name), groupId: S(p.groupId), roleKey: S(p.roleKey), dilemmaId: S(p.dilemmaId), stance: S(p.stance), argument: S(p.argument) };
    });

    return {
      ok: true, serverTime: now(), settings: pub, groups: groups, roles: roles, roleTypes: roleTypes, dilemmas: dilemmas,
      votes: votes, registeredCount: Object.keys(byCard).length, rosterCount: db.Students.length,
      topics: topics, topicIdeas: topicIdeas, topicPicks: topicPicks, plans: plans, submissions: submissions, questions: questions, evalSummary: evalSummary, perspectives: perspectives
    };
  }

  /* ===== 5. 학생 개인 정보 ===== */
  function me(db, studentId, name) {
    var sid = S(studentId), nm = S(name);
    var st = find(db.Students, function (s) { return S(s.studentId) === sid; });
    if (!st || S(st.name) !== nm) return { ok: true, registered: false };
    if (!S(st.cardId)) return { ok: true, registered: false, known: true };
    var card = cardOf(db, st.cardId) || {};
    var group = find(db.Groups, function (g) { return S(g.groupId) === S(card.groupId); }) || {};
    var votes = {}, persp = {}, evals = {};
    db.Votes.forEach(function (v) { if (S(v.studentId) === sid) votes[S(v.dilemmaId)] = { choice: S(v.choice), reason: S(v.reason) }; });
    db.Perspectives.forEach(function (v) { if (S(v.studentId) === sid) persp[S(v.dilemmaId)] = { stance: S(v.stance), argument: S(v.argument) }; });
    db.Evaluations.forEach(function (v) {
      if (S(v.studentId) === sid) evals[S(v.targetGroup)] = { logic: Number(v.logic), creativity: Number(v.creativity), feasibility: Number(v.feasibility), delivery: Number(v.delivery), comment: S(v.comment) };
    });
    var plan = find(db.MemberPlans, function (p) { return S(p.studentId) === sid; });
    var pick = find(db.TopicPicks || [], function (p) { return S(p.studentId) === sid; });
    var refl = find(db.Reflections || [], function (r) { return S(r.studentId) === sid; });
    var myQuestions = (db.Questions || []).filter(function (q) { return S(q.studentId) === sid; })
      .map(function (q) { return { targetGroup: S(q.targetGroup), question: S(q.question) }; });
    return {
      ok: true, registered: true,
      student: { studentId: sid, name: S(st.name), gender: S(st.gender), cardId: S(st.cardId) },
      role: { cardId: S(card.cardId), roleKey: S(card.roleKey), roleName: S(card.roleName), icon: S(card.icon), seat: Number(card.seat) || 0,
        description: S(card.description), prompt: S(card.prompt), careerHint: S(card.careerHint) },
      group: { groupId: S(group.groupId), groupName: S(group.groupName), table: S(group.table), color: S(group.color) || '#F59E0B', motto: S(group.motto) },
      votes: votes, perspectives: persp, evals: evals,
      plan: plan ? { career: S(plan.career), task: S(plan.task), idea: S(plan.idea) } : null,
      topicPick: pick ? { topicId: S(pick.topicId), customTitle: S(pick.customTitle), reason: S(pick.reason) } : null,
      myQuestions: myQuestions,
      reflection: refl ? { motivation: S(refl.motivation), process: S(refl.process), discovery: S(refl.discovery), competencies: S(refl.competencies),
        reflection: S(refl.reflection), nextStep: S(refl.nextStep), updatedAt: S(refl.updatedAt) } : null
    };
  }

  /* ===== 5-1. 교사용: 학생별 활동 기록 모아보기 (생활기록부 작성 참고) ===== */
  function buildRecords(db) {
    var dil = {}; dilemmaList(db).forEach(function (d) { dil[d.dilemmaId] = d; });
    var grp = {}; db.Groups.forEach(function (g) { grp[S(g.groupId)] = S(g.groupName); });
    var idea = {}; (db.Topics || []).forEach(function (t) { idea[S(t.topicId)] = S(t.title); });
    var by = function (table, sid) { return (db[table] || []).filter(function (r) { return S(r.studentId) === sid; }); };
    var optText = function (d, c) { var i = LETTERS.indexOf(S(c)); return d && i >= 0 ? c + '. ' + (d.options[i] || '').split(' — ')[0] : S(c); };
    return db.Students.filter(function (s) { return S(s.studentId); }).map(function (s) {
      var sid = S(s.studentId), card = cardOf(db, s.cardId) || {}, gid = S(card.groupId);
      var gt = find(db.GroupTopics, function (t) { return S(t.groupId) === gid; }) || {};
      var sub = find(db.Submissions, function (t) { return S(t.groupId) === gid; }) || {};
      var plan = by('MemberPlans', sid)[0] || {}, pick = by('TopicPicks', sid)[0] || {}, refl = by('Reflections', sid)[0] || null;
      var recv = db.Evaluations.filter(function (e) { return gid && S(e.targetGroup) === gid; });
      var avg = function (k) { return recv.length ? Math.round(recv.reduce(function (a, e) { return a + (Number(e[k]) || 0); }, 0) / recv.length * 10) / 10 : null; };
      return {
        studentId: sid, name: S(s.name), gender: S(s.gender), cardId: S(s.cardId),
        roleName: S(card.roleName), icon: S(card.icon), groupId: gid, groupName: grp[gid] || '',
        votes: by('Votes', sid).map(function (v) { var d = dil[S(v.dilemmaId)]; return { dilemma: d ? d.title : S(v.dilemmaId), choice: optText(d, v.choice), reason: S(v.reason) }; }),
        perspectives: by('Perspectives', sid).map(function (v) { var d = dil[S(v.dilemmaId)]; return { dilemma: d ? d.title : S(v.dilemmaId), stance: S(v.stance), argument: S(v.argument) }; }),
        topicPick: pick.topicId ? { title: S(pick.topicId) === 'custom' ? S(pick.customTitle) + ' (직접 제안)' : (idea[S(pick.topicId)] || S(pick.topicId)), reason: S(pick.reason) } : null,
        groupTopic: gt.title ? { title: S(gt.title), problem: S(gt.problem), method: S(gt.method) } : null,
        plan: plan.career || plan.task ? { career: S(plan.career), task: S(plan.task), idea: S(plan.idea) } : null,
        submission: sub.summary || sub.solution ? { summary: S(sub.summary), solution: S(sub.solution), slideLink: S(sub.slideLink) } : null,
        questions: by('Questions', sid).map(function (q) { return { target: grp[S(q.targetGroup)] || S(q.targetGroup), question: S(q.question) }; }),
        evalsGiven: by('Evaluations', sid).length,
        peer: recv.length ? { n: recv.length, logic: avg('logic'), creativity: avg('creativity'), feasibility: avg('feasibility'), delivery: avg('delivery'),
          comments: recv.map(function (e) { return S(e.comment); }).filter(Boolean) } : null,
        reflection: refl ? { motivation: S(refl.motivation), process: S(refl.process), discovery: S(refl.discovery), competencies: S(refl.competencies),
          reflection: S(refl.reflection), nextStep: S(refl.nextStep), updatedAt: S(refl.updatedAt) } : null
      };
    });
  }

  /* ===== 6. 쓰기 액션 ===== */
  var ACTIONS = {
    register: function (db, p) {
      var sid = S(p.studentId), name = S(p.name), gender = S(p.gender), cardId = S(p.cardId);
      if (!/^\d{3,10}$/.test(sid)) fail('학번은 숫자로 입력하세요.');
      if (!name) fail('이름을 입력하세요.');
      var set = settingsMap(db);
      var st = find(db.Students, function (s) { return S(s.studentId) === sid; });
      if (st && S(st.name) !== name) fail('명렬표의 이름과 일치하지 않습니다. 학번과 이름을 확인하세요.');
      if (st && S(st.cardId)) {
        if (!cardId || cardId === S(st.cardId)) return { result: me(db, sid, name), changed: [] }; // 재로그인
        fail('이미 ' + S(st.cardId) + ' 카드로 등록되어 있어요. 카드 변경은 선생님께 요청하세요.');
      }
      if (!cardId) fail('신분증 카드를 선택하세요.');
      var card = cardOf(db, cardId); if (!card) fail('존재하지 않는 카드입니다.');
      var holder = find(db.Students, function (s) { return S(s.cardId) === cardId; });
      if (holder) fail('이미 다른 학생이 등록한 카드입니다. 받은 카드 번호를 다시 확인하세요.');
      if (!st) {
        if (!isY(set.allowUnlisted)) fail('명렬표에 없는 학번입니다. 선생님께 문의하세요.');
        st = { studentId: sid, name: name, gender: gender, cardId: '', roleName: '', groupId: '', seat: '', registeredAt: '' };
        db.Students.push(st);
      }
      st.gender = gender || S(st.gender); st.cardId = cardId; st.roleName = S(card.roleName);
      st.groupId = S(card.groupId); st.seat = S(card.seat); st.registeredAt = now();
      return { result: me(db, sid, name), changed: ['Students'] };
    },

    vote: function (db, p) {
      var u = requireStudent(db, p), set = settingsMap(db);
      if (!isY(set.voteOpen)) fail('지금은 투표 시간이 아니에요.');
      var d = find(dilemmaList(db), function (x) { return x.dilemmaId === S(p.dilemmaId); });
      if (!d) fail('딜레마를 찾을 수 없습니다.');
      var choice = S(p.choice).toUpperCase(), idx = LETTERS.indexOf(choice);
      if (idx < 0 || idx >= d.options.length) fail('선택지를 골라 주세요.');
      upsert(db.Votes, function (v) { return S(v.studentId) === S(u.st.studentId) && S(v.dilemmaId) === d.dilemmaId; },
        { studentId: S(u.st.studentId), name: S(u.st.name), groupId: S(u.card.groupId), roleKey: S(u.card.roleKey),
          dilemmaId: d.dilemmaId, choice: choice, reason: clip(p.reason, 500), updatedAt: now() });
      return { result: { ok: true }, changed: ['Votes'] };
    },

    perspective: function (db, p) {
      var u = requireStudent(db, p);
      if (!S(p.dilemmaId)) fail('딜레마를 선택하세요.');
      if (S(p.argument).length < 5) fail('논리를 조금 더 써 주세요.');
      upsert(db.Perspectives, function (v) { return S(v.studentId) === S(u.st.studentId) && S(v.dilemmaId) === S(p.dilemmaId); },
        { studentId: S(u.st.studentId), name: S(u.st.name), groupId: S(u.card.groupId), roleKey: S(u.card.roleKey),
          dilemmaId: S(p.dilemmaId), stance: clip(p.stance, 200), argument: clip(p.argument, 2000), updatedAt: now() });
      return { result: { ok: true }, changed: ['Perspectives'] };
    },

    topicPick: function (db, p) {
      var u = requireStudent(db, p);
      var tid = S(p.topicId);
      if (!tid) fail('추천할 주제를 고르세요.');
      if (tid === 'custom') { if (S(p.customTitle).length < 2) fail('직접 제안할 주제를 입력하세요.'); }
      else if (!find(db.Topics || [], function (t) { return S(t.topicId) === tid; })) fail('존재하지 않는 주제입니다.');
      upsert(db.TopicPicks, function (x) { return S(x.studentId) === S(u.st.studentId); },
        { studentId: S(u.st.studentId), name: S(u.st.name), groupId: S(u.card.groupId), topicId: tid,
          customTitle: tid === 'custom' ? clip(p.customTitle, 200) : '', reason: clip(p.reason, 500), updatedAt: now() });
      return { result: { ok: true }, changed: ['TopicPicks'] };
    },

    groupTopic: function (db, p) {
      var u = requireStudent(db, p);
      var tid = S(p.topicId) || 'custom';
      var idea = find(db.Topics || [], function (t) { return S(t.topicId) === tid; });
      if (tid !== 'custom' && !idea) fail('존재하지 않는 주제입니다.');
      if (!S(p.title)) fail('그룹 탐구 주제(제목)를 입력하세요.');
      upsert(db.GroupTopics, function (t) { return S(t.groupId) === S(u.card.groupId); },
        { groupId: S(u.card.groupId), topicId: tid, dilemmaId: S(p.dilemmaId) || (idea ? S(idea.dilemmaId) : ''),
          title: clip(p.title, 200), problem: clip(p.problem, 2000), method: clip(p.method, 3000),
          updatedBy: S(u.st.name), updatedAt: now() });
      return { result: { ok: true }, changed: ['GroupTopics'] };
    },

    memberPlan: function (db, p) {
      var u = requireStudent(db, p);
      if (!S(p.career)) fail('진로/관심 분야를 선택하세요.');
      upsert(db.MemberPlans, function (m) { return S(m.studentId) === S(u.st.studentId); },
        { studentId: S(u.st.studentId), name: S(u.st.name), groupId: S(u.card.groupId), roleKey: S(u.card.roleKey),
          career: clip(p.career, 100), task: clip(p.task, 300), idea: clip(p.idea, 2000), updatedAt: now() });
      return { result: { ok: true }, changed: ['MemberPlans'] };
    },

    submission: function (db, p) {
      var u = requireStudent(db, p);
      if (!isY(settingsMap(db).submitOpen)) fail('지금은 자료 제출 시간이 아니에요.');
      var link = S(p.slideLink);
      if (link && !/^https?:\/\//i.test(link)) fail('발표 자료 링크는 http:// 또는 https:// 로 시작해야 해요.');
      upsert(db.Submissions, function (s) { return S(s.groupId) === S(u.card.groupId); },
        { groupId: S(u.card.groupId), summary: clip(p.summary, 3000), solution: clip(p.solution, 3000), slideLink: clip(link, 500),
          updatedBy: S(u.st.name), updatedAt: now() });
      return { result: { ok: true }, changed: ['Submissions'] };
    },

    question: function (db, p) {
      var u = requireStudent(db, p);
      var q = clip(p.question, 500); if (q.length < 2) fail('질문을 입력하세요.');
      var target = S(p.targetGroup);
      if (!find(db.Groups, function (g) { return S(g.groupId) === target; })) fail('질문할 그룹을 선택하세요.');
      if (target === S(u.card.groupId)) fail('우리 그룹에는 질문할 수 없어요.');
      db.Questions.push({ id: 'Q' + Date.now().toString(36) + Math.floor(Math.random() * 1000), studentId: S(u.st.studentId), name: S(u.st.name),
        fromGroup: S(u.card.groupId), targetGroup: target, question: q, status: 'open', createdAt: now() });
      return { result: { ok: true }, changed: ['Questions'] };
    },

    evaluate: function (db, p) {
      var u = requireStudent(db, p);
      if (!isY(settingsMap(db).evalOpen)) fail('지금은 상호평가 시간이 아니에요.');
      var target = S(p.targetGroup);
      if (!find(db.Groups, function (g) { return S(g.groupId) === target; })) fail('평가할 그룹을 선택하세요.');
      if (target === S(u.card.groupId)) fail('우리 그룹은 평가할 수 없어요.');
      var row = { studentId: S(u.st.studentId), name: S(u.st.name), fromGroup: S(u.card.groupId), targetGroup: target, comment: clip(p.comment, 500), updatedAt: now() };
      ['logic', 'creativity', 'feasibility', 'delivery'].forEach(function (k) {
        var n = Number(p[k]); if (!(n >= 1 && n <= 5)) fail('모든 항목에 점수(1~5)를 매겨 주세요.'); row[k] = String(n);
      });
      upsert(db.Evaluations, function (e) { return S(e.studentId) === row.studentId && S(e.targetGroup) === target; }, row);
      return { result: { ok: true }, changed: ['Evaluations'] };
    },

    reflection: function (db, p) {
      var u = requireStudent(db, p);
      if (S(settingsMap(db).reflectionOpen).toUpperCase() === 'N') fail('지금은 활동 기록을 작성할 수 없어요. 선생님께 문의하세요.');
      upsert(db.Reflections, function (r) { return S(r.studentId) === S(u.st.studentId); },
        { studentId: S(u.st.studentId), name: S(u.st.name), groupId: S(u.card.groupId), roleKey: S(u.card.roleKey),
          motivation: clip(p.motivation, 3000), process: clip(p.process, 5000), discovery: clip(p.discovery, 3000),
          competencies: clip(p.competencies, 3000), reflection: clip(p.reflection, 3000), nextStep: clip(p.nextStep, 2000), updatedAt: now() });
      return { result: { ok: true }, changed: ['Reflections'] };
    },

    /* --- 교사 전용 --- */
    adminRecords: function (db, p) {
      requireAdmin(db, p);
      return { result: { ok: true, records: buildRecords(db) }, changed: [] };
    },

    adminCheck: function (db, p) { requireAdmin(db, p); return { result: { ok: true }, changed: [] }; },

    admin: function (db, p) {
      requireAdmin(db, p);
      var allowed = ['reflectionOpen', 'campTitle', 'currentSession', 'activeDilemmaId', 'voteOpen', 'submitOpen', 'evalOpen', 'presentingGroup', 'dashboardView', 'notice', 'allowUnlisted'];
      var s = p.settings || {};
      Object.keys(s).forEach(function (k) {
        if (allowed.indexOf(k) < 0) return;
        upsert(db.Settings, function (r) { return S(r.key) === k; }, { key: k, value: clip(s[k], 1000) });
      });
      return { result: { ok: true }, changed: ['Settings'] };
    },

    adminRelease: function (db, p) {
      requireAdmin(db, p);
      var st = find(db.Students, function (s) { return S(s.studentId) === S(p.studentId); });
      if (!st) fail('해당 학번이 없습니다.');
      st.cardId = ''; st.roleName = ''; st.groupId = ''; st.seat = ''; st.registeredAt = '';
      return { result: { ok: true }, changed: ['Students'] };
    },

    adminQuestion: function (db, p) {
      requireAdmin(db, p);
      var q = find(db.Questions, function (x) { return S(x.id) === S(p.id); });
      if (!q) fail('질문을 찾을 수 없습니다.');
      q.status = S(p.status) || 'answered';
      return { result: { ok: true }, changed: ['Questions'] };
    }
  };

  function handle(db, action, payload) {
    try {
      var fn = ACTIONS[action];
      if (!fn) fail('알 수 없는 요청입니다: ' + action);
      return fn(db, payload || {});
    } catch (err) {
      return { result: { ok: false, error: err && err.userFacing ? err.message : '서버 오류: ' + (err && err.message || err) }, changed: [] };
    }
  }

  return { SCHEMA: SCHEMA, COMPETENCIES: COMPETENCIES, seedDb: seedDb, computeState: computeState, me: me, handle: handle, LETTERS: LETTERS, now: now };
})();
