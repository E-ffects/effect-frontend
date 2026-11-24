// 스프링 엔진: DesignBookmark Motion Studies(shared/motion.js)의 계산을 그대로 옮겼다.
// 값 하나 = { x 현재, v 속도, t 목표, k 강도, c 감쇠 }. 질량 1, 한 프레임을 4번 나눠 계산.
// 움직임 줄이기(prefers-reduced-motion)면 감쇠를 임계값으로 올려 튕김 없이 바로 멈춘다.
// 스프링 값은 "강도 감쇠" (원본 tokens.css와 같은 숫자)

const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const prefersReducedMotion = reduce

export const S = (x, k = 400, c = 30) => ({ x, v: 0, t: x, k, c: reduce ? 2 * Math.sqrt(k) : c })

export function tune(s, k, c) {
  s.k = k
  s.c = reduce ? 2 * Math.sqrt(k) : c
}

export function step(s, dt) {
  const a = -s.k * (s.x - s.t) - s.c * s.v
  s.v += a * dt
  s.x += s.v * dt
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

/** 목표에 충분히 가까워 멈춰도 되는지 */
export const settled = (s) => Math.abs(s.x - s.t) < 0.01 && Math.abs(s.v) < 0.05

export function snap(s) {
  s.x = s.t
  s.v = 0
}

/**
 * 스프링 하나(0 → 1)를 미리 계산해 CSS linear() 곡선으로 바꾼다. 브라우저 애니메이션(el.animate)에 쓴다.
 * 반환: { easing: 'linear(...)', duration: ms }
 */
const easingCache = new Map()
export function springEasing(k, c) {
  const key = `${k} ${c}`
  if (easingCache.has(key)) return easingCache.get(key)
  const s = S(0, k, c)
  s.t = 1
  const pts = [0]
  let t = 0
  while (t < 3 && !(settled(s) && t > 0.1)) {
    for (let i = 0; i < 4; i++) step(s, 1 / 240)
    t += 1 / 60
    pts.push(+s.x.toFixed(4))
  }
  pts[pts.length - 1] = 1
  const out = { easing: `linear(${pts.join(',')})`, duration: Math.round(t * 1000) }
  easingCache.set(key, out)
  return out
}

/** v-spring-in: 새로 붙은 요소가 아래에서 올라오며 나타난다. 값 = { y, scale, k, c } 또는 null(움직이지 않음) */
export const vSpringIn = {
  mounted(el, { value }) {
    if (!value || reduce || !el.animate) return
    const { y = 14, scale = 1, k = 300, c = 22 } = value
    const { easing, duration } = springEasing(k, c)
    el.animate(
      [
        { transform: `translateY(${y}px) scale(${scale})`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration, easing },
    )
  },
}

// 한 rAF 루프에서 등록된 것만 돌린다. 모두 멈추면 루프도 쉰다
const comps = new Set()
let raf = 0
let last = 0

function loop(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30)
  last = now
  const sub = 4
  for (const c of comps) {
    for (let k = 0; k < sub; k++) c.frame(dt / sub)
    c.render()
    if (c.idle?.()) comps.delete(c)
  }
  raf = comps.size ? requestAnimationFrame(loop) : 0
}

/** c = { frame(dt), render(), idle?() }. 다시 움직여야 할 때마다 호출한다 (중복 등록 없음) */
export function animate(c) {
  comps.add(c)
  if (!raf) {
    last = performance.now()
    raf = requestAnimationFrame(loop)
  }
}

export function stop(c) {
  comps.delete(c)
}
