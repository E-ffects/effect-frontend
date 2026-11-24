<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { animate, clamp, prefersReducedMotion as reduce, stop } from '@/lib/spring'

// RMA 구체: DesignBookmark "Thinking Sphere"(thinking-sphere/sphere.js)를 Vue로 옮겼다. WebGL2, 의존성 없음.
// - 점 1,600개가 숨 쉬는 구체로 돌다가, 곡선을 따라 날아가 "RMA" 글자를 왼쪽부터 쓴다 (점마다 스프링 72 11, 살짝 넘쳤다 자리 잡음)
// - 가만두면 혼자 반복한다(구체 3.2초 → 글자 2.4초). 끌면 관성으로 돌고, 마우스를 올리면 기울며 근처 점이 비켜난다
// - 누르면(끌지 않고) 점이 RMA로 모인 뒤 activate 이벤트 → 패널이 대화를 시작한다
// 색은 캔버스의 글자색(회색 #5f6673)을 따른다
const props = defineProps({ word: { type: String, default: 'RMA' } })
const emit = defineEmits(['activate'])

const cv = ref(null)
const noGl = ref(false)
let cleanup = () => {}

onMounted(() => {
  const canvas = cv.value
  const lerp = (a, b, t) => a + (b - a) * t
  const Sp = (x, k, c) => ({ x, v: 0, t: x, k, c })
  const st = (s, dt) => {
    s.v += (-s.k * (s.x - s.t) - s.c * s.v) * dt
    s.x += s.v * dt
  }

  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false })
  if (!gl) {
    noGl.value = true
    return
  }

  const sh = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return s
  }
  const prog = gl.createProgram()
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `#version 300 es
in vec4 a; in float b; uniform vec2 uRes; out float vA; out float vS;
void main(){ vec2 c = a.xy/uRes*2. - 1.; gl_Position = vec4(c.x, -c.y, 0., 1.); gl_PointSize = a.z; vA = a.w; vS = max(b, 1.8/a.z); }`))
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float; in float vA; in float vS; uniform vec3 uCol; out vec4 o;
void main(){ float r = length(gl_PointCoord - .5)*2.; float e = (1. - smoothstep(1. - vS, 1., r))*vA; o = vec4(uCol*e, e); }`))
  gl.linkProgram(prog)
  const uRes = gl.getUniformLocation(prog, 'uRes')
  const uCol = gl.getUniformLocation(prog, 'uCol')

  const N = 1600
  const STRIDE = 5
  const buf = new Float32Array(N * STRIDE)
  const vbo = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, buf.byteLength, gl.DYNAMIC_DRAW)
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const la = gl.getAttribLocation(prog, 'a')
  const lb = gl.getAttribLocation(prog, 'b')
  gl.enableVertexAttribArray(la)
  gl.vertexAttribPointer(la, 4, gl.FLOAT, false, STRIDE * 4, 0)
  gl.enableVertexAttribArray(lb)
  gl.vertexAttribPointer(lb, 1, gl.FLOAT, false, STRIDE * 4, 16)
  gl.bindVertexArray(null)

  // 피보나치 구 위의 점
  const bx = new Float32Array(N), by = new Float32Array(N), bz = new Float32Array(N)
  const s = new Float32Array(N), v = new Float32Array(N), dl = new Float32Array(N), tx = new Float32Array(N), ty = new Float32Array(N)
  const jx = new Float32Array(N), jy = new Float32Array(N), sw = new Float32Array(N)
  const GA = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const th = GA * i
    bx[i] = Math.cos(th) * r
    by[i] = y
    bz[i] = Math.sin(th) * r
    jx[i] = (Math.random() - 0.5) * 70
    jy[i] = 40 + Math.random() * 60
    sw[i] = 0.7 + Math.random() * 0.6
  }

  let W = 0, H = 0, dpr = 1, minx = 0, maxx = 1
  // 글자를 그려 점마다 도착점을 하나씩 고른다
  function targets() {
    if (!W) return
    const o = document.createElement('canvas')
    o.width = Math.ceil(W)
    o.height = Math.ceil(H)
    const x = o.getContext('2d')
    const fs = Math.round(clamp(W * 0.24, 56, 96))
    x.fillStyle = 'white'
    x.font = `800 ${fs}px 'Pretendard Variable', Pretendard, system-ui, sans-serif`
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    if ('letterSpacing' in x) x.letterSpacing = `${-fs * 0.02}px`
    x.fillText(props.word, W / 2, H / 2 + 2)
    const img = x.getImageData(0, 0, o.width, o.height).data
    let list = []
    for (let g = 1.2; g < 4; g += 0.08) {
      // 점 수(N)에 들어가는 가장 촘촘한 격자: 글자가 또렷하고 고르게
      list = []
      for (let y = 0; y < o.height; y += g)
        for (let xx = 0; xx < o.width; xx += g) {
          const k = ((y | 0) * o.width + (xx | 0)) * 4 + 3
          if (img[k] > 140) list.push(xx, y)
        }
      if (list.length / 2 <= N) break
    }
    const M = list.length / 2
    if (!M) return
    const idx = Array.from({ length: M }, (_, i) => i)
    for (let i = M - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    minx = 1e9
    maxx = -1e9
    for (let i = 0; i < N; i++) {
      const k = idx[i % M]
      tx[i] = list[k * 2]
      ty[i] = list[k * 2 + 1]
      minx = Math.min(minx, tx[i])
      maxx = Math.max(maxx, tx[i])
    }
  }
  function resize() {
    const r = canvas.getBoundingClientRect()
    if (!r.width) return
    W = r.width
    H = r.height
    dpr = Math.min(2, devicePixelRatio || 1)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    targets()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()
  document.fonts?.ready.then(targets)

  let col = [1, 1, 1], colAt = -1
  const readCol = () => {
    const m = getComputedStyle(canvas).color.match(/[\d.]+/g)
    if (m) col = m.slice(0, 3).map((n) => +n / 255)
  }

  let t = 0, mode = 0, modeAt = -10, yaw = 0, yawV = 0.38, drag = null, hoverOn = false, mx = 0, my = 0, userAt = -100
  let activating = false
  const pitch = Sp(0.32, 90, 14), hx = Sp(0, 120, 16), hy = Sp(0, 120, 16), hov = Sp(0, 200, 26)
  function setMode(m) {
    mode = m
    modeAt = t
    const span = Math.max(1, maxx - minx)
    for (let i = 0; i < N; i++) dl[i] = m ? t + 0.12 + ((tx[i] - minx) / span) * 0.85 + Math.random() * 0.16 : t + Math.random() * 0.42
  }
  // 누르면: 글자로 모은 뒤 대화 시작 (글자가 거의 다 써질 때쯤)
  function activate() {
    if (activating) return
    activating = true
    userAt = t
    if (!mode) setMode(1)
    setTimeout(() => emit('activate'), reduce ? 0 : 1250)
  }
  const local = (e) => {
    const b = canvas.getBoundingClientRect()
    return [((e.clientX - b.left) * W) / b.width, ((e.clientY - b.top) * H) / b.height]
  }
  const onDown = (e) => {
    userAt = t
    canvas.setPointerCapture(e.pointerId)
    const [x, y] = local(e)
    drag = { x0: x, y0: y, x, y, t, moved: false, vx: 0 }
  }
  const onMove = (e) => {
    const [x, y] = local(e)
    mx = x
    my = y
    if (e.pointerType === 'mouse') hoverOn = true
    if (!drag) return
    const dx = x - drag.x, dy = y - drag.y, ddt = Math.max(1 / 240, t - drag.t)
    if (Math.hypot(x - drag.x0, y - drag.y0) > 6) drag.moved = true
    if (drag.moved) {
      yaw += dx * 0.011
      drag.vx = lerp(drag.vx, (dx * 0.011) / ddt, 0.5)
      yawV = drag.vx
      pitch.t = clamp(pitch.t + dy * 0.006, -0.6, 1.1)
    }
    drag.x = x
    drag.y = y
    drag.t = t
  }
  const onUp = () => {
    if (!drag) return
    if (!drag.moved) activate()
    else pitch.t = clamp(pitch.t, -0.2, 0.8)
    drag = null
    userAt = t
  }
  const onLeave = () => (hoverOn = false)
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate()
    }
  }
  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onUp)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('keydown', onKey)

  let wasAuto = false, aStart = 0
  function draw(dt) {
    if (!W) return
    // 가만두면 혼자 반복: 누르거나 끌면 멈추고, 8초 조용하면 다시
    const auto = !reduce && !activating && t - userAt > 8
    if (auto) {
      if (!wasAuto) {
        aStart = t
        if (mode) setMode(0)
      }
      const p = (t - aStart) % 7.6
      if (p > 3.2 && p < 5.6 && !mode) setMode(1)
      if ((p < 3.2 || p >= 5.6) && mode && t - modeAt > 1) setMode(0)
    }
    wasAuto = auto

    const base = reduce ? 0.06 : 0.38
    if (!drag) {
      yawV += (base - yawV) * (1 - Math.exp(-dt * 1.4))
      pitch.t += (0.32 - pitch.t) * (1 - Math.exp(-dt * 0.8))
    }
    yaw += yawV * dt
    const cx = W / 2, cy = H / 2, R = Math.min(92, W * 0.24, H * 0.3)
    hov.t = hoverOn && !drag ? 1 : 0
    st(hov, dt)
    hx.t = hoverOn ? clamp((mx - cx) / W, -0.5, 0.5) : 0
    hy.t = hoverOn ? clamp((my - cy) / H, -0.5, 0.5) : 0
    st(hx, dt)
    st(hy, dt)
    st(pitch, dt)
    const ry = yaw + hx.x * 0.5, rx = pitch.x + hy.x * 0.4
    const cyw = Math.cos(ry), syw = Math.sin(ry), cxp = Math.cos(rx), sxp = Math.sin(rx)
    const tt = reduce ? 0 : t, gb = reduce ? 0 : 0.025 * Math.sin(t * 1.7)
    const F = 520, zf = R * 0.75, k = 72, c = 11
    for (let i = 0; i < N; i++) {
      const px = bx[i], py = by[i], pz = bz[i]
      const nz =
        0.1 * Math.sin(px * 2.3 + tt * 0.9) * Math.sin(py * 2.9 - tt * 0.7 + 1.3) * Math.sin(pz * 2.1 + tt * 1.1 + 0.5) +
        0.018 * Math.sin(px * 5.1 - tt * 1.3 + py * 3.7)
      const r = R * (1 + nz + gb)
      let x = (px * cyw - pz * syw) * r, z = (px * syw + pz * cyw) * r, y = py * r
      const y2 = y * cxp - z * sxp
      z = y * sxp + z * cxp
      y = y2
      const sc = F / (F - z)
      let sx = cx + x * sc, sy = cy + y * sc
      const front = clamp((z / R + 1) / 2, 0, 1)
      if (hov.x > 0.01) {
        const dx = sx - mx, dy = sy - my, d = Math.hypot(dx, dy) + 0.001
        if (d < 64) {
          const f = (1 - d / 64) ** 2 * 18 * hov.x * (0.3 + 0.7 * front) * (1 - s[i])
          sx += (dx / d) * f
          sy += (dy / d) * f
        }
      }
      const blur = clamp(Math.abs(z - zf) / (R * 1.5), 0, 1)
      let size = (1.35 + 0.7 * front) * sc + blur * blur * 6.5
      let al = ((0.16 + 0.84 * front) * (1 - blur * 0.45)) / (1 + blur * blur * 2.2)
      let soft = blur
      const tg = t >= dl[i] ? mode : 1 - mode
      if (s[i] !== tg || v[i] !== 0) {
        const h = dt / 2
        for (let n = 0; n < 2; n++) {
          v[i] += (-k * (s[i] - tg) - c * v[i]) * h
          s[i] += v[i] * h
        }
        if (Math.abs(s[i] - tg) < 1e-4 && Math.abs(v[i]) < 1e-3) {
          s[i] = tg
          v[i] = 0
        }
      }
      let X = sx, Y = sy
      const u = clamp(s[i], 0, 1)
      if (s[i] > 0) {
        const ox = sx - cx, oy = sy - cy, ol = Math.hypot(ox, oy) + 0.001
        const p1x = sx - (oy / ol) * 80 * sw[i], p1y = sy + (ox / ol) * 80 * sw[i] - 20 // 회전 방향으로 휘었다가
        const p2x = tx[i] + jx[i], p2y = ty[i] - jy[i] // 글자 위에서 내려앉는다
        const e = 1 - u, b0 = e * e * e, b1 = 3 * e * e * u, b2 = 3 * e * u * u, b3 = u * u * u
        X = b0 * sx + b1 * p1x + b2 * p2x + b3 * tx[i]
        Y = b0 * sy + b1 * p1y + b2 * p2y + b3 * ty[i]
        if (s[i] > 1) {
          const o = (s[i] - 1) * 1.2
          X += (tx[i] - p2x) * o
          Y += (ty[i] - p2y) * o
        }
        const fly = Math.sin(u * Math.PI)
        size = lerp(size, 2.1, u) + fly * 0.6
        al = lerp(al, 1, u)
        soft = lerp(soft, 0, Math.min(1, u * 1.6))
      }
      const q = i * STRIDE
      buf[q] = X * dpr
      buf[q + 1] = Y * dpr
      buf[q + 2] = size * dpr
      buf[q + 3] = clamp(al, 0, 1)
      buf[q + 4] = soft * 0.85
    }
    if (t - colAt > 0.25) {
      readCol()
      colAt = t
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(prog)
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf)
    gl.uniform2f(uRes, canvas.width, canvas.height)
    gl.uniform3f(uCol, col[0], col[1], col[2])
    gl.drawArrays(gl.POINTS, 0, N)
  }

  // 공용 루프에 올린다. 화면에 안 보이면(패널 접힘·스크롤) 쉰다
  let acc = 0
  const loop = {
    frame(dt) {
      acc += dt
    },
    render() {
      if (acc <= 0) return
      const dt = Math.min(acc, 0.05)
      acc = 0
      t += dt
      draw(dt)
    },
    idle: () => false,
  }
  const io = new IntersectionObserver(([en]) => (en.isIntersecting ? animate(loop) : stop(loop)))
  io.observe(canvas)

  cleanup = () => {
    stop(loop)
    io.disconnect()
    ro.disconnect()
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', onUp)
    canvas.removeEventListener('pointercancel', onUp)
    canvas.removeEventListener('pointerleave', onLeave)
    canvas.removeEventListener('keydown', onKey)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
})
onBeforeUnmount(() => cleanup())
</script>

<template>
  <button v-if="noGl" type="button" class="grid size-full place-items-center text-[56px] font-extrabold tracking-[-0.02em] text-[#5f6673]" @click="emit('activate')">
    {{ word }}
  </button>
  <canvas
    v-else
    ref="cv"
    tabindex="0"
    role="button"
    :aria-label="`${word} 어시스턴트와 대화 시작. 누르면 대화가 열리고, 끌면 돌아갑니다`"
    class="block size-full cursor-grab touch-none rounded-2xl text-[#5f6673] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary/50 active:cursor-grabbing"
  />
</template>
