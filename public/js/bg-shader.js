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
      c1: [0.435, 0.561, 0.820],       // blue #6f8fd1
      c2: [0.820, 0.749, 0.435],       // gold #d1bf6f
      c3: [0.820, 0.651, 0.435],       // tan #d1a66f
      intensity: 0.30,
    },
    dark: {
      bg: [0.086, 0.086, 0.118],       // #16161e
      c1: [0.435, 0.561, 0.820],       // blue #6f8fd1
      c2: [0.615, 0.562, 0.326],       // gold #d1bf6f at ~75%
      c3: [0.615, 0.488, 0.326],       // tan #d1a66f at ~75%
      intensity: 0.26,
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
    'uniform float u_intensity;',
    'uniform vec2 u_pointer;',
    'uniform float u_pstrength;',
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
    '  // fewer octaves keeps the field smooth and blobby instead of wispy',
    '  for (int i = 0; i < 3; i++) {',
    '    v += a * snoise(p);',
    '    p = p * 2.03 + vec2(13.7, 7.1);',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    '',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_res;',
    '  vec2 aspect = vec2(u_res.x / u_res.y, 1.0);',
    '  // low base frequency: fewer, larger color blobs',
    '  vec2 p = uv * aspect * 0.45;',
    '  float t = u_time * 0.03;',
    '',
    '  // pointer influence: gaussian falloff around the cursor',
    '  vec2 pv = (uv - u_pointer) * aspect;',
    '  float infl = u_pstrength * exp(-dot(pv, pv) * 18.0);',
    '  // stir the noise domain around the cursor so colors swirl in its wake',
    '  p += vec2(-pv.y, pv.x) * infl * 0.5;',
    '',
    '  // domain warping: q and r push the base field around so colors "diffuse"',
    '  vec2 q = vec2(fbm(p + t * 0.30), fbm(p + vec2(5.2, 1.3) - t * 0.20));',
    '  vec2 r = vec2(fbm(p + 2.0 * q + vec2(1.7, 9.2) + t * 0.15),',
    '                fbm(p + 2.0 * q + vec2(8.3, 2.8) - t * 0.12));',
    '  float f = fbm(p + 2.5 * r);',
    '',
    '  float n1 = 0.5 + 0.5 * f;',
    '  float n2 = 0.5 + 0.5 * fbm(p * 1.3 + r + vec2(3.1, 7.7) + t * 0.10);',
    '  float n3 = 0.5 + 0.5 * fbm(p * 0.8 - q + vec2(9.4, 4.2) - t * 0.08);',
    '',
    '  // sharpen weights a little so hues form distinct pools instead of grey mush',
    '  n1 = pow(n1, 3.0); n2 = pow(n2, 3.0); n3 = pow(n3, 3.0);',
    '  vec3 accent = (u_c1 * n1 + u_c2 * n2 + u_c3 * n3) / max(n1 + n2 + n3, 1e-4);',
    '',
    '  // keep the center column calm for legibility, let edges glow more',
    '  float edge = smoothstep(0.10, 0.75, distance(uv, vec2(0.5, 0.5)));',
    '  float amt = u_intensity * (0.35 + 0.65 * smoothstep(-0.4, 0.6, f));',
    '  amt *= mix(0.35, 1.0, edge);',
    '  // color blooms under the cursor, even inside the calm center zone',
    '  amt = min(amt + infl * 0.05, 0.5);',
    '',
    '  vec3 col = mix(u_bg, accent, amt);',
    '  // slight grain hides banding in the smooth gradients',
    '  float grain = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;',
    '  gl_FragColor = vec4(col + grain * 4.0, 1.0);',
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
    var canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    var gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false });
    if (!gl) return;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
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
      intensity: gl.getUniformLocation(prog, 'u_intensity'),
      pointer: gl.getUniformLocation(prog, 'u_pointer'),
      pstrength: gl.getUniformLocation(prog, 'u_pstrength'),
    };

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
        // the homepage fits one screen, so block panning entirely; the pinned
        // scrollY=160 from the runway survives, which is all safari needs to
        // keep its chrome translucent
        document.addEventListener('touchmove', function (e) {
          if (e.touches.length === 1) e.preventDefault();
        }, { passive: false });
      } else {
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

    // render at a fraction of device resolution; the field is soft so nobody can tell
    var RENDER_SCALE = 0.5;
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr * RENDER_SCALE));
      var h = Math.max(1, Math.round(canvas.clientHeight * dpr * RENDER_SCALE));
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
    window.addEventListener('pointermove', function (e) {
      pointer.tx = e.clientX / window.innerWidth;
      pointer.ty = 1 - e.clientY / window.innerHeight; // gl has y up
      pointer.kick = 1;
      pointer.active = true;
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () {
      pointer.active = false;
    });

    function ease(a, b, k) {
      var settled = true;
      for (var i = 0; i < a.length; i++) {
        a[i] += (b[i] - a[i]) * k;
        if (Math.abs(b[i] - a[i]) > 0.002) settled = false;
      }
      return settled;
    }

    var start = performance.now();
    var last = start;
    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden) return;
      resize();

      var dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      var tgt = targetPalette();
      var k = Math.min(1, dt * 4);
      var settled = true;
      settled = ease(cur.bg, tgt.bg, k) && settled;
      settled = ease(cur.c1, tgt.c1, k) && settled;
      settled = ease(cur.c2, tgt.c2, k) && settled;
      settled = ease(cur.c3, tgt.c3, k) && settled;
      cur.intensity += (tgt.intensity - cur.intensity) * k;
      if (!settled) needsRender = true;

      // trailing pointer ease; interaction is motion, so it stays off under reduced motion
      var pk = Math.min(1, dt * 5);
      pointer.x += (pointer.tx - pointer.x) * pk;
      pointer.y += (pointer.ty - pointer.y) * pk;
      pointer.kick *= Math.exp(-2.5 * dt);
      var baseline = pointer.active ? 0.15 : 0;
      var starget = reducedMotion.matches ? 0 : Math.max(baseline, pointer.kick);
      pointer.s += (starget - pointer.s) * Math.min(1, dt * 3);

      // with reduced motion the field is static, so skip drawing once settled
      if (reducedMotion.matches && !needsRender) return;
      needsRender = false;

      var t = reducedMotion.matches ? 0 : (now - start) / 1000;
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, t);
      gl.uniform3fv(u.bg, cur.bg);
      gl.uniform3fv(u.c1, cur.c1);
      gl.uniform3fv(u.c2, cur.c2);
      gl.uniform3fv(u.c3, cur.c3);
      gl.uniform1f(u.intensity, cur.intensity);
      gl.uniform2f(u.pointer, pointer.x, pointer.y);
      gl.uniform1f(u.pstrength, pointer.s);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
