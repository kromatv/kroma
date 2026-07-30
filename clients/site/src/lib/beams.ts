// WebGL recreation of the KROMA intro film's radial neon burst: thin additive
// beams, hashed per-cell for color, width, reach and flicker, on three slowly
// counter-rotating layers.
//
// Without WebGL, or after a lost context, this draws nothing and leaves the
// canvas transparent; the hero paints a `glow-amber` div behind it so a
// browser that cannot run this still gets warmth instead of flat charcoal.
//
// mountBeams returns a disposer: the caller's useEffect cleanup tears down the
// RAF loop, the observers and the listeners rather than leaking them against a
// detached canvas.

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uT;
uniform vec2 uC;

float hash(float n){ return fract(sin(n)*43758.5453123); }

/* film palette: neon versions of the six wheel colors, weighted like the
   intro (red + green dominate, amber is the rare one) */
vec3 pal(float h){
  if(h<.21) return vec3(1.00,.36,.33);   /* red    */
  if(h<.41) return vec3(.18,.89,.63);    /* green  */
  if(h<.59) return vec3(.26,.53,1.00);   /* blue   */
  if(h<.75) return vec3(.44,.37,1.00);   /* indigo */
  if(h<.88) return vec3(.71,.37,1.00);   /* purple */
  return vec3(1.00,.77,.30);             /* amber  */
}

/* one ring of N beams around the origin, drifting at rot rad/s */
vec3 layer(vec2 p, float N, float seed, float rot){
  float ang = atan(p.y, p.x);
  float r = length(p);
  float a = (ang/6.28318530718 + .5)*N + rot*uT;
  float cell = mod(floor(a), N);
  float f = fract(a) - .5;
  float h  = hash(cell*12.9898 + seed);
  float h2 = hash(cell*78.2330 + seed*1.7);
  float h3 = hash(cell*37.7190 + seed*2.3);
  float h4 = hash(cell*91.7000 + seed*3.1);
  /* distance to the beam's center line, in scene units */
  float arc = f*(6.28318530718/N)*r;
  float w = mix(.0022,.0068,h2);
  float core = exp(-arc*arc/(w*w));
  float halo = exp(-arc*arc/(w*w*12.0))*.3;
  /* light packets streaming outward along the beam: the visible motion */
  float s = fract(r*mix(1.1,2.3,h2) - uT*mix(.22,.5,h) + h*7.0);
  float packet = smoothstep(.0,.3,s)*smoothstep(.95,.45,s);
  float flow = .42 + .9*packet;
  /* each beam starts a little off-center; its reach extends and retracts */
  float r0    = mix(.015,.13,h3);
  float reach = mix(.55,2.2,h4) * (.82 + .22*sin(uT*(.25+.35*h3) + h4*6.28318));
  float env   = smoothstep(r0, r0+.1, r) * (1.0 - smoothstep(reach*.7, reach, r));
  /* brightness breathing, out of phase per beam */
  float breathe = .66 + .34*sin(uT*(.5+.7*h3) + h*6.28318);
  return pal(h) * (core+halo) * env * mix(.5,1.8,h*h) * breathe * flow;
}

