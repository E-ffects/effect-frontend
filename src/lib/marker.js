// 손으로 긋는 표시(형광펜·밑줄·동그라미·네모·취소선)의 획 계산.
// Kokonut UI "Marker Text"(MIT, @dorianbaffier)의 계산을 그대로 옮겼다. 화면에 그리는 건 components/MarkerText.vue

export const DEFAULT_COLOR = {
  highlight: '#facc15',
  underline: '#f97316',
  circle: '#2563eb',
  box: '#16a34a',
  strike: '#dc2626',
}

// 펜 속도(px/ms). 긴 획은 손이 느려지므로 시간은 비례가 아니라 범위 안으로 자른다
export const PEN_SPEED = 0.9
export const HIGHLIGHT_SPEED = 1.15
export const MIN_MS = 260
export const MAX_MS = 820
export const LINE_GAP = 60 // 같은 표시의 다음 줄로 펜을 옮기는 시간
export const PEN_EASE = 'cubic-bezier(0.45, 0.05, 0.25, 1)' // 손이 획 안으로 가속했다가 빠져나온다
export const MASK_SPAN = 20_000

/** 정해진 잡음: 크기가 바뀌어 다시 그려도 같은 떨림 */
function random(seed) {
  let n = seed
  return () => {
    n += 1
    const x = Math.sin(n * 12.9898 + seed * 78.233) * 43_758.5453
    return x - Math.floor(x)
  }
}

