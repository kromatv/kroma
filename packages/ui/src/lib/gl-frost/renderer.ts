import type { GlRect } from './rect';
import { BLUR_FS, FROST_FS, gaussian, QUAD_VS, SHARP_FS } from './shaders';

type GL = WebGLRenderingContext;

/** The pictures a frost layer draws: the screen's art, its veil, how the art is placed. */
export interface FrostArt {
  art: HTMLImageElement;
  veil: HTMLImageElement | null;
}

/** How the art sits in the canvas (see `coverMap`), and the blur in canvas px. */
export interface FrostFit {
  cover: { sx: number; sy: number; ox: number; oy: number };
  blur: number;
}

/** Draws a screen's backdrop and the frosted rectangles over it. */
export interface FrostRenderer {
  setArt(art: FrostArt): void;
  setFit(fit: FrostFit): void;
  draw(rects: readonly GlRect[]): void;
  dispose(): void;
}

const DOWNSCALE = 4;

function program(gl: GL, fs: string): WebGLProgram {
  const p = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, QUAD_VS],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type);
    if (!s || !p) throw new Error('gl-frost: no shader');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`gl-frost: ${gl.getShaderInfoLog(s) ?? 'compile'}`);
    }
    gl.attachShader(p, s);
  }
  if (!p) throw new Error('gl-frost: no program');
  gl.bindAttribLocation(p, 0, 'a');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('gl-frost: link');
  return p;
}

function texture(gl: GL, source: TexImageSource | null, w = 1, h = 1): WebGLTexture | null {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return t;
}

interface Target {
  fb: WebGLFramebuffer | null;
  tex: WebGLTexture | null;
}

function target(gl: GL, w: number, h: number): Target {
  const tex = texture(gl, null, w, h);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex };
}

/** A renderer over `gl`, or an error thrown where the context cannot compile it. */
export function createFrostRenderer(gl: GL): FrostRenderer {
  const sharp = program(gl, SHARP_FS);
  const blur = program(gl, BLUR_FS);
  const frost = program(gl, FROST_FS);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let art: WebGLTexture | null = null;
  let veil: WebGLTexture | null = null;
  let cover = { sx: 1, sy: 1, ox: 0, oy: 0 };
  let sigma = 12;
  let small: [Target, Target] | null = null;
  let smallSize = { w: 0, h: 0 };
  let blurred = false;

  const where = new Map<string, WebGLUniformLocation | null>();
  const uni = (p: WebGLProgram, name: string) => {
    const key = `${[sharp, blur, frost].indexOf(p)}${name}`;
    if (!where.has(key)) where.set(key, gl.getUniformLocation(p, name));
    return where.get(key) ?? null;
  };
  const box = (
    p: WebGLProgram,
    x: number,
    y: number,
    w: number,
    h: number,
    sw: number,
    sh: number,
  ) => {
    gl.uniform4f(uni(p, 'u_box'), x, y, w, h);
    gl.uniform2f(uni(p, 'u_size'), sw, sh);
  };

  const drawSharp = (w: number, h: number) => {
    gl.useProgram(sharp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, art);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, veil);
    gl.uniform1i(uni(sharp, 'u_art'), 0);
    gl.uniform1i(uni(sharp, 'u_veil'), 1);
    gl.uniform4f(uni(sharp, 'u_cover'), cover.sx, cover.sy, cover.ox, cover.oy);
    box(sharp, 0, 0, w, h, w, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const prepare = (w: number, h: number) => {
    const sw = Math.max(1, Math.round(w / DOWNSCALE));
    const sh = Math.max(1, Math.round(h / DOWNSCALE));
    if (!small || smallSize.w !== sw || smallSize.h !== sh) {
      small = [target(gl, sw, sh), target(gl, sw, sh)];
      smallSize = { w: sw, h: sh };
      blurred = false;
    }
    if (blurred) return;
    const [a, b] = small;
    gl.viewport(0, 0, sw, sh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fb);
    drawSharp(sw, sh);
    gl.useProgram(blur);
    gl.uniform1fv(uni(blur, 'u_w'), gaussian((sigma * sw) / w));
    gl.uniform1i(uni(blur, 'u_src'), 0);
    gl.activeTexture(gl.TEXTURE0);
    for (const [from, to, dx, dy] of [
      [a, b, 1 / sw, 0],
      [b, a, 0, 1 / sh],
    ] as const) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.fb);
      gl.bindTexture(gl.TEXTURE_2D, from.tex);
      gl.uniform2f(uni(blur, 'u_step'), dx, dy);
      box(blur, 0, 0, sw, sh, sw, sh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    blurred = true;
  };

  return {
    setArt(next) {
      if (art) gl.deleteTexture(art);
      if (veil) gl.deleteTexture(veil);
      art = texture(gl, next.art);
      veil = texture(gl, next.veil);
      blurred = false;
    },
    setFit(fit) {
      cover = fit.cover;
      sigma = fit.blur;
      blurred = false;
    },
    draw(rects) {
      if (!art) return;
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      prepare(w, h);
      gl.viewport(0, 0, w, h);
      drawSharp(w, h);
      if (rects.length === 0 || !small) return;
      gl.enable(gl.BLEND);
      gl.useProgram(frost);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, small[0].tex);
      gl.uniform1i(uni(frost, 'u_blur'), 0);
      for (const r of rects) {
        box(frost, r.x, r.y, r.w, r.h, w, h);
        gl.uniform1f(uni(frost, 'u_radius'), r.radius);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.disable(gl.BLEND);
    },
    dispose() {
      for (const t of [art, veil, small?.[0].tex, small?.[1].tex]) if (t) gl.deleteTexture(t);
      for (const f of [small?.[0].fb, small?.[1].fb]) if (f) gl.deleteFramebuffer(f);
      for (const p of [sharp, blur, frost]) gl.deleteProgram(p);
      gl.deleteBuffer(quad);
    },
  };
}
