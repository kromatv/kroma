export const QUAD_VS = `
attribute vec2 a;
uniform vec4 u_box;
uniform vec2 u_size;
varying vec2 v_px;
void main() {
  vec2 px = u_box.xy + a * u_box.zw;
  v_px = px;
  gl_Position = vec4(px / u_size * 2.0 - 1.0, 0.0, 1.0);
}`;

export const SHARP_FS = `
precision highp float;
uniform sampler2D u_art;
uniform sampler2D u_veil;
uniform vec4 u_cover;
uniform vec2 u_size;
varying vec2 v_px;
void main() {
  vec2 p = vec2(v_px.x, u_size.y - v_px.y) / u_size;
  vec3 art = texture2D(u_art, p * u_cover.xy + u_cover.zw).rgb;
  vec4 veil = texture2D(u_veil, p);
  gl_FragColor = vec4(mix(art, veil.rgb, veil.a), 1.0);
}`;

export const BLUR_FS = `
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_step;
uniform vec2 u_size;
uniform float u_w[8];
varying vec2 v_px;
void main() {
  vec2 p = v_px / u_size;
  vec3 sum = texture2D(u_src, p).rgb * u_w[0];
  for (int i = 1; i < 8; i++) {
    vec2 d = u_step * float(i);
    sum += (texture2D(u_src, p + d).rgb + texture2D(u_src, p - d).rgb) * u_w[i];
  }
  gl_FragColor = vec4(sum, 1.0);
}`;

export const FROST_FS = `
precision highp float;
uniform sampler2D u_blur;
uniform vec4 u_box;
uniform float u_radius;
uniform vec2 u_size;
varying vec2 v_px;
void main() {
  vec2 half_ = u_box.zw * 0.5;
  vec2 q = abs(v_px - u_box.xy - half_) - half_ + u_radius;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - u_radius;
  float a = clamp(0.5 - d, 0.0, 1.0);
  gl_FragColor = vec4(texture2D(u_blur, v_px / u_size).rgb, a);
}`;

/** Normalised one-sided Gaussian weights for `taps` samples at `sigma` px. */
export function gaussian(sigma: number, taps = 8): number[] {
  const w = Array.from({ length: taps }, (_, i) => Math.exp(-(i * i) / (2 * sigma * sigma)));
  const total = w.reduce((sum, v, i) => sum + (i === 0 ? v : 2 * v), 0);
  return w.map((v) => v / total);
}
