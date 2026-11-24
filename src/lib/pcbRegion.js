// 원인 후보 → PCB 부위 (원인 위치 2D 단면·3D가 같이 쓴다)
// 데이터에 보드 위 좌표는 없으므로 부위는 구조 단위(외층·내층·비아…)로만 정한다.

// v5 process_master 19개 공정 (sequence 순)
export const PROCESSES = [
  ['IQC', '수입검사'], ['IL_IMG', '내층 노광'], ['IL_ETCH', '내층 에칭'], ['IL_AOI', '내층 AOI'], ['OXIDE', '산화 처리'],
  ['LAM', '적층 프레스'], ['DRILL', '드릴'], ['DESMEAR', '디스미어'], ['PLATE', '동도금'], ['OL_IMG', '외층 노광'],
  ['OL_ETCH', '외층 에칭'], ['OL_AOI', '외층 AOI'], ['SM', 'PSR 인쇄'], ['SF', '표면처리'], ['ROUT', '외형 가공'],
  ['CLEAN', '세척'], ['ET', 'E-Test'], ['FQC', '최종 검사'], ['PACK', '포장'],
]
// 공정 → 부위 (검사 공정은 부위 없음)
export const PROCESS_REGION = {
  IQC: 'core', IL_IMG: 'inner', IL_ETCH: 'inner', IL_AOI: 'inner', OXIDE: 'core', LAM: 'core', DRILL: 'via', DESMEAR: 'via', PLATE: 'via',
  OL_IMG: 'outer', OL_ETCH: 'outer', OL_AOI: 'outer', SM: 'psr', SF: 'pad', ROUT: 'edge', CLEAN: 'psr', PACK: 'core',
}
// 증상(소분류) → 부위: 원인 공정이 없을 때 쓴다
export const SYMPTOM_REGION = {
  ELEC01: 'outer', ELEC02: 'outer', ELEC03: 'via', ELEC04: 'inner', ELEC05: 'core', SOLD01: 'pad', SOLD02: 'pad', SOLD03: 'pad',
  STRC01: 'core', STRC02: 'core', STRC03: 'core', STRC04: 'via', APPR01: 'psr', APPR02: 'outer', APPR03: 'psr', DIM01: 'edge', DIM02: 'via',
}
export const INSPECTION = new Set(['ET', 'FQC'])
export const REGION_NAME = { outer: '외층 회로', inner: '내층 회로', core: '적층(절연층)', via: '비아·홀 벽', psr: 'PSR(솔더레지스트) 표면', pad: '패드·표면처리', edge: '외형 가장자리' }
export const RANK = [
  { fill: '#ea002c', soft: '#fdecef', line: '#f6b9c5', text: '#b3001f' },
  { fill: '#e8a33d', soft: '#fff8ec', line: '#f1d29b', text: '#9a6411' },
  { fill: '#7a8699', soft: '#f3f5f9', line: '#d6dce6', text: '#4b5566' },
]

// 검사·판정 공정(E-Test, 최종 검사)은 부위가 아니다. 공정이 없을 때만 증상으로 부위를 정한다
export function regionOfCandidate(c, minorCode) {
  if (INSPECTION.has(c.process_id)) return null
  return PROCESS_REGION[c.process_id] || (c.process_id ? null : SYMPTOM_REGION[minorCode] || null)
}

// 스택업 층 → 부위 (맨 위·아래 동박 = 외층, 나머지 동박 = 내층)
export function regionOfLayer(layer, layers) {
  if (layer.type === 'SOLDERMASK') return 'psr'
  if (layer.type === 'COPPER') {
    const cu = layers.filter((x) => x.type === 'COPPER')
    return layer.name === cu[0].name || layer.name === cu[cu.length - 1].name ? 'outer' : 'inner'
  }
  return 'core'
}

// 제품 스택업 (public/pcb3d/stackups.json, effect/pcb3d/build_stackups.py로 만든 가정 치수)
let stackupsPromise
export function loadStackup(partNo) {
  stackupsPromise ||= fetch('/pcb3d/stackups.json').then((x) => (x.ok ? x.json() : {})).catch(() => ({}))
  return stackupsPromise.then((all) => all[partNo] || null)
}
