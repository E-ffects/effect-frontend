// 화면설계서 0-2 상태 배지 색 규칙
export const SEVERITY_TONE = { CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'blue', LOW: 'gray', '판정 보류': 'outline' }
export const STATUS_TONE = { 접수: 'yellow', 분석중: 'blue', 원인확정: 'purple', 처리완료: 'green' }
export const URGENCY_TONE = { 즉시: 'red', 금주내: 'orange', 금월내: 'blue' }
export const RESULT_TONE = { 효과있음: 'green', 부분효과: 'orange', 효과없음: 'red', '재발 확인': 'red' }
// v12 패턴 조사 등급 (기능 영향)
export const GRADE_TONE = { 상: 'red', 중: 'orange', 하: 'gray', '판정 대기': 'outline' }
export const ALERT_TONE = { 고위험: 'red', '재발 의심': 'purple', 확산형: 'purple', 급증: 'orange', '반복 재발': 'purple' }
export const IMPORTANCE_TONE = { 상: 'default', 중: 'outline', 하: 'gray' }

export function recurrenceTone(label) {
  if (!label) return 'gray'
  return label.includes('확정') ? 'red' : 'purple'
}
