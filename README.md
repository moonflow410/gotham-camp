# 고담시의 선택 — 배트맨 시리즈 기반 윤리·사회 탐구 캠프 웹앱

고등학생 24명이 5차시 동안 온·오프라인을 섞어 진행하는 탐구 캠프용 웹앱입니다.
화면은 **GitHub Pages**에 올리고, 데이터는 **Google Apps Script와 Google Sheets**에 저장합니다.

| 화면 | 주소 | 용도 |
|---|---|---|
| 학생용 | `index.html` | 카드(역할) 등록 → 1차시 투표 → 2차시 관점·주제 → 3차시 제출·질문·평가 |
| 현황판 | `dashboard.html` | 빔프로젝터용 화면: 실시간 그룹 배치, 투표 결과, 그룹 주제, 발표·평가. 교사 제어 포함 |

> `assets/js/config.js`의 `API_URL`을 비워 두면 **데모 모드**로 실행됩니다. 데이터는 브라우저에만 저장되고, 같은 PC의 탭끼리만 공유됩니다.
> 현황판에서 **교사 제어 → PIN 0000 → 샘플 데이터 채우기**를 누르면 실제 수업 장면처럼 데이터가 채워진 화면을 미리 볼 수 있습니다.

---

## 폴더 구조

```
gotham-camp/
├─ index.html              학생용 웹앱
├─ dashboard.html          빔프로젝터 현황판 + 교사 제어판
├─ .nojekyll               GitHub Pages가 Jekyll로 빌드하지 않게 하는 빈 파일
├─ assets/
│  ├─ css/tailwind.css     Tailwind 빌드본 (CDN 없이도 동작)
│  ├─ css/style.css        디자인 토큰(색상), 카드·버튼·그래프 등 컴포넌트
│  └─ js/
│     ├─ config.js         ★ GAS 웹 앱 URL과 새로고침 주기 설정
│     ├─ core.js           공용 로직 (gas/Core.gs와 같은 내용)
│     ├─ api.js            API 호출 + 데모 모드용 로컬 백엔드
│     ├─ common.js         공통 유틸, 막대그래프 렌더링
│     ├─ student.js        학생 화면
│     └─ dashboard.js      현황판 화면
└─ gas/
   ├─ Code.gs              doGet / doPost, 시트 읽기·쓰기, 메뉴, 초기화 함수
   ├─ Core.gs              공용 로직 (assets/js/core.js 복사본)
   └─ appsscript.json      시간대(Asia/Seoul), 웹 앱 권한 설정
```

**설계 포인트:** 등록·투표·평가 규칙은 모두 `core.js` 한 파일에 있습니다. 같은 코드를 데모 모드(브라우저)와 GAS(서버)에서 함께 쓰기 때문에, 규칙을 고칠 때는 `core.js`를 수정한 뒤 `Core.gs`에 그대로 복사하면 됩니다.

---

## Step 1. Google Sheets DB 구조

`setupDatabase()`를 실행하면 아래 12개 시트가 자동으로 만들어집니다. 모든 셀은 텍스트 형식이라 학번 앞자리 0도 그대로 유지됩니다.

### 운영 설정 (교사가 직접 수정)

| 시트 | 컬럼 | 설명 |
|---|---|---|
| **Settings** | key, value, note | `currentSession`(현재 차시), `activeDilemmaId`, `voteOpen`, `submitOpen`, `evalOpen`, `presentingGroup`, `dashboardView`, `notice`, `allowUnlisted`, **`adminPin`** |
| **Groups** | groupId, groupName, table, color, motto | 그룹 4개 (A~D), 테이블 위치, 표시 색상 |
| **Roles** | cardId, roleKey, roleName, groupId, seat, icon, description, prompt, careerHint | **신분증 카드 24장**. 카드마다 그룹과 좌석이 정해져 있음 |
| **Students** | studentId, name, gender, cardId, roleName, groupId, seat, registeredAt | 명렬표. 등록하면 오른쪽 칸이 자동으로 채워짐 |
| **Dilemmas** | dilemmaId, session, title, scenario, options, isTopic, order | 선택지는 `|`로 구분. `isTopic=Y`이면 2차시 그룹 주제 후보 |

### 활동 기록 (앱이 자동으로 기록)