void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 p = (uv - uC)*2.0;
  p.x *= uRes.x/uRes.y;
  /* the whole fan rotates, stately, like a projector reel */
  float ca = cos(uT*.05), sa = sin(uT*.05);
  p = mat2(ca,-sa,sa,ca)*p;
  /* slow zoom breathing: the burst leans in and out */
  p *= 1.0 + .05*sin(uT*.18);
  float r = length(p);

  vec3 col = vec3(.024,.026,.04);             /* deep blue-charcoal base */
  col += layer(p, 52., 3.1,  .012);
  col += layer(p, 32., 7.7, -.016);
  col += layer(p, 20., 5.3,  .022);
  /* the ignition knot the beams converge on, softly pulsing */
  float k = .0025 + .0015*(.5+.5*sin(uT*.7));
  col += vec3(1.0,.95,.88) * (exp(-r*r/k)*.7 + .013/(r+.03));
  /* tonemap, resaturate hard, edge falloff, dither against banding */
  col = col/(1.0+col);
  col = pow(col, vec3(.8));
  col = mix(vec3(dot(col,vec3(.299,.587,.114))), col, 1.6);
  col *= 1.0 - smoothstep(1.15, 2.2, r)*.85;
  col += (hash(dot(gl_FragCoord.xy, vec2(.71,.113)))-.5)/128.0;
  gl_FragColor = vec4(clamp(col,0.,1.), 1.0);
}`;

const VERT = 'attribute vec2 v;void main(){gl_Position=vec4(v,0.,1.);}';

export interface BeamOptions {
  center?: [number, number];
  anchor?: Element | null;
}

/** Mount the animation onto a canvas. Returns a disposer to stop and unwire it. */
export function mountBeams(canvas: HTMLCanvasElement, opts: BeamOptions = {}): () => void {
  const [ucx, ucy] = opts.center ?? [0.5, 0.7];
  const anchor = opts.anchor ?? null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  });
  if (!gl) return () => {};

  const shader = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error('shader');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? 'compile');
    return s;
  };

  let prog: WebGLProgram;
  try {
    const p = gl.createProgram();
    if (!p) throw new Error('program');
    prog = p;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
  } catch {
    return () => {};
  }
  // `gl.useProgram` binds the linked program. It is the WebGL call, not a React
  // hook: the rule matches on the `use*` name alone and so reads it as a hook
  // sitting after the early return in the catch above. There is no React in this
  // file at all. The directive has to be the LAST comment line before the call.
  // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a hook.
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'v');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uT = gl.getUniformLocation(prog, 'uT');
  const uC = gl.getUniformLocation(prog, 'uC');
  gl.uniform2f(uC, ucx, ucy);

  // Measured on resize/font-load, not inside draw(): that would force
  // getBoundingClientRect reads every frame instead of only on layout change.
  const measure = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const scale = Math.min(1.25, devicePixelRatio || 1, 1500 / Math.max(1, w));
    const bw = Math.max(2, Math.round(w * scale));
    const bh = Math.max(2, Math.round(h * scale));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      gl.viewport(0, 0, bw, bh);
    }
    gl.uniform2f(uRes, canvas.width, canvas.height);
    if (anchor) {
      const a = anchor.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      if (c.width && c.height) {
        gl.uniform2f(
          uC,
          (a.left + a.width / 2 - c.left) / c.width,
          1 - (a.top + a.height / 2 - c.top) / c.height,
        );
      }
    }
  };

  let visible = true;
  let dead = false;
  let raf = 0;
  const t0 = performance.now();
  const draw = (now: number) => {
    raf = 0;
    gl.uniform1f(uT, (now - t0) / 1000 + 40);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduced && visible && !document.hidden && !dead) raf = requestAnimationFrame(draw);
  };
  const wake = () => {
    if (!raf && !dead && visible && !document.hidden) raf = requestAnimationFrame(draw);
  };

  const ro = new ResizeObserver(() => {
    measure();
    if (raf === 0) draw(performance.now()); // repaint a paused frame at the new size
  });
  ro.observe(canvas);
  const io = new IntersectionObserver((es) => {
    visible = es[0]?.isIntersecting ?? false;
    wake();
  });
  io.observe(canvas);
  document.addEventListener('visibilitychange', wake);
  // Re-measure once fonts land, since a reflow can move the anchor. Guarded:
  // this can resolve after a fast route change, against an already-detached canvas.
  document.fonts?.ready.then(() => {
    if (!dead) measure();
  });
  const onLost = (e: Event) => {
    e.preventDefault();
    dead = true;
    cancelAnimationFrame(raf);
    raf = 0;
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  measure();
  // With reduced motion this renders exactly one frame and stops.
  requestAnimationFrame(draw);

  return () => {
    dead = true;
    cancelAnimationFrame(raf);
    raf = 0;
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', wake);
    canvas.removeEventListener('webglcontextlost', onLost, false);
  };
}