export function hash(text) {
  let h = 7
  for (const char of text) h = (h * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003
  return h
}

const r1 = (n) => Math.round(n * 10) / 10

function polyline(points) {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r1(x)} ${r1(y)}`).join('')
}

function lengthOf(points) {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  return total
}

/** 획을 채운 도형으로: 중심선을 점마다 굵기의 절반씩 양쪽으로 밀고 끝을 둥글게. 굵기가 바뀌어 잉크처럼 보인다 */
function outline(points, widths) {
  const left = []
  const right = []
  const last = points.length - 1
  for (let i = 0; i <= last; i++) {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(last, i + 1)]
    const dx = next[0] - prev[0]
    const dy = next[1] - prev[1]
    const len = Math.hypot(dx, dy) || 1
    const half = widths[i] / 2
    const nx = (-dy / len) * half
    const ny = (dx / len) * half
    left.push([points[i][0] + nx, points[i][1] + ny])
    right.push([points[i][0] - nx, points[i][1] - ny])
  }
  const endCap = r1(widths[last] / 2)
  const startCap = r1(widths[0] / 2)
  const back = right.reverse()
  return `${polyline(left)}A${endCap} ${endCap} 0 0 0 ${r1(back[0][0])} ${r1(back[0][1])}${polyline(back).replace('M', 'L')}A${startCap} ${startCap} 0 0 0 ${r1(left[0][0])} ${r1(left[0][1])}Z`
}

/** 필압: 펜이 닿고, 누르고, 떨어진다 */
function pressure(t, base) {
  const land = Math.min(1, t / 0.1)
  const lift = Math.min(1, (1 - t) / 0.18)
  return base * (0.45 + 0.55 * Math.sin((land * Math.PI) / 2)) * (0.55 + 0.45 * lift)
}

/** 손으로 그린 가장자리처럼 느리고 고르지 않은 물결 */
function wobble(rand, amp) {
  const p1 = rand() * Math.PI * 2
  const p2 = rand() * Math.PI * 2
  const f1 = 1 + rand() * 1.5
  const f2 = 3 + rand() * 3
  return (t) => amp * (0.7 * Math.sin(t * f1 * Math.PI + p1) + 0.3 * Math.sin(t * f2 * Math.PI + p2))
}

function sample(count, at) {
  const points = []
  for (let i = 0; i <= count; i++) points.push(at(i / count))
  return points
}

function penStroke(points, width, key, color) {
  const widths = points.map((_, i) => pressure(i / (points.length - 1), width))
  return { key, shape: outline(points, widths), pen: polyline(points), penWidth: width * 4, length: lengthOf(points), color, under: false, alpha: 1 }
}

function circleStroke(box, rand, width, key, color) {
  const cx = (box.left + box.right) / 2
  const cy = (box.top + box.bottom) / 2
  const rx = (box.right - box.left) / 2 + 8
  const ry = (box.bottom - box.top) / 2 + 4
  const tilt = ((rand() - 0.5) * 6 * Math.PI) / 180
  const start = -Math.PI * (0.62 + rand() * 0.12)
  // 손은 고리를 정확히 닫지 않는다: 시작점을 지나 바깥으로 흘러 두 끝이 엇갈린다
  const sweep = Math.PI * 2 + 0.45 + rand() * 0.2
  const drift = 0.05 + rand() * 0.04
  const wave = wobble(rand, 0.025)
  const steps = Math.max(48, Math.round((rx + ry) / 3))
  const points = sample(steps, (t) => {
    const a = start + sweep * t
    const grow = 1 - drift / 2 + drift * t + wave(t)
    const x = Math.cos(a) * rx * grow
    const y = Math.sin(a) * ry * grow
    return [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]
  })
  return penStroke(points, width, key, color)
}

function boxStroke(box, rand, width, key, color) {
  const padX = 5
  const padY = 3
  const corners = [
    [box.left - padX - rand() * 2, box.top - padY + (rand() - 0.5) * 2],
    [box.right + padX + rand() * 2, box.top - padY + (rand() - 0.5) * 2],
    [box.right + padX + (rand() - 0.5) * 2, box.bottom + padY + rand() * 2],
    [box.left - padX + (rand() - 0.5) * 2, box.bottom + padY + rand() * 2],
  ]
  const points = []
  for (let side = 0; side < 4; side++) {
    const a = corners[side]
    const b = corners[(side + 1) % 4]
    const bow = (rand() - 0.5) * 3
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const nx = -(b[1] - a[1]) / len
    const ny = (b[0] - a[0]) / len
    const steps = Math.max(6, Math.round(len / 8))
    for (let s = side === 0 ? 0 : 1; s <= steps; s++) {
      const t = s / steps
      const lift = Math.sin(t * Math.PI) * bow
      points.push([a[0] + (b[0] - a[0]) * t + nx * lift, a[1] + (b[1] - a[1]) * t + ny * lift])
    }
  }
  const first = corners[0]
  const second = corners[1]
  const over = 14 / Math.hypot(second[0] - first[0], second[1] - first[1])
  points.push([first[0] + (second[0] - first[0]) * over, first[1] + (second[1] - first[1]) * over + 1.5])
  return penStroke(points, width, key, color)
}

/** 표시 하나(entry: { type, color, strokeWidth })를 줄(lines: 줄마다 사각형)마다 획으로 */
export function strokesFor(entry, lines, seed, index) {
  const rand = random(seed)
  const color = entry.color ?? DEFAULT_COLOR[entry.type]
  const lineHeight = lines[0].bottom - lines[0].top
  const width = entry.strokeWidth ?? Math.min(4.5, Math.max(1.6, lineHeight * 0.085))

  if (entry.type === 'highlight') {
    return lines.map((line, i) => {
      const h = line.bottom - line.top
      const top = wobble(rand, 0.9)
      const bottom = wobble(rand, 0.9)
      // 끌 모양 펜촉이라 양 끝이 비스듬하고, 줄을 가로지르며 살짝 기운다
      const chisel = h * 0.2
      const tilt = (rand() - 0.5) * Math.min(3, h * 0.08)
      const x0 = line.left - 3 - rand() * 2
      const x1 = line.right + 3 + rand() * 3
      const y0 = line.top + h * 0.08
      const y1 = line.bottom - h * 0.02
      const steps = Math.max(6, Math.round((x1 - x0) / 14))
      const edge = (y, wave, dx) => sample(steps, (t) => [x0 + dx + (x1 - x0) * t, y + wave(t) + tilt * (t - 0.5)])
      const upper = edge(y0, top, chisel * 0.5)
      const lower = edge(y1, bottom, -chisel * 0.5).reverse()
      const mid = (y0 + y1) / 2
      const pen = [
        [x0 - chisel, mid],
        [x1 + chisel, mid + tilt * 0.5],
      ]
      return { key: `${index}-${i}`, shape: `${polyline(upper)}${polyline(lower).replace('M', 'L')}Z`, pen: polyline(pen), penWidth: h * 1.8, length: lengthOf(pen), color, under: true, alpha: 0.42 }
    })
  }

  if (entry.type === 'underline' || entry.type === 'strike') {
    return lines.map((line, i) => {
      const h = line.bottom - line.top
      const bow = (rand() - 0.5) * 3
      const slope = (rand() - 0.5) * (entry.type === 'strike' ? 4 : 2.4)
      const wave = wobble(rand, 0.5)
      const x0 = line.left - 2 - rand() * 3
      const x1 = line.right + 2 + rand() * 4
      const y = entry.type === 'strike' ? line.top + h * 0.56 : line.bottom + Math.max(1, h * 0.04)
      const steps = Math.max(8, Math.round((x1 - x0) / 6))
      const points = sample(steps, (t) => [x0 + (x1 - x0) * t, y + Math.sin(t * Math.PI) * bow + slope * (t - 0.5) + wave(t)])
      return penStroke(points, width, `${index}-${i}`, color)
    })
  }

  return lines.map((line, i) => (entry.type === 'circle' ? circleStroke(line, rand, width, `${index}-${i}`, color) : boxStroke(line, rand, width, `${index}-${i}`, color)))
}