| 시트 | 컬럼 | 기록 시점 |
|---|---|---|
| **Votes** | studentId, name, groupId, roleKey, dilemmaId, choice, reason, updatedAt | 1차시 투표 (학생·딜레마별 1행, 다시 투표하면 덮어씀) |
| **Perspectives** | studentId, name, groupId, roleKey, dilemmaId, stance, argument, updatedAt | 2차시 역할 관점 정리 |
| **GroupTopics** | groupId, dilemmaId, title, problem, updatedBy, updatedAt | 2차시 그룹 공통 주제 (그룹당 1행) |
| **MemberPlans** | studentId, name, groupId, roleKey, career, task, idea, updatedAt | 2차시 진로 연계 계획 |
| **Submissions** | groupId, summary, solution, slideLink, updatedBy, updatedAt | 3차시 그룹 자료 (그룹당 1행) |
| **Questions** | id, studentId, name, fromGroup, targetGroup, question, status, createdAt | 3차시 실시간 질문 (`open`/`answered`) |
| **Evaluations** | studentId, name, fromGroup, targetGroup, logic, creativity, feasibility, delivery, comment, updatedAt | 3차시 상호평가 (1~5점, 자기 그룹은 평가 불가) |

Votes와 Perspectives에는 `roleKey`와 `groupId`가 함께 저장됩니다. 그래서 시트에서 바로 피벗 테이블을 만들어 **역할별 투표 경향**을 분석할 수 있고, 같은 데이터를 생기부 기록 근거로도 쓸 수 있습니다.

### 역할·그룹 바꾸기

샘플 구성은 **6개 역할(시민·경찰·행정가·언론인·법조인·의료과학자) × 4개 그룹 = 카드 24장**입니다. 카드 `GPD-3`은 경찰 역할로, C조 2번 좌석에 앉습니다.
선생님이 정한 구성으로 바꾸려면 **Roles 시트의 행을 수정**하면 됩니다. 행 하나가 카드 한 장입니다.
- 같은 역할 카드를 여러 장 만들 때는 `roleKey`를 같게 하고 `cardId`만 다르게 적습니다. 예: `CIT-1` ~ `CIT-6`
- 실물 신분증 카드에는 `cardId`를 크게 인쇄해 두면, 학생이 웹앱에서 같은 번호를 찾아 선택합니다.
- 그룹 수를 바꾸려면 Groups 시트에 행을 추가하거나 지웁니다.

---

## Step 2. Google Apps Script 백엔드 (`gas/`)

1. Google 드라이브에서 **새 스프레드시트**를 만듭니다. 이름 예: `고담 캠프 DB`
2. **확장 프로그램 → Apps Script**를 엽니다.
3. 기본 `Code.gs` 내용을 지우고 `gas/Code.gs`를 붙여넣습니다.
4. **＋ → 스크립트**로 `Core` 파일을 추가하고, `gas/Core.gs` 내용을 붙여넣습니다.
5. (선택) 프로젝트 설정에서 "appsscript.json 표시"를 켜고 `gas/appsscript.json` 내용으로 바꿉니다.
6. 함수 목록에서 **`setupDatabase`**를 선택하고 ▶ 실행합니다. 처음 한 번은 권한 승인이 필요합니다.
7. 시트로 돌아가 다음을 정리합니다.
   - **Settings → adminPin을 반드시 변경**합니다. 기본값은 0000입니다.
   - **Students**: 샘플 명단을 지우고 실제 명렬표(학번·이름·성별)를 붙여넣습니다.
8. **배포 → 새 배포 → 유형: 웹 앱** 설정
   - 실행 사용자: **나**
   - 액세스 권한: **모든 사용자**
   - 배포하면 `https://script.google.com/macros/s/…/exec` 주소가 나옵니다. 이 주소를 복사해 둡니다.

| 메서드 | 요청 | 설명 |
|---|---|---|
| GET | `?action=state` | 전체 현황 (2초 캐시). 학생 화면과 현황판이 같이 씀 |
| GET | `?action=me&studentId=&name=` | 학생 개인 기록 |
| POST | `register`, `vote`, `perspective`, `groupTopic`, `memberPlan`, `submission`, `question`, `evaluate` | 학생 활동 (학번과 이름으로 확인) |
| POST | `adminCheck`, `admin`, `adminRelease`, `adminQuestion` | 교사 제어 (PIN 필요) |

- POST는 `Content-Type: text/plain`으로 보냅니다. GAS가 CORS preflight를 받지 않기 때문입니다.
- 쓰기 요청은 `LockService`로 한 번에 하나씩 처리합니다. 그래서 여러 학생이 동시에 같은 카드를 골라도 한 명만 등록됩니다.
- **코드를 수정한 뒤에는 배포 → 배포 관리 → 수정(연필) → 버전: 새 버전**으로 다시 배포해야 반영됩니다. URL은 바뀌지 않습니다.
- 시트 메뉴 **🦇 고담 캠프**에서 활동 기록 초기화, 카드 배정 초기화를 할 수 있습니다. 리허설 후 실제 수업 전에 사용하세요.

---

## Step 3. 화면 사용법

