<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

// Flowstate 스타일 WebGL 유체(Ink-in-Water) 배경
// 모바일에서는 해상도를 자동 경량화(SIM 112 / DYE 256)해 부드러운 60fps를 유지하고,
// 대화가 시작되면(dimmed=true) 스크림을 짙게 눌러 텍스트 가독성을 확보한다.
defineProps({
  dimmed: { type: Boolean, default: false },
})

const canvasEl = ref(null)
const webglFailed = ref(false)
let destroyFn = null

function startFluidSimulation(canvas) {
  canvas.width = canvas.clientWidth || window.innerWidth
  canvas.height = canvas.clientHeight || window.innerHeight

  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768
  const config = {
    SIM_RESOLUTION: mobile ? 112 : 200,
    DYE_RESOLUTION: mobile ? 256 : 512,
    DENSITY_DISSIPATION: 0.958,
    VELOCITY_DISSIPATION: 0.96,
    PRESSURE_DISSIPATION: 0.8,
    PRESSURE_ITERATIONS: mobile ? 14 : 20,
    CURL: 42,
    SPLAT_RADIUS: 0.22,
    SHADING: !mobile,
    COLORFUL: true,
    PAUSED: false,
    BACK_COLOR: { r: 4, g: 5, b: 12 },
    TRANSPARENT: false,
  }

  function pointerPrototype() {
    this.id = -1
    this.x = 0
    this.y = 0
    this.dx = 0
    this.dy = 0
    this.down = false
    this.moved = false
    this.everMoved = false
    this.color = [30, 0, 300]
  }

  const pointers = [new pointerPrototype()]
  const splatStack = []

  const ctxObj = getWebGLContext(canvas)
  if (!ctxObj || !ctxObj.gl || !ctxObj.ext.formatRGBA) {
    return null
  }
  const { gl, ext } = ctxObj
  if (!ext.supportLinearFiltering) config.SHADING = false

  function getWebGLContext(c) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false }
    let g = c.getContext('webgl2', params)
    const isWebGL2 = !!g
    if (!isWebGL2) g = c.getContext('webgl', params) || c.getContext('experimental-webgl', params)
    if (!g) return null

    let halfFloat
    let supportLinearFiltering
    if (isWebGL2) {
      g.getExtension('EXT_color_buffer_float')
      supportLinearFiltering = g.getExtension('OES_texture_float_linear')
    } else {
      halfFloat = g.getExtension('OES_texture_half_float')
      supportLinearFiltering = g.getExtension('OES_texture_half_float_linear')
      if (!halfFloat) return null
    }

    g.clearColor(0.0, 0.0, 0.0, 1.0)
    const halfFloatTexType = isWebGL2 ? g.HALF_FLOAT : halfFloat.HALF_FLOAT_OES
    let formatRGBA, formatRG, formatR
    if (isWebGL2) {
      formatRGBA = getSupportedFormat(g, g.RGBA16F, g.RGBA, halfFloatTexType)
      formatRG = getSupportedFormat(g, g.RG16F, g.RG, halfFloatTexType)
      formatR = getSupportedFormat(g, g.R16F, g.RED, halfFloatTexType)
    } else {
      formatRGBA = getSupportedFormat(g, g.RGBA, g.RGBA, halfFloatTexType)
      formatRG = formatRGBA
      formatR = formatRGBA
    }
    return { gl: g, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering } }
  }

  function getSupportedFormat(g, internalFormat, format, type) {
    if (!supportRenderTextureFormat(g, internalFormat, format, type)) {
      if (internalFormat === g.R16F) return getSupportedFormat(g, g.RG16F, g.RG, type)
      if (internalFormat === g.RG16F) return getSupportedFormat(g, g.RGBA16F, g.RGBA, type)
      return null
    }
    return { internalFormat, format }
  }

  function supportRenderTextureFormat(g, internalFormat, format, type) {
    const texture = g.createTexture()
    g.bindTexture(g.TEXTURE_2D, texture)
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST)
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST)
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE)
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE)
    g.texImage2D(g.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null)
    const fbo = g.createFramebuffer()
    g.bindFramebuffer(g.FRAMEBUFFER, fbo)
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, texture, 0)
    return g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE
  }

  class GLProgram {
    constructor(vs, fs) {
      this.uniforms = {}
      this.program = gl.createProgram()
      gl.attachShader(this.program, vs)
      gl.attachShader(this.program, fs)
      gl.linkProgram(this.program)
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw gl.getProgramInfoLog(this.program)
      const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS)
      for (let i = 0; i < count; i++) {
        const name = gl.getActiveUniform(this.program, i).name
        this.uniforms[name] = gl.getUniformLocation(this.program, name)
      }
    }
    bind() {
      gl.useProgram(this.program)
    }
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(shader)
    return shader
  }

  const baseVS = compileShader(gl.VERTEX_SHADER, `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0); vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y); vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `)
  const clearFS = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value;
    void main () { gl_FragColor = value * texture2D(uTexture, vUv); }
  `)
  const colorFS = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; uniform vec4 color;
    void main () { gl_FragColor = color; }
  `)
  const displayFS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; uniform sampler2D uTexture;
    void main () { vec3 C = texture2D(uTexture, vUv).rgb; gl_FragColor = vec4(C, max(C.r, max(C.g, C.b))); }
  `)
  const displayShadingFS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uTexture; uniform vec2 texelSize;
    void main () {
      vec3 L = texture2D(uTexture, vL).rgb; vec3 R = texture2D(uTexture, vR).rgb;
      vec3 T = texture2D(uTexture, vT).rgb; vec3 B = texture2D(uTexture, vB).rgb;
      vec3 C = texture2D(uTexture, vUv).rgb;
      float dx = length(R) - length(L); float dy = length(T) - length(B);
      vec3 n = normalize(vec3(dx, dy, length(texelSize)));
      C *= clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
      gl_FragColor = vec4(C, max(C.r, max(C.g, C.b)));
    }
  `)
  const splatFS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio;
    uniform vec3 color; uniform vec2 point; uniform float radius;
    void main () {
      vec2 p = vUv - point.xy; p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);
    }
  `)
  const advectionFS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource;
    uniform vec2 texelSize; uniform float dt; uniform float dissipation;
    void main () {
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      gl_FragColor = vec4((dissipation * texture2D(uSource, coord)).rgb, 1.0);
    }
  `)
  const advectionManualFS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource;
    uniform vec2 texelSize; uniform vec2 dyeTexelSize; uniform float dt; uniform float dissipation;
    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st = uv / tsize - 0.5; vec2 iuv = floor(st); vec2 fuv = fract(st);
      vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
      vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
      vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
      vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
      return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }
    void main () {
      vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
      gl_FragColor = vec4((dissipation * bilerp(uSource, coord, dyeTexelSize)).rgb, 1.0);
    }
  `)
  const divergenceFS = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x; float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y; float B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x;
      if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
      gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }
  `)
  const curlFS = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y; float R = texture2D(uVelocity, vR).y;
      float T = texture2D(uVelocity, vT).x; float B = texture2D(uVelocity, vB).x;
      gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
    }
  `)
  const vorticityFS = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
    void main () {
      float L = texture2D(uCurl, vL).x; float R = texture2D(uCurl, vR).x;
      float T = texture2D(uCurl, vT).x; float B = texture2D(uCurl, vB).x;
      float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001; force *= curl * C; force.y *= -1.0;
      gl_FragColor = vec4(texture2D(uVelocity, vUv).xy + force * dt, 0.0, 1.0);
    }
  `)
  const pressureFS = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uPressure; uniform sampler2D uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;
      float div = texture2D(uDivergence, vUv).x;
      gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
    }
  `)
  const gradientSubtractFS = compileShader(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uPressure; uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x; float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x; float B = texture2D(uPressure, vB).x;
      vec2 vel = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
      gl_FragColor = vec4(vel, 0.0, 1.0);
    }
  `)

  const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(0)
    return (dest) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dest)
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
    }
  })()

  const clearProg = new GLProgram(baseVS, clearFS)
  const colorProg = new GLProgram(baseVS, colorFS)
  const displayProg = new GLProgram(baseVS, displayFS)
  const displayShadingProg = new GLProgram(baseVS, displayShadingFS)
  const splatProg = new GLProgram(baseVS, splatFS)
  const advProg = new GLProgram(baseVS, ext.supportLinearFiltering ? advectionFS : advectionManualFS)
  const divProg = new GLProgram(baseVS, divergenceFS)
  const curlProg = new GLProgram(baseVS, curlFS)
  const vortProg = new GLProgram(baseVS, vorticityFS)
  const pressProg = new GLProgram(baseVS, pressureFS)
  const gradProg = new GLProgram(baseVS, gradientSubtractFS)

  let simW, simH, dyeW, dyeH, density, velocity, divergence, curl, pressure

  function createFBO(w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0)
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null)
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.viewport(0, 0, w, h)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return {
      texture, fbo, width: w, height: h,
      attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id },
    }
  }

  function createDoubleFBO(w, h, iF, f, t, p) {
    let f1 = createFBO(w, h, iF, f, t, p)
    let f2 = createFBO(w, h, iF, f, t, p)
    return { get read() { return f1 }, set read(v) { f1 = v }, get write() { return f2 }, set write(v) { f2 = v }, swap() { const tmp = f1; f1 = f2; f2 = tmp } }
  }

  function getResolution(res) {
    let ar = gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight)
    if (ar < 1) ar = 1.0 / ar
    const max = Math.round(res * ar), min = Math.round(res)
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max }
  }

  function initFramebuffers() {
    const sr = getResolution(config.SIM_RESOLUTION)
    const dr = getResolution(config.DYE_RESOLUTION)
    simW = sr.width; simH = sr.height; dyeW = dr.width; dyeH = dr.height
    const t = ext.halfFloatTexType
    const filt = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST
    density = createDoubleFBO(dyeW, dyeH, ext.formatRGBA.internalFormat, ext.formatRGBA.format, t, filt)
    velocity = createDoubleFBO(simW, simH, ext.formatRG.internalFormat, ext.formatRG.format, t, filt)
    divergence = createFBO(simW, simH, ext.formatR.internalFormat, ext.formatR.format, t, gl.NEAREST)
    curl = createFBO(simW, simH, ext.formatR.internalFormat, ext.formatR.format, t, gl.NEAREST)
    pressure = createDoubleFBO(simW, simH, ext.formatR.internalFormat, ext.formatR.format, t, gl.NEAREST)
  }

  function HSVtoRGB(h, s, v) {
    const i = Math.floor(h * 6), f = h * 6 - i
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
    let r = 0, g = 0, b = 0
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break
      case 1: r = q; g = v; b = p; break
      case 2: r = p; g = v; b = t; break
      case 3: r = p; g = q; b = v; break
      case 4: r = t; g = p; b = v; break
      case 5: r = v; g = p; b = q; break
    }
    return { r, g, b }
  }

  function generateColor() {
    const c = HSVtoRGB(0.5 + Math.random() * 0.42, 0.95, 1.0)
    c.r *= 0.92; c.g *= 0.92; c.b *= 0.92
    return c
  }

  function splat(x, y, dx, dy, color) {
    gl.viewport(0, 0, simW, simH)
    splatProg.bind()
    gl.uniform1i(splatProg.uniforms.uTarget, velocity.read.attach(0))
    gl.uniform1f(splatProg.uniforms.aspectRatio, canvas.width / Math.max(1, canvas.height))
    gl.uniform2f(splatProg.uniforms.point, x / Math.max(1, canvas.width), 1.0 - y / Math.max(1, canvas.height))
    gl.uniform3f(splatProg.uniforms.color, dx, -dy, 1.0)
    gl.uniform1f(splatProg.uniforms.radius, config.SPLAT_RADIUS / 100.0)
    blit(velocity.write.fbo); velocity.swap()

    gl.viewport(0, 0, dyeW, dyeH)
    gl.uniform1i(splatProg.uniforms.uTarget, density.read.attach(0))
    gl.uniform3f(splatProg.uniforms.color, color.r, color.g, color.b)
    blit(density.write.fbo); density.swap()
  }

  function multipleSplats(amount) {
    for (let i = 0; i < amount; i++) {
      const c = generateColor()
      c.r *= 10; c.g *= 10; c.b *= 10
      splat(canvas.width * Math.random(), canvas.height * Math.random(), 1000 * (Math.random() - 0.5), 1000 * (Math.random() - 0.5), c)
    }
  }

  initFramebuffers()
  multipleSplats(mobile ? 22 : 34)
  for (let i = 0; i < (mobile ? 5 : 8); i++) splatStack.push(8 + Math.floor(Math.random() * 8))

  let lastColorTime = Date.now()
  let virtualSeeded = false
  let orbitAngle = 0
  let vPrevX = 0, vPrevY = 0
  let virtualColor = null
  let lastVColor = 0
  const startTime = Date.now()
  let rafId = 0
  let destroyed = false

  function driveVirtual() {
    if (Date.now() - startTime < 700) return
    const cx = canvas.width / 2, cy = canvas.height / 2
    const base = Math.min(280, canvas.width * 0.36, canvas.height * 0.34)
    const r = base * (0.72 + 0.28 * Math.sin(orbitAngle * 0.37))
    orbitAngle += 0.024
    const x = cx + Math.cos(orbitAngle) * r
    const y = cy + Math.sin(orbitAngle) * r
    if (!virtualSeeded) { virtualSeeded = true; vPrevX = x; vPrevY = y; return }
    if (!virtualColor || Date.now() - lastVColor > 140) {
      virtualColor = generateColor()
      virtualColor.r *= 3.0; virtualColor.g *= 3.0; virtualColor.b *= 3.0
      lastVColor = Date.now()
    }
    splat(x, y, (x - vPrevX) * 8.5, (y - vPrevY) * 8.5, virtualColor)
    vPrevX = x; vPrevY = y
  }

  function step(dt) {
    gl.disable(gl.BLEND)
    gl.viewport(0, 0, simW, simH)
    curlProg.bind()
    gl.uniform2f(curlProg.uniforms.texelSize, 1 / simW, 1 / simH)
    gl.uniform1i(curlProg.uniforms.uVelocity, velocity.read.attach(0))
    blit(curl.fbo)

    vortProg.bind()
    gl.uniform2f(vortProg.uniforms.texelSize, 1 / simW, 1 / simH)
    gl.uniform1i(vortProg.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(vortProg.uniforms.uCurl, curl.attach(1))
    gl.uniform1f(vortProg.uniforms.curl, config.CURL)
    gl.uniform1f(vortProg.uniforms.dt, dt)
    blit(velocity.write.fbo); velocity.swap()

    divProg.bind()
    gl.uniform2f(divProg.uniforms.texelSize, 1 / simW, 1 / simH)
    gl.uniform1i(divProg.uniforms.uVelocity, velocity.read.attach(0))
    blit(divergence.fbo)

    clearProg.bind()
    gl.uniform1i(clearProg.uniforms.uTexture, pressure.read.attach(0))
    gl.uniform1f(clearProg.uniforms.value, config.PRESSURE_DISSIPATION)
    blit(pressure.write.fbo); pressure.swap()

    pressProg.bind()
    gl.uniform2f(pressProg.uniforms.texelSize, 1 / simW, 1 / simH)
    gl.uniform1i(pressProg.uniforms.uDivergence, divergence.attach(0))
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressProg.uniforms.uPressure, pressure.read.attach(1))
      blit(pressure.write.fbo); pressure.swap()
    }

    gradProg.bind()
    gl.uniform2f(gradProg.uniforms.texelSize, 1 / simW, 1 / simH)
    gl.uniform1i(gradProg.uniforms.uPressure, pressure.read.attach(0))
    gl.uniform1i(gradProg.uniforms.uVelocity, velocity.read.attach(1))
    blit(velocity.write.fbo); velocity.swap()

    advProg.bind()
    gl.uniform2f(advProg.uniforms.texelSize, 1 / simW, 1 / simH)
    if (!ext.supportLinearFiltering) gl.uniform2f(advProg.uniforms.dyeTexelSize, 1 / simW, 1 / simH)
    const vId = velocity.read.attach(0)
    gl.uniform1i(advProg.uniforms.uVelocity, vId)
    gl.uniform1i(advProg.uniforms.uSource, vId)
    gl.uniform1f(advProg.uniforms.dt, dt)
    gl.uniform1f(advProg.uniforms.dissipation, config.VELOCITY_DISSIPATION)
    blit(velocity.write.fbo); velocity.swap()

    gl.viewport(0, 0, dyeW, dyeH)
    if (!ext.supportLinearFiltering) gl.uniform2f(advProg.uniforms.dyeTexelSize, 1 / dyeW, 1 / dyeH)
    gl.uniform1i(advProg.uniforms.uVelocity, velocity.read.attach(0))
    gl.uniform1i(advProg.uniforms.uSource, density.read.attach(1))
    gl.uniform1f(advProg.uniforms.dissipation, config.DENSITY_DISSIPATION)
    blit(density.write.fbo); density.swap()
  }

  function render() {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.enable(gl.BLEND)
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight
    gl.viewport(0, 0, w, h)
    colorProg.bind()
    const bc = config.BACK_COLOR
    gl.uniform4f(colorProg.uniforms.color, bc.r / 255, bc.g / 255, bc.b / 255, 1)
    blit(null)

    const prog = config.SHADING ? displayShadingProg : displayProg
    prog.bind()
    if (config.SHADING) gl.uniform2f(prog.uniforms.texelSize, 1 / w, 1 / h)
    gl.uniform1i(prog.uniforms.uTexture, density.read.attach(0))
    blit(null)
  }

  function update() {
    if (destroyed) return
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        canvas.width = canvas.clientWidth
        canvas.height = canvas.clientHeight
        initFramebuffers()
      }
    }
    driveVirtual()
    if (splatStack.length) multipleSplats(splatStack.pop())
    for (const p of pointers) {
      if (p.moved) { splat(p.x, p.y, p.dx, p.dy, p.color); p.moved = false }
    }
    if (Date.now() - lastColorTime > 120) {
      lastColorTime = Date.now()
      for (const p of pointers) p.color = generateColor()
    }
    step(0.016)
    render()
    rafId = requestAnimationFrame(update)
  }

  const teardown = []
  const on = (t, ev, fn, opts) => { t.addEventListener(ev, fn, opts); teardown.push(() => t.removeEventListener(ev, fn, opts)) }
  const pos = (cx, cy) => { const r = canvas.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top } }

  on(window, 'mousemove', (e) => {
    const { x, y } = pos(e.clientX, e.clientY)
    const p = pointers[0]
    if (!p.everMoved) { p.everMoved = true; p.x = x; p.y = y; return }
    p.moved = true; p.dx = (x - p.x) * 5; p.dy = (y - p.y) * 5; p.x = x; p.y = y; p.color = generateColor()
  }, { passive: true })

  on(window, 'touchstart', (e) => {
    for (let i = 0; i < e.targetTouches.length; i++) {
      if (i >= pointers.length) pointers.push(new pointerPrototype())
      const p = pointers[i], { x, y } = pos(e.targetTouches[i].clientX, e.targetTouches[i].clientY)
      p.x = x; p.y = y; p.everMoved = true; p.color = generateColor()
    }
  }, { passive: true })

  on(window, 'touchmove', (e) => {
    for (let i = 0; i < e.targetTouches.length; i++) {
      if (i >= pointers.length) pointers.push(new pointerPrototype())
      const p = pointers[i], { x, y } = pos(e.targetTouches[i].clientX, e.targetTouches[i].clientY)
      p.moved = p.everMoved; p.everMoved = true
      p.dx = (x - p.x) * 7; p.dy = (y - p.y) * 7; p.x = x; p.y = y
    }
  }, { passive: true })

  update()
  return () => {
    destroyed = true
    if (rafId) cancelAnimationFrame(rafId)
    for (const off of teardown) off()
  }
}

