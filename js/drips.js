/* MORF — живые капли краски с букв (WebGL-metaballs).
   Буквы шрифта Rubik Wet Paint рисуются в маску; из нижних кромок букв растут капли:
   набухают на кромке, медленно тянутся вниз, иногда отрываются и падают (перемычка рвётся сама — smooth-min),
   остальные висят и медленно втягиваются обратно. Объём: купол по расстоянию до края + свет сверху-слева + блик.
   Текст в DOM остаётся (доступность, вёрстка); когда WebGL готов, он прозрачный, канвас поверх рисует те же буквы.
   Нет WebGL / потеря контекста → виден обычный текст со шрифтовыми потёками.
   prefers-reduced-motion → один статичный кадр (капли висят, не двигаются).
   Канвас анимируется только пока элемент на экране и вкладка видна. */
(function () {
  'use strict';
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MAXD = 12;

  function rng(seed) { var s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  function hash(str) { var h = 7; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 1000003; return h + 11; }
  function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }

  /* ---------- геометрия и маска ---------- */
  function prepare(el, o) {
    o = o || {};
    var cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
    var rg = document.createRange(); rg.selectNodeContents(el);
    var tr = rg.getBoundingClientRect(), er = el.getBoundingClientRect();
    if (!tr.width || !er.width) return null;
    var text = el.textContent.replace(/\s+/g, ' ').trim();
    var font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + fs + 'px ' + cs.fontFamily;
    var mc = document.createElement('canvas').getContext('2d');
    mc.font = font;
    var mt = mc.measureText(text);
    var fA = mt.fontBoundingBoxAscent, fD = mt.fontBoundingBoxDescent;
    if (!(fA > 0)) { fA = tr.height * 0.8; fD = tr.height * 0.2; }
    var padX = Math.round(fs * 0.12), padT = Math.round(fs * 0.06), room = Math.round(fs * (o.room || 0.95));
    var cssW = Math.ceil(tr.width + padX * 2), cssH = Math.ceil(tr.height + padT + room);
    var dpr = Math.min(window.devicePixelRatio || 1, o.maxDpr || 2), s = dpr;
    if (cssW * cssH * s * s > 1.3e6) s = Math.sqrt(1.3e6 / (cssW * cssH));
    var W = Math.round(cssW * s), H = Math.round(cssH * s);
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    c.scale(s, s); c.font = font; c.fillStyle = '#fff'; c.textBaseline = 'alphabetic';
    var base = padT + (tr.height - (fA + fD)) / 2 + fA;
    c.fillText(text, padX, base);
    var id = c.getImageData(0, 0, W, H), px = id.data, n = W * H, A = new Uint8Array(n), i;
    for (i = 0; i < n; i++) A[i] = px[i * 4 + 3];
    /* точное поле расстояний до края буквы (TinySDF: EDT Фельзенцвальба с субпиксельной кромкой);
       дырки букв (R, O) не залипают, в отличие от размытия. Код: G = 0.5 + sd/(2·R), sd>0 внутри. */
    var R = Math.max(3, Math.round(fs * s * 0.12)), SD = sdf(A, W, H);
    for (i = 0; i < n; i++) {
      var g = 0.5 + SD[i] / (2 * R); /* SD > 0 внутри буквы */
      g = g <= 0 ? 0 : g >= 1 ? 65535 : Math.round(g * 65535); /* 16 бит: G — старший байт, B — младший (иначе нормали полосят) */
      px[i * 4] = A[i]; px[i * 4 + 1] = g >> 8; px[i * 4 + 2] = g & 255; px[i * 4 + 3] = 255;
    }
    return { el: el, fs: fs, s: s, W: W, H: H, cssW: cssW, cssH: cssH, R: R, A: A, tex: id,
      left: tr.left - er.left - padX + el.clientLeft * 0, top: tr.top - er.top - padT, base: base * s, text: text,
      fadeFrom: (padT + tr.height + room * 0.45) * s, anchors: anchors(A, W, H, fs * s, base * s, o, text) };
  }
  var INF = 1e20;
  function edt1(g, off, st, len, f, v, z) {
    var q, k = 0, s, r;
    v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = g[off];
    for (q = 1; q < len; q++) {
      f[q] = g[off + q * st];
      do { r = v[k]; s = (f[q] - f[r] + q * q - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    for (q = 0, k = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      r = v[k]; g[off + q * st] = f[r] + (q - r) * (q - r);
    }
  }
  function edt(g, W, H) {
    var m = Math.max(W, H), f = new Float64Array(m), v = new Uint16Array(m), z = new Float64Array(m + 1), x, y;
    for (x = 0; x < W; x++) edt1(g, x, W, H, f, v, z);
    for (y = 0; y < H; y++) edt1(g, y * W, 1, W, f, v, z);
  }
  function sdf(A, W, H) {
    var n = W * H, go = new Float64Array(n), gi = new Float64Array(n), i, a, d;
    for (i = 0; i < n; i++) {
      a = A[i] / 255;
      if (a >= 1) { go[i] = INF; gi[i] = 0; } else if (a <= 0) { go[i] = 0; gi[i] = INF; }
      else { d = 0.5 - a; go[i] = d > 0 ? d * d : 0; gi[i] = d < 0 ? d * d : 0; }
    }
    edt(go, W, H); edt(gi, W, H);
    var out = new Float32Array(n);
    for (i = 0; i < n; i++) out[i] = Math.sqrt(go[i]) - Math.sqrt(gi[i]);
    return out;
  }
  /* точки, откуда растут капли: самые нижние места кромок букв (кончики шрифтовых потёков и низ штрихов) */
  function anchors(A, W, H, F, base, o, text) {
    var bot = new Int32Array(W), x, y, k;
    for (x = 0; x < W; x++) { bot[x] = -1; for (y = H - 1; y >= 0; y--) if (A[y * W + x] > 140) { bot[x] = y; break; } }
    var win = Math.max(2, Math.round(F * 0.05)), cand = [];
    for (x = 0; x < W; x++) {
      var b = bot[x]; if (b < base - F * 0.16) continue;
      var ok = true; for (k = -win; k <= win && ok; k++) { var xx = x + k; if (xx >= 0 && xx < W && bot[xx] > b) ok = false; }
      if (!ok) continue;
      var e = x; while (e + 1 < W && bot[e + 1] === b) e++;
      var cx = Math.round((x + e) / 2), yy = Math.max(0, b - Math.round(F * 0.035)), l = cx, r = cx;
      while (l > 0 && A[yy * W + l - 1] > 140) l--;
      while (r < W - 1 && A[yy * W + r + 1] > 140) r++;
      cand.push({ x: cx, y: b, hw: (r - l + 1) / 2 }); x = e;
    }
    var R = rng(hash(text + (o.seed || ''))), out = [], gap = F * 0.15;
    for (k = cand.length - 1; k > 0; k--) { var j = Math.floor(R() * (k + 1)), t = cand[k]; cand[k] = cand[j]; cand[j] = t; }
    /* сначала — кончики настоящих потёков шрифта (ниже базовой линии), потом низ штрихов */
    cand.sort(function (a, b) { return (b.y > base + F * 0.02) - (a.y > base + F * 0.02); });
    var maxN = Math.min(MAXD, o.max || Math.max(3, Math.round(W / (F * 0.42))));
    for (k = 0; k < cand.length && out.length < maxN; k++) {
      var c = cand[k], free = true;
      for (var q = 0; q < out.length; q++) if (Math.abs(out[q].x - c.x) < gap) free = false;
      if (free && c.hw > F * 0.012) out.push(c);
    }
    return out.sort(function (a, b) { return a.x - b.x; });
  }

  /* ---------- жизнь капель ---------- */
  function Sim(P, o) {
    o = o || {};
    var F = P.fs * P.s, R = rng(hash(P.text) * 7 + 3), D = [], live = 0;
    var maxLive = Math.max(1, Math.ceil(P.anchors.length * (o.busy || 0.5)));
    P.anchors.forEach(function (a, i) {
      var rT = Math.min(a.hw * 0.95, F * 0.06), rM = rT * (1.05 + R() * 0.3);
      D.push({ ax: a.x, ay: a.y, rT: Math.max(rT, F * 0.018), rM: Math.max(rM, F * 0.022), ph: 0, t: 0, dur: 0.4 + R() * 3.2 + i * 0.25,
        L: 0, y: a.y, r: 0, vy: 0, se: a.y, sr: 0, k: 0 });
    });
    function next(d) {
      d.t = 0;
      if (d.ph === 0) { if (live >= maxLive) { d.dur = 0.5 + R(); return; } live++; d.ph = 1; d.dur = 1.3 + R() * 1.4; d.L = F * (0.12 + Math.pow(R(), 1.4) * 0.62); d.det = R() < 0.42; }
      else if (d.ph === 1) { d.ph = 2; d.dur = 2.2 + d.L / F * 6 + R() * 1.5; }
      else if (d.ph === 2) { d.ph = 3; d.dur = (d.det ? 0.6 : 2.5) + R() * 3; }
      else if (d.ph === 3) { if (d.det) { d.ph = 4; d.vy = 0; d.y0 = d.y; d.se0 = d.se; } else { d.ph = 5; d.y0 = d.y; d.r0 = d.r; } d.dur = d.det ? 9 : 3.2 + R() * 2; }
      else { d.ph = 0; live--; d.dur = 1 + R() * 4.5; d.r = 0; d.sr = 0; d.y = d.se = d.ay; }
    }
    function step(dt) {
      for (var i = 0; i < D.length; i++) {
        var d = D[i]; d.t += dt; var u = d.dur ? d.t / d.dur : 1, e;
        switch (d.ph) {
          case 0: d.r = 0; d.sr = 0; break;
          case 1: e = ease(u); d.r = d.rM * (0.25 + 0.6 * e); d.y = d.ay + d.r * 0.05 + F * 0.01 * e; d.se = d.y; d.sr = d.rT * e; break;
          case 2: e = 1 - Math.pow(1 - Math.min(u, 1), 2.2); e = e * 0.85 + ease(u) * 0.15;
            d.r = d.rM * (0.85 + 0.15 * e); d.y = d.ay + d.r * 0.05 + F * 0.01 + d.L * e; d.se = d.y; d.sr = d.rT; break;
          case 3: d.r = d.rM * (1 + 0.035 * Math.sin(d.t * 2.4)); d.y += F * 0.004 * dt; d.se = d.y; break;
          case 4: d.vy += F * 2.6 * dt; d.y += d.vy * dt; e = ease(Math.min(1, d.t / 1.1));
            d.se = d.se0 + (d.ay + d.rT * 0.2 - d.se0) * e; d.sr = d.rT * (1 - 0.25 * e);
            if (d.y - d.r > P.H) u = 1; break;
          case 5: e = ease(u); d.y = d.y0 + (d.ay - d.y0) * e; d.se = d.y; d.r = d.r0 * (1 - 0.55 * e); d.sr = d.rT * (1 - 0.6 * e); break;
        }
        if (u >= 1 && !(d.ph === 4 && d.y - d.r <= P.H)) next(d);
      }
    }
    function freeze() { /* статичные потёки для reduced-motion */
      D.forEach(function (d, i) { var f = 0.25 + ((i * 37) % 10) / 13; d.r = d.rM; d.sr = d.rT; d.y = d.se = d.ay + F * 0.01 + F * 0.5 * f * f; d.ph = 3; });
    }
    return { D: D, step: step, freeze: freeze };
  }

  /* ---------- WebGL ---------- */
  var VS = 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  var FS = [
    'precision highp float;varying vec2 v;uniform sampler2D M;uniform vec2 S;uniform float BR,K,RIM,FADE;uniform int N;',
    'uniform vec4 UA[' + MAXD + '];uniform vec4 UB[' + MAXD + '];uniform vec3 C;',
    'float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}',
    'float cap(vec2 p,float r1,float r2,float h){p.x=abs(p.x);h=max(h,abs(r1-r2)+.01);float b=(r1-r2)/h,a=sqrt(max(1.-b*b,0.));',
    ' float k=dot(p,vec2(-b,a));if(k<0.)return length(p)-r1;if(k>a*h)return length(p-vec2(0.,h))-r2;return dot(p,vec2(a,b))-r1;}',
    'float fld(vec2 p){vec4 m=texture2D(M,p/S);float d=(.5-(m.g*256.+m.b)/257.)*2.*BR;',
    ' for(int i=0;i<' + MAXD + ';i++){if(i>=N)break;vec4 A=UA[i],B=UB[i];',
    '  if(A.w>.05)d=smin(d,cap(vec2(p.x-A.x,p.y-A.y),A.w,B.w,A.z-A.y),K);',
    '  if(B.z>.05)d=smin(d,length(p-B.xy)-B.z,K*1.4);}',
    ' return d;}',
    'void main(){vec2 p=v*S;float c=texture2D(M,v).r;float d=fld(p);',
    ' float a=max(c,clamp(.5-d/1.6,0.,1.));if(a<.004){gl_FragColor=vec4(0.);return;}',
    ' vec2 g=vec2(fld(p+vec2(1.,0.))-d,fld(p+vec2(0.,1.))-d);',
    ' float t=clamp(-d/RIM,0.,1.),q=1.-t,sl=clamp(q/max(sqrt(1.-q*q),.12),0.,5.);',
    ' vec3 n=normalize(vec3(g*sl,1.));vec3 L=normalize(vec3(-.55,-.8,1.));vec3 H=normalize(L+vec3(0.,0.,1.));',
    ' float dif=dot(n,L),sh=1.+.62*(dif-L.z);float sp=max(pow(max(dot(n,H),0.),36.)-pow(H.z,36.),0.);',
    ' float occ=smoothstep(0.,1.,t);',
    ' vec3 col=C*clamp(sh,.42,1.06)*(.9+.1*occ)+vec3(sp*1.15);',
    ' a*=1.-smoothstep(FADE,S.y,p.y);',
    ' gl_FragColor=vec4(min(col,vec3(1.))*a,a);}'
  ].join('\n');

  function GL(cv, P, color) {
    var gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) return null;
    function sh(t, src) { var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var tx = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, P.W, P.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(P.tex.data.buffer));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var U = {}; ['M', 'S', 'BR', 'K', 'RIM', 'FADE', 'N', 'UA', 'UB', 'C'].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
    var F = P.fs * P.s;
    gl.uniform1i(U.M, 0); gl.uniform2f(U.S, P.W, P.H); gl.uniform1f(U.BR, P.R); gl.uniform1f(U.K, F * 0.035);
    gl.uniform1f(U.RIM, F * 0.07); gl.uniform1f(U.FADE, P.fadeFrom); gl.uniform3fv(U.C, color);
    gl.viewport(0, 0, P.W, P.H);
    var ua = new Float32Array(4 * MAXD), ub = new Float32Array(4 * MAXD);
    return {
      gl: gl,
      draw: function (D) {
        for (var i = 0; i < MAXD; i++) {
          var d = D[i], j = i * 4;
          if (!d || d.ph === 0) { ua[j + 3] = 0; ub[j + 2] = 0; continue; }
          ua[j] = d.ax; ua[j + 1] = d.ay - d.rT * 1.1; ua[j + 2] = d.se; ua[j + 3] = d.sr;
          ub[j] = d.ax; ub[j + 1] = d.y; ub[j + 2] = d.r; ub[j + 3] = Math.max(d.sr * 0.55, Math.min(d.r * 0.62, d.sr));
        }
        gl.uniform1i(U.N, Math.min(D.length, MAXD)); gl.uniform4fv(U.UA, ua); gl.uniform4fv(U.UB, ub);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      kill: function () { var x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
    };
  }

  /* ---------- элемент ---------- */
  var all = [];
  function attach(el, o) {
    o = o || {};
    var st = { el: el, o: o, on: false, vis: false, P: null, cv: null, r: null, sim: null, w: 0, raf: 0, t0: 0 };
    all.push(st);
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    function build() {
      teardown();
      var P = prepare(el, o); if (!P || !P.anchors) return;
      var cv = document.createElement('canvas');
      cv.className = 'drc'; cv.setAttribute('aria-hidden', 'true'); cv.width = P.W; cv.height = P.H;
      cv.style.cssText = 'position:absolute;pointer-events:none;left:' + P.left + 'px;top:' + P.top + 'px;width:' + P.cssW + 'px;height:' + P.cssH + 'px';
      var col = (o.color || getComputedStyle(el).color).match(/[\d.]+/g).slice(0, 3).map(function (x) { return x / 255 * 0.97; });
      var r; try { r = GL(cv, P, col); } catch (e) { r = null; if (window.console) console.warn('drips', e); }
      if (!r) return;
      cv.addEventListener('webglcontextlost', function (e) { e.preventDefault(); teardown(); });
      el.appendChild(cv);
      st.P = P; st.cv = cv; st.r = r; st.w = el.clientWidth; st.sim = Sim(P, o);
      if (RM || o.still) { st.sim.freeze(); }
      else { for (var k = 0; k < 40; k++) st.sim.step(0.1); } /* сразу живая картинка, не с пустого места */
      r.draw(st.sim.D);
      el.classList.add('gl');
      loop();
    }
    function teardown() {
      cancelAnimationFrame(st.raf); st.raf = 0;
      if (st.r) st.r.kill(); if (st.cv && st.cv.parentNode) st.cv.parentNode.removeChild(st.cv);
      st.r = st.cv = st.sim = st.P = null; el.classList.remove('gl');
    }
    function frame(t) {
      st.raf = 0;
      if (!st.r || !st.vis || document.hidden) return;
      var dt = st.t0 ? Math.min(0.05, (t - st.t0) / 1000) : 0.016; st.t0 = t;
      st.sim.step(dt); st.r.draw(st.sim.D);
      st.raf = requestAnimationFrame(frame);
    }
    function loop() { if (RM || o.still || st.raf || !st.r || !st.vis || document.hidden) return; st.t0 = 0; st.raf = requestAnimationFrame(frame); }
    st.build = build; st.loop = loop; st.teardown = teardown;
    var go = function () {
      if (!('IntersectionObserver' in window)) { st.vis = true; build(); return; }
      new IntersectionObserver(function (es) {
        st.vis = es[es.length - 1].isIntersecting;
        if (st.vis && !st.r) build(); else loop();
      }, { rootMargin: '80px 0px' }).observe(el);
    };
    if (document.fonts && document.fonts.load) {
      var cs = getComputedStyle(el);
      document.fonts.load(cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily.split(',')[0], el.textContent).then(go, go);
    } else go();
    return st;
  }
  document.addEventListener('visibilitychange', function () { all.forEach(function (s) { s.loop && s.loop(); }); });
  var rt; addEventListener('resize', function () {
    clearTimeout(rt); rt = setTimeout(function () { all.forEach(function (s) { if (s.r && Math.abs(s.el.clientWidth - s.w) > 1) s.build(); }); }, 180);
  });
  window.MorfDrips = { attach: attach, prepare: prepare, Sim: Sim, all: all, RM: RM };
})();
