// fullscreen webgl background: slowly diffusing color fields behind the page content.
// renders at reduced resolution (upscaling gives free softness), pauses when the tab
// is hidden, freezes to a single frame when the user prefers reduced motion, and
// cross-fades palettes when the serene theme toggle flips body.dark.
(function () {
  'use strict';

  // palettes as [r, g, b] in 0..1; bg should match --bg-color in _custom_css.html
  var PALETTES = {
    light: {
      bg: [0.980, 0.976, 0.969],       // #faf9f7
      c1: [0.341, 0.451, 0.722],       // deep blue #5773b8
      c2: [0.690, 0.600, 0.251],       // deep gold #b09940
      c3: [0.690, 0.510, 0.278],       // deep tan #b08247
      c4: [0.729, 0.439, 0.529],       // deep rose #ba7087
      c5: [0.490, 0.671, 0.549],       // deep sage #7dab8c
      intensity: 0.55,
    },
    dark: {
      bg: [0.086, 0.086, 0.118],       // #16161e
      c1: [0.435, 0.561, 0.820],       // blue #6f8fd1
      c2: [0.820, 0.749, 0.435],       // gold #d1bf6f
      c3: [0.820, 0.651, 0.435],       // tan #d1a66f
      c4: [0.851, 0.541, 0.651],       // rose #d98aa6
      c5: [0.498, 0.788, 0.651],       // mint #7fc9a6
      intensity: 0.45,
    },
  };

  var VERT = [
    'attribute vec2 a_pos;',
    'void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }',
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec2 u_res;',
    'uniform float u_time;',
    'uniform vec3 u_bg;',
    'uniform vec3 u_c1;',
    'uniform vec3 u_c2;',
    'uniform vec3 u_c3;',
    'uniform vec3 u_c4;',
    'uniform vec3 u_c5;',
    'uniform float u_intensity;',
    'uniform vec2 u_pointer;',
    'uniform float u_pstrength;',
    '// xy: position in uv, z: age 0..1, w: fading strength',
    'uniform vec4 u_drops[8];',
    '// persistent ink stain layer, written by the sim pass each frame',
    'uniform sampler2D u_ink;',
    '// device tilt in eased, normalized units; zero on non-mobile',
    'uniform vec2 u_tilt;',
    '',
    '// ashima 2d simplex noise',
    'vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }',
    'float snoise(vec2 v) {',
    '  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);',
    '  vec2 i = floor(v + dot(v, C.yy));',
    '  vec2 x0 = v - i + dot(i, C.xx);',
    '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);',
    '  vec4 x12 = x0.xyxy + C.xxzz;',
    '  x12.xy -= i1;',
    '  i = mod(i, 289.0);',
    '  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));',
    '  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);',
    '  m = m * m; m = m * m;',
    '  vec3 x = 2.0 * fract(p * C.www) - 1.0;',
    '  vec3 h = abs(x) - 0.5;',
    '  vec3 ox = floor(x + 0.5);',
    '  vec3 a0 = x - ox;',
    '  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);',
    '  vec3 g;',
    '  g.x = a0.x * x0.x + h.x * x0.y;',
    '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;',
    '  return 130.0 * dot(m, g);',
    '}',
    '',
    'float fbm(vec2 p) {',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  // 2 octaves: this only feeds warp offsets, where the finest octave',
    '  // is invisible; also keeps the field smooth and blobby',
    '  for (int i = 0; i < 2; i++) {',
    '    v += a * snoise(p);',
    '    p = p * 2.03 + vec2(13.7, 7.1);',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    '',
    'float fbm5(vec2 p) {',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  // one extra octave over the base fbm: a hint of detail, still blobby',
    '  for (int i = 0; i < 4; i++) {',
    '    v += a * snoise(p);',
    '    p = p * 2.07 + vec2(4.2, 8.9);',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    '',
    '// pow(x, 5.0) is a log2/exp2 pair on gpus; multiplies are cheaper',
    'float pow5(float x) { float x2 = x * x; return x2 * x2 * x; }',
    '',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  vec2 aspect = vec2(u_res.x / u_res.y, 1.0);',
    '  // 1 on light backgrounds, 0 on dark; picks the blend model and keys',
    '  // per-mode effects, so it is needed before any of them',
    '  float paper = smoothstep(0.45, 0.75, dot(u_bg, vec3(0.299, 0.587, 0.114)));',
    '  // low base frequency: fewer, larger color blobs',
    '  vec2 p = uv * aspect * 0.45;',
    '  // tilting the phone pans the field for a soft parallax',
    '  p += u_tilt;',
    '  float t = u_time * 0.008;',
    '',
    '  // pointer influence: gaussian falloff around the cursor',
    '  vec2 pv = (uv - u_pointer) * aspect;',
    '  float infl = u_pstrength * exp(-dot(pv, pv) * 18.0);',
    '  // stir the noise domain around the cursor so colors swirl in its wake',
    '  p += vec2(-pv.y, pv.x) * infl * 0.5;',
    '',
    '  // ink drops: tapped splashes spread outward and dissolve. each is a',
    '  // soft disc plus a traveling rim that also pushes the field radially',
    '  float ink = 0.0;',
    '  for (int i = 0; i < 8; i++) {',
    '    vec4 d = u_drops[i];',
    '    if (d.w < 0.001) continue;',
    '    vec2 dv = (uv - d.xy) * aspect;',
    '    float dist = length(dv);',
    '    float radius = 0.02 + 0.12 * sqrt(d.z);',
    '    float rd = (dist - radius) * 14.0;',
    '    float rim = exp(-rd * rd);',
    '    // rim only: a filled disc at the tap point read as a colored circle',
    '    ink += d.w * 0.7 * rim;',
    '    p += normalize(dv + vec2(1e-4)) * rim * d.w * 0.06;',
    '  }',
    '',
    '  // gentle in-place swirl: radial phase wobble so the field churns',
    '  // instead of only drifting sideways',
    '  p += 0.05 * sin(vec2(0.29, 0.23) * u_time * 0.06 + length(p) * vec2(3.3, 4.1));',
    '',
    '  // double domain warp (iquilezles.org/articles/warp): q displaces p,',
    '  // r folds the displaced field again, f carries the fine filaments',
    '  vec2 q = vec2(fbm(p + t * 0.40), fbm(p + vec2(5.2, 1.3) - t * 0.30));',
    '  q += 0.05 * sin(vec2(0.11, 0.17) * u_time * 0.06 + length(q) * 1.7);',
    '  vec2 r = vec2(fbm(p + 2.2 * q + vec2(1.7, 9.2) + t * 0.15),',
    '                fbm(p + 2.2 * q + vec2(8.3, 2.8) - t * 0.12));',
    '  float f = 0.5 + 0.5 * fbm5(p * 1.0 + 2.2 * r);',
    '  // gentle contrast keyed on warp strength; kept low to stay blobby',
    '  f = mix(f, f * f * f, 0.3 * abs(r.x));',
    '',
    '  // competitive per-color weights: each hue keys on its own field',
    '  // component and pow() lets one color dominate per region, so pools',
    '  // stay saturated instead of averaging all five into grey-brown mud',
    '  // pow(5) makes the leading hue near-fully saturated in its region, so',
    '  // rose/sage/tan pools pass the chroma gate instead of dimming as',
    '  // half-mud blends. blue keeps a small bias against the 3 warm hues,',
    '  // reduced since sharper competition amplifies it',
    '  float w1 = 1.6 * pow5(0.5 + 0.5 * r.x);',
    '  float w2 = pow5(0.5 - 0.5 * r.x);',
    '  float w3 = pow5(0.5 + 0.5 * q.x);',
    '  float w4 = pow5(0.5 + 0.5 * r.y);',
    '  float w5 = pow5(0.5 + 0.5 * q.y);',
    '  vec3 accent = (u_c1 * w1 + u_c2 * w2 + u_c3 * w3 + u_c4 * w4 + u_c5 * w5)',
    '              / max(w1 + w2 + w3 + w4 + w5, 1e-4);',
    '',
    '  // tapped ink stains override the ambient hue where they sit. rgb is',
    '  // premultiplied by density in the sim, so un-premultiply to composite',
    '  vec4 inkT = texture2D(u_ink, uv);',
    '  // gate on density: at near-zero alpha the un-premultiply amplifies',
    '  // byte quantization into a white halo around the stain edge',
    '  float dens = smoothstep(0.03, 0.3, inkT.a);',
    '  vec3 inkCol = clamp(inkT.rgb / max(inkT.a, 1e-3), 0.0, 1.0);',
    '  // light paper only: in dark the stain acts through the base dye alone,',
    '  // otherwise the half-blended accent opens the glow gate in an off-hue',
    '  // (rose plus grey ambient reads magenta)',
    '  accent = mix(accent, inkCol, dens * 0.5 * paper);',
    '',
    '  float sheen = 0.5;',
    '#ifdef HAS_DERIV',
    '  // pseudo-lighting from the field gradient gives the smoke a silk sheen;',
    '  // applied to the final color below so it survives tint normalization',
    '  vec3 nor = normalize(vec3(dFdx(f) * u_res.x, 16.0, dFdy(f) * u_res.y));',
    '  sheen = clamp(0.35 + 0.65 * dot(nor, normalize(vec3(0.8, 0.4, -0.5))), 0.0, 1.0);',
    '#endif',
    '',
    '  // keep the center column calm for legibility, let edges glow more',
    '  float edge = smoothstep(0.10, 0.75, distance(uv, vec2(0.5, 0.5)));',
    '  float amt = u_intensity * (0.55 + 0.45 * f);',
    '  amt *= mix(0.5, 1.0, edge);',
    '  // color blooms under the cursor, even inside the calm center zone',
    '  // every interaction brightening is light-mode only; dark interactions',
    '  // ripple as darkness on the base instead (see darkBase below)',
    '  amt = min(amt + (infl * 0.05 + ink * 0.1 + dens * 0.2) * paper, 0.65);',
    '',
    '  // dark bg: plain mix. light bg: multiply a normalized "ink" tint over',
    '  // the paper white, which keeps saturation instead of greying midway.',
    '  // paper weight comes from bg luminance so theme cross-fades stay smooth',
    '  vec3 tint = accent / max(max(accent.r, max(accent.g, accent.b)), 1e-3);',
    '  // fade the ink where the accent blend goes muddy (e.g. blue-gold',
    '  // midpoints): boundaries lighten toward paper instead of printing grey',
    '  float chroma = length(accent - vec3(dot(accent, vec3(0.3333))));',
    '  vec3 inked = u_bg * mix(vec3(1.0), tint, amt * smoothstep(0.0, 0.14, chroma));',
    '  // dark mirrors the light structure: where light has white paper spots,',
    '  // dark keeps calm near-black; color arrives as soft pastelized light',
    '  // added on top instead of a busy full-field mix',
    '  // the base itself breathes: the quietest field zones sink to true',
    '  // black, mirroring the brightest paper spots in light mode',
    '  // ramp spans the whole field range: most of the frame sits below the',
    '  // nominal bg brightness, with only the strongest zones reaching it',
    '  vec3 darkBase = u_bg * smoothstep(0.0, 1.0, f);',
    '  // tap splashes ripple as darkness in dark mode, not as light; the',
    '  // persistent stain is a light-mode effect only',
    '  darkBase *= 1.0 - clamp(ink, 0.0, 1.0) * 0.55;',
    '  // the same chroma gate that fades muddy ink to white paper in light',
    '  // mode: the 5-color blend is grey-brown across most of the field, and',
    '  // glowing that mud is what made dark a grey mess. mud goes dark and',
    '  // only genuinely-hued regions emit colored light',
    '  // wide gate and sub-quadratic falloff: pools bleed gradually into the',
    '  // dark the way light mode colors dissolve into white paper',
    '  float glowChroma = smoothstep(0.0, 0.25, chroma);',
    '  float g = pow(amt, 1.4) * glowChroma;',
    '  // milky rims: weak glow leans toward a warm candlelit cream while',
    '  // cores stay vivid accent, echoing how light mode colors emerge from',
    '  // white. the cream scales with g, so it is a dim fringe, never a haze',
    '  vec3 glowCol = mix(vec3(0.92, 0.84, 0.72), accent, smoothstep(0.02, 0.16, g));',
    '  vec3 glowed = darkBase + glowCol * g * 1.9;',
    '  vec3 col = mix(glowed, inked, paper);',
    '  // sheen scaled by amt so bare background stays flat behind text; kept',
    '  // low everywhere, the full-strength version churned dark mode',
    '  col *= 1.0 + (sheen - 0.5) * 0.2 * amt * mix(0.35, 0.15, paper);',
    '  // slight grain hides banding in the smooth gradients',
    '  float grain = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;',
    '  gl_FragColor = vec4(col + grain * 1.5, 1.0);',
    '}',
  ].join('\n');

  // sim pass for the persistent ink layer: advect along a cheap noise flow,
  // blur a little, decay, then splat any new taps as premultiplied color
  var SIMFRAG = [
    'precision mediump float;',
    'uniform sampler2D u_prev;',
    'uniform vec2 u_simres;',
    'uniform float u_dt;',
    'uniform float u_time;',
    'uniform vec2 u_aspect;',
    '// xy: pos in uv, z: radius, w: amount (zero when slot inactive)',
    'uniform vec4 u_splat[8];',
    'uniform vec3 u_splatcol[8];',
    '// tilt-derived gravity so ink drains downhill on a tilted phone',
    'uniform vec2 u_grav;',
    '',
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vnoise(vec2 p) {',
    '  vec2 i = floor(p);',
    '  vec2 f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float a = mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x);',
    '  float b = mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x);',
    '  return mix(a, b, f.y) * 2.0 - 1.0;',
    '}',
    '',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_simres;',
    '  // gentle noise flow drags the ink into tendrils over time',
    '  vec2 pp = uv * u_aspect * 2.0;',
    '  vec2 vel = vec2(vnoise(pp + u_time * 0.03),',
    '                  vnoise(pp + vec2(4.7, 2.9) - u_time * 0.02));',
    '  vel += u_grav * 2.0;',
    '  vec4 col = texture2D(u_prev, uv - vel * 0.035 * u_dt);',
    '  // mild diffusion softens edges as the ink spreads',
    '  vec2 px = 1.0 / u_simres;',
    '  col = col * 0.6 + 0.1 * (',
    '    texture2D(u_prev, uv + vec2(px.x, 0.0)) + texture2D(u_prev, uv - vec2(px.x, 0.0)) +',
    '    texture2D(u_prev, uv + vec2(0.0, px.y)) + texture2D(u_prev, uv - vec2(0.0, px.y)));',
    '  // multiplicative fade plus a small linear cut so byte textures',
    '  // actually reach zero instead of ghosting forever',
    '  col *= 0.988;',
    '  col = max(col - 0.0015, 0.0);',
    '  for (int i = 0; i < 8; i++) {',
    '    vec4 s = u_splat[i];',
    '    if (s.w < 0.001) continue;',
    '    vec2 dv = (uv - s.xy) * u_aspect;',
    '    float g = s.w * exp(-dot(dv, dv) / (s.z * s.z));',
    '    col.rgb += u_splatcol[i] * g;',
    '    col.a += g;',
    '  }',
    '  gl_FragColor = clamp(col, 0.0, 1.0);',
    '}',
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('bg-shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function init() {
    // perf triage switches: ?bg=off (no canvas at all), ?bg=static (render
    // one frame then freeze), ?bg=debug (normal, log fps and renderer)
    var bgMode = new URLSearchParams(location.search).get('bg');
    if (bgMode === 'off') return;

    var canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    // alpha true is faster in safari (rgb8 buffers need blend patching);
    // the shader writes alpha 1.0 so the canvas stays opaque either way
    var gl = canvas.getContext('webgl', {
      antialias: false, alpha: true, depth: false, stencil: false,
    });
    if (!gl) return;

    // derivatives power the sheen lighting; degrade gracefully without them
    var deriv = gl.getExtension('OES_standard_derivatives');
    var header = deriv
      ? '#extension GL_OES_standard_derivatives : enable\n#define HAS_DERIV 1\n'
      : '';
    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, header + FRAG);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var u = {
      res: gl.getUniformLocation(prog, 'u_res'),
      time: gl.getUniformLocation(prog, 'u_time'),
      bg: gl.getUniformLocation(prog, 'u_bg'),
      c1: gl.getUniformLocation(prog, 'u_c1'),
      c2: gl.getUniformLocation(prog, 'u_c2'),
      c3: gl.getUniformLocation(prog, 'u_c3'),
      c4: gl.getUniformLocation(prog, 'u_c4'),
      c5: gl.getUniformLocation(prog, 'u_c5'),
      intensity: gl.getUniformLocation(prog, 'u_intensity'),
      pointer: gl.getUniformLocation(prog, 'u_pointer'),
      pstrength: gl.getUniformLocation(prog, 'u_pstrength'),
      drops: gl.getUniformLocation(prog, 'u_drops'),
      ink: gl.getUniformLocation(prog, 'u_ink'),
      tilt: gl.getUniformLocation(prog, 'u_tilt'),
    };
    gl.uniform1i(u.ink, 0);

    // fallback 1x1 transparent texture: an unbound sampler reads alpha 1,
    // which would flood the page with ink if the sim failed to init
    var blankInk = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, blankInk);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    // ink layer: two ping-pong framebuffers; each frame reads one, writes the
    // other. fixed low res is plenty since the ink is soft by nature
    var SIM_RES = 256;
    var simProg = null;
    var simU = null;
    var inkTex = [];
    var inkFbo = [];
    var inkRead = 0;
    var pendingSplats = [];
    var splatData = new Float32Array(32);
    var splatColData = new Float32Array(24);
    (function initInk() {
      var sfs = compile(gl, gl.FRAGMENT_SHADER, SIMFRAG);
      if (!sfs) return;
      var p2 = gl.createProgram();
      gl.attachShader(p2, vs);
      gl.attachShader(p2, sfs);
      gl.linkProgram(p2);
      if (!gl.getProgramParameter(p2, gl.LINK_STATUS)) return;
      for (var i = 0; i < 2; i++) {
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIM_RES, SIM_RES, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        var fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        inkTex.push(tex);
        inkFbo.push(fbo);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      var aloc = gl.getAttribLocation(p2, 'a_pos');
      gl.enableVertexAttribArray(aloc);
      gl.vertexAttribPointer(aloc, 2, gl.FLOAT, false, 0, 0);
      simProg = p2;
      simU = {
        prev: gl.getUniformLocation(p2, 'u_prev'),
        simres: gl.getUniformLocation(p2, 'u_simres'),
        dt: gl.getUniformLocation(p2, 'u_dt'),
        time: gl.getUniformLocation(p2, 'u_time'),
        aspect: gl.getUniformLocation(p2, 'u_aspect'),
        splat: gl.getUniformLocation(p2, 'u_splat'),
        splatcol: gl.getUniformLocation(p2, 'u_splatcol'),
        grav: gl.getUniformLocation(p2, 'u_grav'),
      };
    })();

    document.body.prepend(canvas);
    document.body.classList.add('has-bg-canvas');

    // scroll runway for ios safari: chrome only goes translucent when the page
    // is scrolled, so keep scrollY pinned past a hidden 160px runway (see the
    // matching body.has-runway rule in _custom_css.html)
    var RUNWAY = 160;
    if (window.matchMedia('(max-width: 760px) and (pointer: coarse)').matches) {
      document.body.classList.add('has-runway');
      if (window.scrollY < RUNWAY) window.scrollTo(0, RUNWAY);
      if (document.body.classList.contains('homepage')) {
        // the homepage fits one screen, so block panning entirely. the settle
        // logic below still runs here: ios can move scroll without a gesture
        // (status bar tap-to-top, rotation, scroll restoration), and without
        // re-pinning, scrollY=0 would flatten the chrome permanently
        document.addEventListener('touchmove', function (e) {
          if (e.touches.length === 1) e.preventDefault();
        }, { passive: false });
      }
      {
        // never fight the compositor mid-gesture: ios scroll events are async
        // and stale, so corrections during momentum cause jitter. native
        // scrolling (including its rubber band) runs free; only once scrolling
        // has truly ended do we ease back out of the 160/160px runway zones
        var BOTTOM_RUNWAY = 160;
        var settleAnim;
        var animating = false;

        var bounds = function () {
          var hi = Math.max(RUNWAY,
            document.documentElement.scrollHeight - window.innerHeight - BOTTOM_RUNWAY);
          return { lo: RUNWAY, hi: hi };
        };

        var settleTo = function (target) {
          cancelAnimationFrame(settleAnim);
          var from = window.scrollY;
          var dist = target - from;
          if (Math.abs(dist) < 1) return;
          var t0 = performance.now();
          animating = true;
          var step = function (now) {
            var t = Math.min(1, (now - t0) / 450);
            var e = 1 - Math.pow(1 - t, 3);
            window.scrollTo(0, Math.round(from + dist * e));
            if (t < 1) settleAnim = requestAnimationFrame(step);
            else animating = false;
          };
          settleAnim = requestAnimationFrame(step);
        };

        var onScrollSettled = function () {
          if (animating) return;
          var b = bounds();
          var y = window.scrollY;
          if (y < b.lo) settleTo(b.lo);
          else if (y > b.hi) settleTo(b.hi);
        };

        // safari 26.2+ fires scrollend once when scrolling definitively ends;
        // older browsers fall back to a scroll-quiet debounce
        if ('onscrollend' in window) {
          window.addEventListener('scrollend', onScrollSettled);
        } else {
          var settleTimer;
          window.addEventListener('scroll', function () {
            if (animating) return;
            clearTimeout(settleTimer);
            settleTimer = setTimeout(onScrollSettled, 150);
          }, { passive: true });
        }

        window.addEventListener('touchstart', function () {
          cancelAnimationFrame(settleAnim);
          animating = false;
        }, { passive: true });

        onScrollSettled();
      }
    }

    // render at a fraction of device resolution, with an absolute pixel cap:
    // a ratio alone let 6k displays reach ~3.8MP per frame
    var RENDER_SCALE = 0.4;
    var MAX_PIXELS = 1200000;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = canvas.clientWidth * dpr * RENDER_SCALE;
      var h = canvas.clientHeight * dpr * RENDER_SCALE;
      var over = (w * h) / MAX_PIXELS;
      if (over > 1) {
        var s = Math.sqrt(over);
        w /= s;
        h /= s;
      }
      w = Math.max(1, Math.round(w));
      h = Math.max(1, Math.round(h));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        needsRender = true;
      }
    }


    function targetPalette() {
      return document.body.classList.contains('dark') ? PALETTES.dark : PALETTES.light;
    }

    // html bg is only a fallback for overscroll; ios 26 falls back to white if
    // the root is fully transparent. no theme-color meta: safari 26 ignores it,
    // and older safari would paint opaque bars with it instead of translucency
    function syncChrome() {
      var bg = targetPalette().bg;
      var hex = '#' + bg.map(function (v) {
        return ('0' + Math.round(v * 255).toString(16)).slice(-2);
      }).join('');
      document.documentElement.style.backgroundColor = hex;
    }
    syncChrome();

    // current palette state, eased toward the active theme's palette each frame
    var cur = JSON.parse(JSON.stringify(targetPalette()));
    var needsRender = true;
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    new MutationObserver(function () { needsRender = true; syncChrome(); })
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', resize);

    // pointer state: x/y trail behind the real cursor, kick spikes on movement
    // and decays, so fast strokes stir harder than a resting hover
    var pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, s: 0, kick: 0, active: false };
    // client coords must map through the canvas geometry, not the window:
    // on mobile the canvas bleeds 100px above the viewport (top: -100px in
    // _custom_css.html) and 160px below; desktop has no bleed
    var BLEED_TOP = window.matchMedia('(max-width: 760px) and (pointer: coarse)').matches ? 100 : 0;
    function toUvX(clientX) { return clientX / canvas.clientWidth; }
    function toUvY(clientY) { return 1 - (clientY + BLEED_TOP) / canvas.clientHeight; }
    window.addEventListener('pointermove', function (e) {
      pointer.tx = toUvX(e.clientX);
      pointer.ty = toUvY(e.clientY); // gl has y up
      pointer.kick = 1;
      pointer.active = true;
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () {
      pointer.active = false;
    });

    // ink drops: a tap or click splashes a spreading, dissolving drop
    var DROP_LIFE = 3500;
    // sim pass only runs while stains can still be alive (see frame loop)
    var inkUntil = 0;
    var drops = [];
    var dropData = new Float32Array(32);
    var dropHue = 0;
    // resume splashes saved by the previous page (ages are stored relative,
    // since performance.now() restarts on every navigation)
    try {
      var savedDrops = JSON.parse(sessionStorage.getItem('bg-shader-drops') || '[]');
      var nowR = performance.now();
      savedDrops.forEach(function (d) {
        if (d.age < DROP_LIFE && drops.length < 8) {
          drops.push({ x: d.x, y: d.y, t0: nowR - d.age });
        }
      });
      sessionStorage.removeItem('bg-shader-drops');
    } catch (err) {}
    window.addEventListener('pointerdown', function (e) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var ux = toUvX(e.clientX);
      var uy = toUvY(e.clientY);
      if (drops.length >= 8) drops.shift();
      drops.push({ x: ux, y: uy, t0: performance.now() });
      // stain color cycles through the current palette, one hue per tap
      var cols = [cur.c1, cur.c2, cur.c3, cur.c4, cur.c5];
      var c = cols[dropHue++ % 5];
      if (pendingSplats.length < 8) {
        pendingSplats.push({ x: ux, y: uy, color: [c[0], c[1], c[2]], t0: performance.now() });
      }
      inkUntil = performance.now() + 15000;
    }, { passive: true });

    // device tilt: pans the field and drains the ink downhill. needs a secure
    // context (silently inert over plain http) and, on ios, a permission
    // dialog that must come from a user gesture, so the first tap requests it
    var tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    function onOrient(e) {
      if (e.gamma == null || e.beta == null) return;
      // gamma is left/right tilt, beta front/back; ~45 degrees is a natural
      // holding angle so treat it as neutral
      tilt.tx = Math.max(-1, Math.min(1, e.gamma / 30));
      tilt.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    }
    var needsMotionPermission = typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function';
    if (needsMotionPermission) {
      window.addEventListener('pointerdown', function req() {
        window.removeEventListener('pointerdown', req);
        DeviceOrientationEvent.requestPermission().then(function (state) {
          if (state === 'granted') window.addEventListener('deviceorientation', onOrient);
        }).catch(function () {});
      });
    } else if (typeof DeviceOrientationEvent !== 'undefined') {
      window.addEventListener('deviceorientation', onOrient);
    }

    function ease(a, b, k) {
      var settled = true;
      for (var i = 0; i < a.length; i++) {
        a[i] += (b[i] - a[i]) * k;
        if (Math.abs(b[i] - a[i]) > 0.002) settled = false;
      }
      return settled;
    }

    // resume the field clock from the previous page: the pattern is a pure
    // function of time, so carrying the clock across navigations makes the
    // background continuous instead of snapping back to its t=0 state
    var savedT = parseFloat(sessionStorage.getItem('bg-shader-t') || '0');
    var start = performance.now() - savedT * 1000;
    window.addEventListener('pagehide', function () {
      var nowP = performance.now();
      sessionStorage.setItem('bg-shader-t', String((nowP - start) / 1000));
      // active splashes carry over so a tap on a link keeps rippling on the
      // next page instead of being cut off by the navigation
      sessionStorage.setItem('bg-shader-drops', JSON.stringify(drops.map(function (d) {
        return { x: d.x, y: d.y, age: nowP - d.t0 };
      })));
    });
    var last = performance.now();
    var paletteSettled = true;
    // measure the display's vsync interval from early raf deltas so high
    // refresh screens get matching tiers (120hz -> 120/60, 60hz -> 60/30)
    var vsyncMs = 16.7;
    var vsyncSamples = [];
    var lastRaf = 0;
    function frame(now) {
      rafId = requestAnimationFrame(frame);
      if (document.hidden) return;
      if (lastRaf && vsyncSamples.length < 30) {
        var d = now - lastRaf;
        // filter out pauses and jank; keep plausible vsync deltas only
        if (d > 3 && d < 45) vsyncSamples.push(d);
        if (vsyncSamples.length === 30) {
          vsyncSamples.sort(function (a, b) { return a - b; });
          vsyncMs = vsyncSamples[15];
        }
      }
      lastRaf = now;
      // adaptive cadence: full refresh rate while anything is interacting,
      // half rate for the ambient drift. every canvas frame makes safari
      // re-blur each glass backdrop above it, so frames are the currency
      var interacting = pointer.s > 0.02 || drops.length > 0 ||
        now < inkUntil || !paletteSettled;
      if (now - last < (interacting ? vsyncMs - 2 : vsyncMs * 2 - 2)) return;
      // resize is event-driven: reading clientWidth here forced a layout
      // flush on every frame

      var dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      var tgt = targetPalette();
      var k = Math.min(1, dt * 4);
      var settled = true;
      settled = ease(cur.bg, tgt.bg, k) && settled;
      settled = ease(cur.c1, tgt.c1, k) && settled;
      settled = ease(cur.c2, tgt.c2, k) && settled;
      settled = ease(cur.c3, tgt.c3, k) && settled;
      settled = ease(cur.c4, tgt.c4, k) && settled;
      settled = ease(cur.c5, tgt.c5, k) && settled;
      cur.intensity += (tgt.intensity - cur.intensity) * k;
      if (!settled) needsRender = true;
      paletteSettled = settled;

      // trailing pointer ease; interaction is motion, so it stays off under reduced motion
      var pk = Math.min(1, dt * 5);
      pointer.x += (pointer.tx - pointer.x) * pk;
      pointer.y += (pointer.ty - pointer.y) * pk;
      pointer.kick *= Math.exp(-2.5 * dt);
      var baseline = pointer.active ? 0.15 : 0;
      var starget = reducedMotion.matches ? 0 : Math.max(baseline, pointer.kick);
      pointer.s += (starget - pointer.s) * Math.min(1, dt * 3);

      // slow tilt ease so the parallax feels like liquid settling, not a gyro
      var tk = Math.min(1, dt * 2);
      tilt.x += ((reducedMotion.matches ? 0 : tilt.tx) - tilt.x) * tk;
      tilt.y += ((reducedMotion.matches ? 0 : tilt.ty) - tilt.y) * tk;

      // with reduced motion the field is static, so skip drawing once settled
      if (reducedMotion.matches && !needsRender) return;
      needsRender = false;

      var t = reducedMotion.matches ? 0 : (now - start) / 1000;

      // ink sim pass: advect and decay the stain layer, splat new taps.
      // skipped entirely once the last stain has fully decayed; the final
      // written texture stays bound and holds zeros
      if (simProg && (pendingSplats.length > 0 || now < inkUntil)) {
        gl.useProgram(simProg);
        gl.bindFramebuffer(gl.FRAMEBUFFER, inkFbo[1 - inkRead]);
        gl.viewport(0, 0, SIM_RES, SIM_RES);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inkTex[inkRead]);
        gl.uniform1i(simU.prev, 0);
        gl.uniform2f(simU.simres, SIM_RES, SIM_RES);
        gl.uniform1f(simU.dt, dt);
        gl.uniform1f(simU.time, (now - start) / 1000);
        gl.uniform2f(simU.aspect, canvas.width / canvas.height, 1);
        // uv y is up, so tilting the top away drains ink down the screen
        gl.uniform2f(simU.grav, tilt.x, -tilt.y);
        splatData.fill(0);
        splatColData.fill(0);
        // deposit each stain over ~350ms instead of one frame, so the dot
        // soaks in gradually while the diffusion already spreads it
        var SPLAT_MS = 350;
        for (var si = 0; si < pendingSplats.length && si < 8; si++) {
          var sp = pendingSplats[si];
          if (now - sp.t0 > SPLAT_MS) continue;
          splatData[si * 4] = sp.x;
          splatData[si * 4 + 1] = sp.y;
          splatData[si * 4 + 2] = 0.07;
          splatData[si * 4 + 3] = 0.35 * (dt * 1000) / SPLAT_MS;
          splatColData[si * 3] = sp.color[0];
          splatColData[si * 3 + 1] = sp.color[1];
          splatColData[si * 3 + 2] = sp.color[2];
        }
        for (var sj = pendingSplats.length - 1; sj >= 0; sj--) {
          if (now - pendingSplats[sj].t0 > SPLAT_MS) pendingSplats.splice(sj, 1);
        }
        gl.uniform4fv(simU.splat, splatData);
        gl.uniform3fv(simU.splatcol, splatColData);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        inkRead = 1 - inkRead;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(prog);
        gl.bindTexture(gl.TEXTURE_2D, inkTex[inkRead]);
        gl.viewport(0, 0, canvas.width, canvas.height);
      }

      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, t);
      gl.uniform3fv(u.bg, cur.bg);
      gl.uniform3fv(u.c1, cur.c1);
      gl.uniform3fv(u.c2, cur.c2);
      gl.uniform3fv(u.c3, cur.c3);
      gl.uniform3fv(u.c4, cur.c4);
      gl.uniform3fv(u.c5, cur.c5);
      gl.uniform1f(u.intensity, cur.intensity);
      gl.uniform2f(u.pointer, pointer.x, pointer.y);
      gl.uniform1f(u.pstrength, pointer.s);
      gl.uniform2f(u.tilt, tilt.x * 0.15, tilt.y * 0.15);
      for (var di = drops.length - 1; di >= 0; di--) {
        if (now - drops[di].t0 > DROP_LIFE) drops.splice(di, 1);
      }
      dropData.fill(0);
      for (var dj = 0; dj < drops.length; dj++) {
        var age = (now - drops[dj].t0) / DROP_LIFE;
        // ease-in attack over ~250ms: full strength on frame one made the
        // ring and its field warp snap on abruptly
        var a = Math.min(1, age / 0.07);
        dropData[dj * 4] = drops[dj].x;
        dropData[dj * 4 + 1] = drops[dj].y;
        dropData[dj * 4 + 2] = age;
        dropData[dj * 4 + 3] = Math.pow(1 - age, 1.6) * a * a * (3 - 2 * a);
      }
      gl.uniform4fv(u.drops, dropData);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (bgMode === 'debug') {
        drawCount++;
        if (now - fpsWindowStart > 2000) {
          console.log('[bg-shader] fps', (drawCount / ((now - fpsWindowStart) / 1000)).toFixed(1),
            '| buffer', canvas.width + 'x' + canvas.height);
          drawCount = 0;
          fpsWindowStart = now;
        }
      }
    }
    var drawCount = 0;
    var fpsWindowStart = performance.now();
    if (bgMode === 'debug') {
      var dbgExt = gl.getExtension('WEBGL_debug_renderer_info');
      console.log('[bg-shader] renderer:',
        gl.getParameter(dbgExt ? dbgExt.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        '| buffer:', canvas.width + 'x' + canvas.height);
    }

    // fully stop the loop when the tab is hidden or the window loses focus:
    // a visible-but-unfocused window would otherwise render (and force glass
    // re-blurs) indefinitely
    var rafId = 0;
    var running = false;
    function startLoop() {
      if (running) return;
      running = true;
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
    function stopLoop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopLoop(); else startLoop();
    });
    resize();
    // desktop only: mobile fires blur for in-page reasons (keyboards, etc)
    if (window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('blur', stopLoop);
      window.addEventListener('focus', startLoop);
    }
    startLoop();
    // static mode: a few frames to settle, then freeze the canvas entirely
    if (bgMode === 'static') setTimeout(stopLoop, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
