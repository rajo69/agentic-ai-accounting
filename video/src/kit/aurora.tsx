import { useEffect, useRef } from "react";
import { auroraStops, colors, video } from "../theme";

/**
 * The landing aurora (`frontend/src/components/aurora.tsx`, OGL) ported to raw WebGL 2 and driven by
 * the frame: `uTime = frame / fps * speed`, so every frame is deterministic and re-renderable.
 * Same shader, same stops, same amplitude/blend/speed as the landing (1.1 / 0.55 / 0.45).
 */
const VERT = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;
out vec4 fragColor;
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x,289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m = max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m=m*m; m=m*m;
  vec3 x = 2.0*fract(p*C.www)-1.0;
  vec3 h = abs(x)-0.5;
  vec3 ox = floor(x+0.5);
  vec3 a0 = x-ox;
  m *= 1.79284291400159 - 0.85373472095314*(a0*a0+h*h);
  vec3 g;
  g.x  = a0.x *x0.x  + h.x *x0.y;
  g.yz = a0.yz*x12.xz + h.yz*x12.yw;
  return 130.0*dot(m,g);
}
struct ColorStop { vec3 color; float position; };
#define COLOR_RAMP(colors, factor, finalColor) { \\
  int index = 0; \\
  for (int i = 0; i < 2; i++) { \\
    ColorStop cc = colors[i]; \\
    bool inBetween = cc.position <= factor; \\
    index = int(mix(float(index), float(i), float(inBetween))); \\
  } \\
  ColorStop cur  = colors[index]; \\
  ColorStop next = colors[index + 1]; \\
  float range = next.position - cur.position; \\
  float lf    = (factor - cur.position) / range; \\
  finalColor  = mix(cur.color, next.color, lf); \\
}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);
  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);
  float height = snoise(vec2(uv.x*2.0 + uTime*0.1, uTime*0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;
  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend*0.5, midPoint + uBlend*0.5, intensity);
  vec3 auroraColor = intensity * rampColor;
  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface GL {
  gl: WebGL2RenderingContext;
  uTime: WebGLUniformLocation | null;
}

function setup(canvas: HTMLCanvasElement, amplitude: number, blend: number): GL | null {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  gl.useProgram(program);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1f(gl.getUniformLocation(program, "uAmplitude"), amplitude);
  gl.uniform1f(gl.getUniformLocation(program, "uBlend"), blend);
  gl.uniform2f(gl.getUniformLocation(program, "uResolution"), canvas.width, canvas.height);
  gl.uniform3fv(gl.getUniformLocation(program, "uColorStops"), new Float32Array(auroraStops.flatMap(hexToRgb)));
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.viewport(0, 0, canvas.width, canvas.height);
  return { gl, uTime: gl.getUniformLocation(program, "uTime") };
}

/**
 * Full-width aurora band, `height` px tall, fading to the canvas over its last `fade` px exactly
 * like the landing backdrop. `frame` drives the shader; `opacity` lets sections fade it in and out.
 */
export function Aurora({
  frame,
  height = 680,
  fade = 224,
  opacity = 1,
  speed = 0.45,
  amplitude = 1.1,
  blend = 0.55,
}: {
  frame: number;
  height?: number;
  fade?: number;
  opacity?: number;
  speed?: number;
  amplitude?: number;
  blend?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<GL | null>(null);
  const time = (frame / video.fps) * speed;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (!glRef.current) glRef.current = setup(canvas, amplitude, blend);
    const g = glRef.current;
    if (!g) return;
    g.gl.uniform1f(g.uTime, time);
    g.gl.clear(g.gl.COLOR_BUFFER_BIT);
    g.gl.drawArrays(g.gl.TRIANGLES, 0, 3);
  }, [time, amplitude, blend]);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: video.width, height, opacity, pointerEvents: "none" }}>
      <canvas ref={ref} width={video.width} height={height} style={{ display: "block", width: video.width, height }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: fade, background: `linear-gradient(to bottom, transparent, ${colors.background})` }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.08,
          backgroundImage: `radial-gradient(${colors.foreground} 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
          maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
        }}
      />
    </div>
  );
}