### 학생 (`index.html`, 휴대폰)
1. 학번, 이름, 성별을 입력하고 받은 카드 번호를 선택합니다. 이동할 그룹과 좌석이 팝업으로 뜹니다.
2. 탭은 교사가 정한 **현재 차시까지만** 열립니다.
   - **1차시**: 고담시 브리핑, 딜레마 3개 투표(이유 작성). 투표한 뒤에 실시간 결과가 보입니다. 다음 차시 안내도 이 탭에 있습니다.
   - **2차시**: 전체 결과와 같은 역할 친구들의 선택을 비교하고, 역할 관점으로 논리를 정리합니다. 그룹 공통 주제와 진로 연계 계획도 여기서 입력합니다.
   - **3차시**: 그룹 자료(요약, 대책, 슬라이드 링크) 제출, 발표 그룹에 질문하기, 다른 그룹 상호평가.
3. 로그인 정보는 기기에 저장되어, 새로고침해도 다시 입력하지 않아도 됩니다. 기기를 바꿀 때는 "다시 입장하기"를 누릅니다.

### 교사 (`dashboard.html`, 빔프로젝터)
- 오른쪽 위 **교사 제어**에서 PIN을 입력하면 다음을 바꿀 수 있습니다: 현재 차시, 대시보드 화면, 크게 띄울 딜레마, 발표 그룹, 투표·제출·평가 열기, 공지, 잘못 등록한 카드 해제.
- **자동 전환**이 켜져 있으면 교사 제어에서 고른 화면으로 현황판이 따라 바뀝니다. 탭을 직접 누르면 수동 모드로 바뀝니다.
- `dashboard.html?view=vote`처럼 주소를 열면 특정 화면에 고정됩니다.
- ☀︎/☾ 버튼으로 밝은 테마와 어두운 테마를 바꿉니다. 교실 조명에 맞춰 고르세요. ⛶ 버튼은 전체 화면입니다.
- 발표·평가 화면에서 교사가 질문을 누르면 답변 완료로 표시됩니다.

---

## Step 4. GitHub Pages 배포 & 테스트

1. GitHub에서 새 저장소를 만듭니다. 예: `gotham-camp`, Public
2. 이 폴더의 파일 전체(`.nojekyll` 포함)를 업로드합니다. 웹에서 **Add file → Upload files**로 드래그하면 됩니다.
3. `assets/js/config.js`를 열어 `API_URL`에 Step 2의 `/exec` 주소를 넣고 커밋합니다.
4. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**
5. 1~2분 뒤 다음 주소로 접속합니다.
   - 학생용: `https://<아이디>.github.io/gotham-camp/`
   - 현황판: `https://<아이디>.github.io/gotham-camp/dashboard.html`
6. 학생용 주소는 QR 코드로 만들어 첫 화면이나 신분증 카드 뒷면에 넣으면 편합니다.

### 수업 전 점검 목록
- [ ] 휴대폰 2대로 서로 다른 학번을 등록 → 현황판 좌석에 3초 안에 표시되는지
- [ ] 같은 카드를 다른 학생이 고르면 "이미 등록된 카드"라고 막히는지
- [ ] 교사 제어에서 투표를 닫으면 학생 화면 투표 버튼이 비활성화되는지 (최대 7초)
- [ ] 2차시로 바꾸면 학생 탭이 열리는지
- [ ] 3차시 슬라이드 링크의 공유 설정이 **링크가 있는 모든 사용자**인지
- [ ] 리허설 후 시트 메뉴에서 **활동 기록 초기화**와 **카드 배정 초기화** 실행

### 문제 해결
| 증상 | 해결 |
|---|---|
| "서버에 연결할 수 없어요" | `config.js` URL 끝이 `/exec`인지, 웹 앱 액세스가 "모든 사용자"인지 확인 |
| 코드를 고쳤는데 그대로 | Apps Script를 **새 버전으로 재배포**하고, 브라우저에서 강력 새로고침 |
| "시트가 없습니다" | `setupDatabase()` 실행 |
| 학교 와이파이에서 느림 | `config.js`의 `POLL_STUDENT_MS`를 10000으로 늘리기 |
| 새 Tailwind 클래스를 추가했는데 적용 안 됨 | `npx tailwindcss@3.4.16 -i in.css -o assets/css/tailwind.css --minify`로 다시 빌드. 또는 `<head>`에 `<script src="https://cdn.tailwindcss.com/3.4.16"></script>`를 추가 |

---

## 다음 단계 (4~5차시 확장 예정)
- 4~5차시 기능은 `TABS`(student.js)와 `VIEWS`(dashboard.js)에 탭을 추가하고, `core.js`의 `ACTIONS`에 액션을 더하는 방식으로 확장합니다.
- 역할·그룹 실제 배정표는 Roles 시트와 Groups 시트에 반영합니다.

※ 이 앱은 수업용 비영리 교육 자료입니다. 작품 속 캐릭터 이름은 딜레마 상황을 설명하는 데에만 쓰고, 로고와 이미지는 오리지널 아이콘을 사용했습니다.
