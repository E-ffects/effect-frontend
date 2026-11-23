// Spring_API_v5 상태 값 → 화면 라벨·배지 색 (필드 이름은 PCB v5 데이터 원본, 라벨만 한국어)

export const CS_STATUS = {
  OPEN: { label: '접수', tone: 'yellow' },
  RESPONDED: { label: '회신 완료', tone: 'blue' },
  CLOSED: { label: '처리 완료', tone: 'green' },
}

export const QA_STATUS = {
  RECEIVED: { label: '판정 전', tone: 'outline' },
  TRIAGED: { label: 'QA 판정', tone: 'yellow' },
  ANALYZING: { label: '분석', tone: 'blue' },
  CAUSE_DECIDED: { label: '원인 확정', tone: 'purple' },
  CLOSED: { label: '종결', tone: 'green' },
}

export const INTAKE_STATE = {
  PROCESSING: { label: '처리 중', tone: 'blue' },
  NEEDS_INFO: { label: '정보 필요', tone: 'orange' },
  TRIAGE_REVIEW: { label: 'QA 확인 대기', tone: 'yellow' },
  ACCEPTED: { label: '접수 완료', tone: 'green' },
  FAILED: { label: '처리 실패', tone: 'red' },
}

export const ANALYSIS_STATE = {
  NOT_REQUESTED: { label: '분석 전', tone: 'outline' },
  QUEUED: { label: '대기', tone: 'gray' },
  RUNNING: { label: '분석 중', tone: 'blue' },
  SUCCEEDED: { label: '분석 완료', tone: 'green' },
  PARTIAL: { label: '일부 완료', tone: 'yellow' },
  FAILED: { label: '분석 실패', tone: 'red' },
}

export const APPROVAL = {
  NOT_REQUIRED: { label: '판정 전', tone: 'outline' },
  WAITING: { label: '판정 대기', tone: 'yellow' },
  APPROVED: { label: '승인', tone: 'green' },
  REJECTED: { label: '반려', tone: 'red' },
  CONFIRMED: { label: '확인', tone: 'green' },
}

export const LEVEL_TONE = { L3: 'red', L2: 'orange', L1: 'gray' }

export const ACTION_TYPE = {
  REPLACEMENT_SHIPMENT: '대체품 출하',
  CREDIT_NOTE: '대금 공제',
  SORTING_SUPPORT_AND_CREDIT: '선별 지원·대금 공제',
  NO_CHARGE_SAMPLE_RETURN: '무상 시료 회수',
}

// 에이전트 7단계 (AI 명세 trace 순서)
export const AGENT_STEPS = [
  { agent: 'ORCHESTRATOR', label: '오케스트레이터', desc: '기준 시각 고정·라우팅' },
  { agent: 'QA', label: 'QA', desc: '분석 수준 판정' },
  { agent: 'MANUFACTURING', label: '제조', desc: 'Lot 추적' },
  { agent: 'CAUSE_ANALYSIS', label: '원인분석', desc: '과거 사례 대조' },
  { agent: 'QA', label: 'QA', desc: '근거 검토·재발 판정' },
  { agent: 'MANUFACTURING', label: '제조', desc: '후보 Lot·개선안' },
  { agent: 'CS', label: 'CS', desc: '회신 초안' },
]

export const RECURRENCE = {
  RECURRENCE: { label: '재발', tone: 'red' },
  PRE_ACTION_PRODUCT: { label: '조치 전 생산품', tone: 'blue' },
  PENDING_CAUSE_REVIEW: { label: '원인 재검토', tone: 'yellow' },
  NOT_APPLICABLE: { label: '해당 없음', tone: 'gray' },
}

export const EVIDENCE = {
  SIMILAR_CASE: { label: '유사 사례', tone: 'blue' },
  PROCESS_SIGNAL: { label: '공정 신호', tone: 'red' },
  EQUIPMENT_EVENT: { label: '설비 이벤트', tone: 'orange' },
  INSPECTION: { label: '검사', tone: 'purple' },
  MATERIAL: { label: '자재', tone: 'green' },
  SUPPLIER: { label: '공급사', tone: 'green' },
}

export const pick = (map, key) => map[key] || { label: key || '—', tone: 'gray' }
