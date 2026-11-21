(() => {
  const canvas = document.createElement("canvas");
  canvas.id = "ink";
  canvas.hidden = true;
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false
  });

  if (!gl) return;

  const rippleCount = 10;
  const rippleLifetime = 2.8;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const vertexSource = `
    attribute vec2 position;
    varying vec2 uv;

    void main() {
      uv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision highp float;

    varying vec2 uv;
    uniform float aspect;
    uniform float time;
    uniform vec4 ripples[${rippleCount}];

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 cell = floor(p);
      vec2 f = fract(p);
      vec2 t = f * f * (3.0 - 2.0 * f);
      float low = mix(hash(cell), hash(cell + vec2(1.0, 0.0)), t.x);
      float high = mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0)), t.x);
      return mix(low, high, t.y);
    }

    float clouds(vec2 p) {
      mat2 turn = mat2(0.80, 0.60, -0.60, 0.80);
      float value = 0.0;
      float weight = 0.54;
      for (int i = 0; i < 4; i++) {
        value += weight * noise(p);
        p = turn * p * 2.08 + vec2(8.1, 4.7);
        weight *= 0.49;
      }
      return value;
    }

    vec2 stir(vec2 point, vec2 scale) {
      for (int i = 0; i < ${rippleCount}; i++) {
        vec4 ripple = ripples[i];
        if (ripple.w <= 0.0) continue;
        vec2 delta = (point - ripple.xy) * scale;
        float distance = length(delta) / ripple.w;
        if (distance >= 1.0) continue;
        float falloff = 1.0 - smoothstep(0.0, 1.0, distance);
        float angle = ripple.z * falloff * falloff;
        float c = cos(angle);
        float s = sin(angle);
        point = ripple.xy + mat2(c, s, -s, c) * delta / scale;
      }
      return point;
    }

    float plume(vec2 p, vec2 center, vec2 stretch) {
      vec2 delta = (p - center) * stretch;
      return exp(-dot(delta, delta));
    }

    void main() {
      vec2 surface = stir(uv, vec2(aspect, 1.0));
      vec2 p = (surface - 0.5) * vec2(1.18 + 0.23 * aspect, 1.0);
      float t = time * 0.052;
      vec2 flow = vec2(
        clouds(p * 2.8 + vec2(3.5, 2.7 + t)),
        clouds(p * 2.8 + vec2(9.2 - t, 5.4))
      ) - 0.5;
      vec2 folds = vec2(
        clouds(p * 4.7 + 3.1 * flow + vec2(8.6 + t, 1.2)),
        clouds(p * 4.7 + 3.1 * flow + vec2(2.1, 9.4 - t))
      ) - 0.5;
      vec2 ink = p + 0.64 * flow + 0.27 * folds;

      float billows = clouds(vec2(ink.x * 6.0, ink.y * 8.5) + vec2(6.9, 3.3 + t));
      float wisps = clouds(ink * 16.0 + 2.2 * folds + vec2(2.6 - t, 3.4));
      float spread = max(
        plume(ink, vec2(-0.48, -0.22), vec2(1.85, 3.05)),
        plume(ink, vec2(0.44, 0.21), vec2(2.03, 3.24))
      );
      float density = 0.65 * billows + 0.26 * spread + 0.15 * wisps;
      float body = smoothstep(0.24, 0.73, density);
      float pockets = smoothstep(0.47, 0.75, density);
      float threads = 1.0 - smoothstep(0.0, 0.085, abs(billows + 0.16 * wisps - 0.60));

      float light = smoothstep(-0.55, 0.62, p.y - 0.45 * p.x);
      vec3 water = mix(vec3(0.58, 0.75, 0.63), vec3(0.87, 0.93, 0.77), light);
      vec3 color = mix(water, vec3(0.35, 0.64, 0.49), 0.76 * body);
      color = mix(color, vec3(0.13, 0.36, 0.28), 0.76 * pockets);
      color += vec3(0.14, 0.19, 0.09) * threads * body * (1.0 - 0.58 * pockets);

      vec2 center = (uv - 0.5) * vec2(2.1, 3.7);
      color *= 1.0 - 0.16 * exp(-dot(center, center));
      color += (hash(gl_FragCoord.xy) - 0.5) * 0.023;
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  const ripples = Array.from({ length: rippleCount }, () => ({ start: -Infinity }));
  const rippleUniform = new Float32Array(rippleCount * 4);
  let nextRipple = 0;
  let previousPointer;
  let frame = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let scene;

  function prepareScene() {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    return {
      aspect: gl.getUniformLocation(program, "aspect"),
      time: gl.getUniformLocation(program, "time"),
      ripples: gl.getUniformLocation(program, "ripples[0]")
    };
  }

  function draw(now) {
    for (const [index, ripple] of ripples.entries()) {
      const offset = index * 4;
      const age = (now - ripple.start) / 1000;
      if (age >= rippleLifetime) {
        rippleUniform[offset + 3] = 0;
        continue;
      }
      const progress = age / rippleLifetime;
      rippleUniform[offset] = ripple.x + ripple.dx * age * 0.20;
      rippleUniform[offset + 1] = ripple.y + ripple.dy * age * 0.20;
      rippleUniform[offset + 2] = ripple.spin * (1 - progress) ** 2;
      rippleUniform[offset + 3] = 0.13 + 0.13 * progress;
    }

    gl.uniform1f(scene.time, elapsed);
    gl.uniform4fv(scene.ripples, rippleUniform);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function resize() {
    if (!scene) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(window.devicePixelRatio || 1, Math.sqrt(740000 / (width * height)));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform1f(scene.aspect, width / height);
    draw(performance.now());
  }

  function stirAtPointer(event) {
    if (!scene || reducedMotion.matches) return;
    const now = performance.now();
    const x = event.clientX;
    const y = event.clientY;
    const dx = previousPointer ? x - previousPointer.x : 0;
    const dy = previousPointer ? y - previousPointer.y : 0;
    const distance = Math.hypot(dx, dy);
    if (previousPointer && distance < 20 && (distance < 5 || now - previousPointer.time < 95)) return;
    previousPointer = { x, y, time: now };

    const height = canvas.clientHeight;
    const width = canvas.clientWidth;
    ripples[nextRipple] = {
      start: now,
      x: x / width,
      y: 1 - y / height,
      dx: Math.max(-0.28, Math.min(0.28, dx / width)),
      dy: Math.max(-0.28, Math.min(0.28, -dy / height)),
      spin: (dx + dy * 0.6 < 0 ? -1 : 1) * (2.6 + Math.min(distance / 45, 1.4))
    };
    nextRipple = (nextRipple + 1) % rippleCount;
  }

  function animate(now) {
    if (now - lastFrame >= 1000 / 45) {
      elapsed += Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;
      draw(now);
    }
    frame = requestAnimationFrame(animate);
  }

  function updateMotion() {
    cancelAnimationFrame(frame);
    if (!scene || document.hidden) return;
    lastFrame = performance.now();
    if (reducedMotion.matches) {
      ripples.forEach(ripple => { ripple.start = -Infinity; });
      previousPointer = undefined;
      draw(lastFrame);
      return;
    }
    frame = requestAnimationFrame(animate);
  }

  function start() {
    try {
      scene = prepareScene();
      canvas.hidden = false;
      resize();
      updateMotion();
    } catch (error) {
      console.warn("The ink background could not start.", error);
    }
  }

  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    scene = undefined;
    canvas.hidden = true;
    updateMotion();
  });
  canvas.addEventListener("webglcontextrestored", start);
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", stirAtPointer, { passive: true });
  window.addEventListener("pointerdown", stirAtPointer, { passive: true });
  window.addEventListener("pointerout", event => {
    if (!event.relatedTarget) previousPointer = undefined;
  });
  document.addEventListener("visibilitychange", updateMotion);
  reducedMotion.addEventListener("change", updateMotion);
  start();
})();