onMounted(() => {
  try {
    if (canvasEl.value) destroyFn = startFluidSimulation(canvasEl.value)
    if (!destroyFn) webglFailed.value = true
  } catch {
    webglFailed.value = true
  }
})

onBeforeUnmount(() => {
  destroyFn?.()
})
</script>

<template>
  <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#04050c]" aria-hidden="true">
    <canvas v-if="!webglFailed" ref="canvasEl" class="block size-full" />
    <div
      v-else
      class="size-full"
      style="background: radial-gradient(80% 60% at 30% 30%, rgba(56,189,248,0.28), transparent 60%), radial-gradient(75% 55% at 75% 65%, rgba(192,38,211,0.26), transparent 60%), #04050c"
    />
    <!-- Flowstate 방사형 스크림: 대화 시작 시 짙게 눌러 한글 가독성 확보 -->
    <div
      class="absolute inset-0 transition-opacity duration-500"
      :style="{
        background: dimmed
          ? 'radial-gradient(115% 95% at 50% 46%, rgba(4,5,12,0.84) 0%, rgba(4,5,12,0.78) 45%, rgba(4,5,12,0.68) 100%)'
          : 'radial-gradient(115% 95% at 50% 46%, rgba(4,5,12,0.68) 0%, rgba(4,5,12,0.68) 24%, rgba(4,5,12,0.46) 52%, rgba(4,5,12,0.14) 100%)',
      }"
    />
  </div>
</template>
