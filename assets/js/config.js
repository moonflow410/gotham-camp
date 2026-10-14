/**
 * 배포 설정 — 이 파일만 고치면 됩니다.
 * API_URL 을 비워 두면 "데모 모드"로 동작합니다. (브라우저 안에만 저장, 같은 PC의 탭끼리만 공유)
 * Apps Script 웹 앱 배포 후 받은 .../exec 주소를 넣으면 실제 Google Sheets 와 연결됩니다.
 */
window.GOTHAM_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbztRE3TTBX_YgFv1Xju1RRuzvGalgbJeAUelbVLBwZ7StyEQwdWsGiYA0CNLrLxWkc/exec',                 // 예: 'https://script.google.com/macros/s/AKfycbztRE3TTBX_YgFv1Xju1RRuzvGalgbJeAUelbVLBwZ7StyEQwdWsGiYA0CNLrLxWkc/exec'
  POLL_STUDENT_MS: 7000,       // 학생 화면 새로고침 주기 (24명 동시 접속 기준 5~10초 권장)
  POLL_DASHBOARD_MS: 3000      // 빔프로젝터 대시보드 새로고침 주기
};
