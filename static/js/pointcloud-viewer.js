(function() {
  'use strict';

  const section = document.getElementById('stereo-pointcloud-comparison');
  if (!section) return;

  const canvases = Array.from(section.querySelectorAll('.craft-pointcloud-canvas'));
  const resetButton = document.getElementById('craft-pointcloud-reset');
  // Assets are individually aligned to their table planes, so zero rotation is
  // the shared edge-on view even though the source cameras have different poses.
  const defaultView = { yaw: 0, pitch: 0, zoom: 0.92 };
  const view = Object.assign({}, defaultView);
  const viewers = [];
  const assetPromises = new Map();
  let renderQueued = false;
  let hasLoaded = false;
  let activeViewer = null;

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    window.requestAnimationFrame(function() {
      renderQueued = false;
      viewers.forEach(function(viewer) { viewer.render(); });
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setStatus(canvas, message, state) {
    const stage = canvas.closest('.craft-pointcloud-stage');
    const label = stage.querySelector('.craft-pointcloud-status span:last-child');
    if (label) label.textContent = message;
    stage.classList.toggle('is-loaded', state === 'loaded');
    stage.classList.toggle('is-error', state === 'error');
  }

  const typeInfo = {
    char:   { size: 1, read: function(view, offset) { return view.getInt8(offset); } },
    int8:   { size: 1, read: function(view, offset) { return view.getInt8(offset); } },
    uchar:  { size: 1, read: function(view, offset) { return view.getUint8(offset); } },
    uint8:  { size: 1, read: function(view, offset) { return view.getUint8(offset); } },
    short:  { size: 2, read: function(view, offset) { return view.getInt16(offset, true); } },
    int16:  { size: 2, read: function(view, offset) { return view.getInt16(offset, true); } },
    ushort: { size: 2, read: function(view, offset) { return view.getUint16(offset, true); } },
    uint16: { size: 2, read: function(view, offset) { return view.getUint16(offset, true); } },
    int:    { size: 4, read: function(view, offset) { return view.getInt32(offset, true); } },
    int32:  { size: 4, read: function(view, offset) { return view.getInt32(offset, true); } },
    uint:   { size: 4, read: function(view, offset) { return view.getUint32(offset, true); } },
    uint32: { size: 4, read: function(view, offset) { return view.getUint32(offset, true); } },
    float:  { size: 4, read: function(view, offset) { return view.getFloat32(offset, true); } },
    float32:{ size: 4, read: function(view, offset) { return view.getFloat32(offset, true); } },
    double: { size: 8, read: function(view, offset) { return view.getFloat64(offset, true); } },
    float64:{ size: 8, read: function(view, offset) { return view.getFloat64(offset, true); } }
  };

  function findHeaderEnd(bytes) {
    const marker = [101, 110, 100, 95, 104, 101, 97, 100, 101, 114]; // end_header
    const searchLength = Math.min(bytes.length, 65536);
    for (let i = 0; i <= searchLength - marker.length; i += 1) {
      let matches = true;
      for (let j = 0; j < marker.length; j += 1) {
        if (bytes[i + j] !== marker[j]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
      let end = i + marker.length;
      while (end < bytes.length && (bytes[end] === 10 || bytes[end] === 13)) end += 1;
      return end;
    }
    throw new Error('PLY header is missing or too large.');
  }

  function percentile(sorted, ratio) {
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
  }

  function parseBinaryPly(buffer, pointLimit) {
    const bytes = new Uint8Array(buffer);
    const dataOffset = findHeaderEnd(bytes);
    const header = new TextDecoder('ascii').decode(bytes.subarray(0, dataOffset));
    const lines = header.split(/\r?\n/);
    let vertexCount = 0;
    let inVertex = false;
    let stride = 0;
    const properties = [];

    if (!lines.some(function(line) { return line.trim() === 'format binary_little_endian 1.0'; })) {
      throw new Error('Only binary little-endian PLY files are supported.');
    }

    lines.forEach(function(rawLine) {
      const parts = rawLine.trim().split(/\s+/);
      if (parts[0] === 'element') {
        inVertex = parts[1] === 'vertex';
        if (inVertex) vertexCount = Number(parts[2]);
      } else if (inVertex && parts[0] === 'property') {
        if (parts[1] === 'list') throw new Error('List properties are not supported for vertices.');
        const info = typeInfo[parts[1]];
        if (!info) throw new Error('Unsupported PLY property type: ' + parts[1]);
        properties.push({ name: parts[2], offset: stride, info: info });
        stride += info.size;
      }
    });

    if (!vertexCount || !stride) throw new Error('PLY file has no vertex data.');
    if (dataOffset + vertexCount * stride > buffer.byteLength) throw new Error('PLY vertex data is incomplete.');

    function property(name) {
      return properties.find(function(item) { return item.name === name; });
    }

    const xProperty = property('x');
    const yProperty = property('y');
    const zProperty = property('z');
    const redProperty = property('red') || property('r');
    const greenProperty = property('green') || property('g');
    const blueProperty = property('blue') || property('b');
    if (!xProperty || !yProperty || !zProperty) throw new Error('PLY file has no XYZ coordinates.');

    const targetCount = Math.min(vertexCount, pointLimit);
    const positions = new Float32Array(targetCount * 3);
    const colors = new Uint8Array(targetCount * 3);
    const dataView = new DataView(buffer);
    const sampleStep = vertexCount / targetCount;
    let validCount = 0;

    for (let sample = 0; sample < targetCount; sample += 1) {
      const vertex = Math.min(vertexCount - 1, Math.floor(sample * sampleStep));
      const offset = dataOffset + vertex * stride;
      const x = xProperty.info.read(dataView, offset + xProperty.offset);
      const y = yProperty.info.read(dataView, offset + yProperty.offset);
      const z = zProperty.info.read(dataView, offset + zProperty.offset);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

      const index = validCount * 3;
      positions[index] = x;
      positions[index + 1] = y;
      positions[index + 2] = z;
      colors[index] = redProperty ? redProperty.info.read(dataView, offset + redProperty.offset) : 210;
      colors[index + 1] = greenProperty ? greenProperty.info.read(dataView, offset + greenProperty.offset) : 225;
      colors[index + 2] = blueProperty ? blueProperty.info.read(dataView, offset + blueProperty.offset) : 255;
      validCount += 1;
    }

    if (!validCount) throw new Error('PLY file contains no valid points.');

    const finalPositions = positions.slice(0, validCount * 3);
    const finalColors = colors.slice(0, validCount * 3);
    const xs = new Float32Array(validCount);
    const ys = new Float32Array(validCount);
    const zs = new Float32Array(validCount);

    for (let i = 0; i < validCount; i += 1) {
      xs[i] = finalPositions[i * 3];
      ys[i] = finalPositions[i * 3 + 1];
      zs[i] = finalPositions[i * 3 + 2];
    }
    xs.sort();
    ys.sort();
    zs.sort();

    const low = 0.01;
    const high = 0.99;
    const minX = percentile(xs, low);
    const maxX = percentile(xs, high);
    const minY = percentile(ys, low);
    const maxY = percentile(ys, high);
    const minZ = percentile(zs, low);
    const maxZ = percentile(zs, high);
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const scale = 1.72 / Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.0001);

    for (let i = 0; i < validCount; i += 1) {
      const index = i * 3;
      finalPositions[index] = (finalPositions[index] - centerX) * scale;
      finalPositions[index + 1] = -(finalPositions[index + 1] - centerY) * scale;
      finalPositions[index + 2] = (finalPositions[index + 2] - centerZ) * scale;
    }

    return { positions: finalPositions, colors: finalColors, count: validCount };
  }

  function loadAssetScript(url) {
    if (assetPromises.has(url)) return assetPromises.get(url);
    const promise = new Promise(function(resolve, reject) {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = function() { resolve(); };
      script.onerror = function() { reject(new Error('Could not load the bundled point-cloud data.')); };
      document.head.appendChild(script);
    });
    assetPromises.set(url, promise);
    return promise;
  }

  function decodePackedCloud(payload, pointLimit) {
    if (!payload || !payload.data || !payload.count) {
      throw new Error('Bundled point-cloud data is invalid.');
    }

    const binary = window.atob(payload.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    const stride = payload.stride || 9;
    const quantization = payload.quantization || 16000;
    if (bytes.byteLength < payload.count * stride) {
      throw new Error('Bundled point-cloud data is incomplete.');
    }

    const targetCount = Math.min(payload.count, pointLimit);
    const positions = new Float32Array(targetCount * 3);
    const colors = new Uint8Array(targetCount * 3);
    const dataView = new DataView(bytes.buffer);
    const sampleStep = payload.count / targetCount;

    for (let sample = 0; sample < targetCount; sample += 1) {
      const source = Math.min(payload.count - 1, Math.floor(sample * sampleStep));
      const sourceOffset = source * stride;
      const targetOffset = sample * 3;
      positions[targetOffset] = dataView.getInt16(sourceOffset, true) / quantization;
      positions[targetOffset + 1] = dataView.getInt16(sourceOffset + 2, true) / quantization;
      positions[targetOffset + 2] = dataView.getInt16(sourceOffset + 4, true) / quantization;
      colors[targetOffset] = dataView.getUint8(sourceOffset + 6);
      colors[targetOffset + 1] = dataView.getUint8(sourceOffset + 7);
      colors[targetOffset + 2] = dataView.getUint8(sourceOffset + 8);
    }

    return { positions: positions, colors: colors, count: targetCount };
  }

  async function loadPackedCloud(canvas) {
    const assetUrl = canvas.dataset.packed;
    const cloudId = canvas.dataset.cloud;
    if (!assetUrl || !cloudId) return null;
    await loadAssetScript(assetUrl);
    const registry = window.CRAFT_POINT_CLOUDS || {};
    return decodePackedCloud(registry[cloudId], pointLimit());
  }

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Point-cloud shader failed: ' + message);
    }
    return shader;
  }

  function createProgram(gl) {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, [
      'attribute vec3 a_position;',
      'attribute vec3 a_color;',
      'uniform vec2 u_rotation;',
      'uniform float u_zoom;',
      'uniform float u_aspect;',
      'uniform float u_point_size;',
      'varying vec3 v_color;',
      'void main() {',
      '  float cy = cos(u_rotation.x);',
      '  float sy = sin(u_rotation.x);',
      '  float cx = cos(u_rotation.y);',
      '  float sx = sin(u_rotation.y);',
      '  vec3 p = a_position;',
      '  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);',
      '  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);',
      '  float perspective = 1.0 / max(0.72, 1.0 + p.z * 0.14);',
      '  gl_Position = vec4(p.x * u_zoom * perspective / u_aspect, p.y * u_zoom * perspective, p.z * 0.3, 1.0);',
      '  gl_PointSize = max(1.25, u_point_size * (1.0 - p.z * 0.1));',
      '  v_color = a_color;',
      '}'
    ].join('\n'));

    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, [
      'precision mediump float;',
      'varying vec3 v_color;',
      'void main() {',
      '  vec2 point = gl_PointCoord - vec2(0.5);',
      '  if (dot(point, point) > 0.25) discard;',
      '  vec3 lifted = min(vec3(1.0), pow(v_color, vec3(0.82)) * 1.08);',
      '  gl_FragColor = vec4(lifted, 1.0);',
      '}'
    ].join('\n'));

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error('Point-cloud program failed: ' + message);
    }
    return program;
  }

  class PointCloudViewer {
    constructor(canvas) {
      this.canvas = canvas;
      this.stage = canvas.closest('.craft-pointcloud-stage');
      this.activationButton = this.stage ? this.stage.querySelector('.craft-pointcloud-activate') : null;
      this.isInteractive = false;
      this.gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: true,
        powerPreference: 'low-power',
        preserveDrawingBuffer: false
      });
      if (!this.gl) throw new Error('WebGL is not available in this browser.');

      this.program = createProgram(this.gl);
      this.count = 0;
      this.positionBuffer = this.gl.createBuffer();
      this.colorBuffer = this.gl.createBuffer();
      this.locations = {
        position: this.gl.getAttribLocation(this.program, 'a_position'),
        color: this.gl.getAttribLocation(this.program, 'a_color'),
        rotation: this.gl.getUniformLocation(this.program, 'u_rotation'),
        zoom: this.gl.getUniformLocation(this.program, 'u_zoom'),
        aspect: this.gl.getUniformLocation(this.program, 'u_aspect'),
        pointSize: this.gl.getUniformLocation(this.program, 'u_point_size')
      };
      this.pointers = new Map();
      this.lastPinchDistance = null;
      this.bindInteraction();

      const self = this;
      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(function() { self.render(); });
        this.resizeObserver.observe(canvas);
      } else {
        window.addEventListener('resize', function() { self.render(); }, { passive: true });
      }
    }

    setCloud(cloud) {
      const gl = this.gl;
      this.count = cloud.count;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, cloud.positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, cloud.colors, gl.STATIC_DRAW);
      this.render();
    }

    resize() {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(this.canvas.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(this.canvas.clientHeight * pixelRatio));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      return { width: width, height: height, pixelRatio: pixelRatio };
    }

    render() {
      const gl = this.gl;
      const size = this.resize();
      gl.viewport(0, 0, size.width, size.height);
      gl.clearColor(0.019, 0.035, 0.075, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!this.count) return;

      gl.useProgram(this.program);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.enableVertexAttribArray(this.locations.position);
      gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
      gl.enableVertexAttribArray(this.locations.color);
      gl.vertexAttribPointer(this.locations.color, 3, gl.UNSIGNED_BYTE, true, 0, 0);

      gl.uniform2f(this.locations.rotation, view.yaw, view.pitch);
      gl.uniform1f(this.locations.zoom, view.zoom);
      gl.uniform1f(this.locations.aspect, size.width / size.height);
      gl.uniform1f(this.locations.pointSize, 2.2 * size.pixelRatio);
      gl.drawArrays(gl.POINTS, 0, this.count);
    }

    activateInteraction() {
      if (this.isInteractive) return;
      if (activeViewer && activeViewer !== this) activeViewer.deactivateInteraction();
      this.isInteractive = true;
      activeViewer = this;
      if (this.stage) this.stage.classList.add('is-interactive');
      try {
        this.canvas.focus({ preventScroll: true });
      } catch (error) {
        this.canvas.focus();
      }
    }

    deactivateInteraction() {
      if (!this.isInteractive) return;
      this.isInteractive = false;
      this.pointers.clear();
      this.lastPinchDistance = null;
      if (this.stage) this.stage.classList.remove('is-interactive');
      if (activeViewer === this) activeViewer = null;
    }

    bindInteraction() {
      const self = this;
      const canvas = this.canvas;

      if (this.activationButton) {
        this.activationButton.addEventListener('click', function(event) {
          event.preventDefault();
          event.stopPropagation();
          self.activateInteraction();
        });
      }

      canvas.addEventListener('pointerdown', function(event) {
        if (!self.isInteractive) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        canvas.setPointerCapture(event.pointerId);
        self.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (self.pointers.size === 2) self.lastPinchDistance = self.pinchDistance();
      });

      canvas.addEventListener('pointermove', function(event) {
        if (!self.isInteractive) return;
        const previous = self.pointers.get(event.pointerId);
        if (!previous) return;
        self.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (self.pointers.size === 1) {
          view.yaw += (event.clientX - previous.x) * 0.008;
          view.pitch = clamp(view.pitch + (event.clientY - previous.y) * 0.008, -1.35, 1.35);
        } else if (self.pointers.size === 2) {
          const distance = self.pinchDistance();
          if (self.lastPinchDistance) {
            view.zoom = clamp(view.zoom * (distance / self.lastPinchDistance), 0.48, 2.4);
          }
          self.lastPinchDistance = distance;
        }
        queueRender();
      });

      function releasePointer(event) {
        self.pointers.delete(event.pointerId);
        self.lastPinchDistance = self.pointers.size === 2 ? self.pinchDistance() : null;
      }
      canvas.addEventListener('pointerup', releasePointer);
      canvas.addEventListener('pointercancel', releasePointer);

      canvas.addEventListener('wheel', function(event) {
        if (!self.isInteractive) return;
        event.preventDefault();
        view.zoom = clamp(view.zoom * Math.exp(-event.deltaY * 0.001), 0.48, 2.4);
        queueRender();
      }, { passive: false });

      canvas.addEventListener('dblclick', resetView);
      canvas.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && self.isInteractive) {
          self.deactivateInteraction();
          event.preventDefault();
          return;
        }
        if (!self.isInteractive) {
          if (event.key === 'Enter' || event.key === ' ') {
            self.activateInteraction();
            event.preventDefault();
          }
          return;
        }
        const step = event.shiftKey ? 0.18 : 0.09;
        if (event.key === 'ArrowLeft') view.yaw -= step;
        else if (event.key === 'ArrowRight') view.yaw += step;
        else if (event.key === 'ArrowUp') view.pitch = clamp(view.pitch - step, -1.35, 1.35);
        else if (event.key === 'ArrowDown') view.pitch = clamp(view.pitch + step, -1.35, 1.35);
        else if (event.key === '+' || event.key === '=') view.zoom = clamp(view.zoom * 1.1, 0.48, 2.4);
        else if (event.key === '-' || event.key === '_') view.zoom = clamp(view.zoom / 1.1, 0.48, 2.4);
        else if (event.key.toLowerCase() === 'r') resetView();
        else return;
        event.preventDefault();
        queueRender();
      });
    }

    pinchDistance() {
      const points = Array.from(this.pointers.values());
      if (points.length < 2) return 0;
      return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    }
  }

  function resetView() {
    view.yaw = defaultView.yaw;
    view.pitch = defaultView.pitch;
    view.zoom = defaultView.zoom;
    queueRender();
  }

  function pointLimit() {
    const isSmallScreen = window.matchMedia('(max-width: 768px)').matches;
    const hasLowMemory = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4;
    return isSmallScreen || hasLowMemory ? 18000 : 36000;
  }

  async function loadCanvas(canvas) {
    let viewer;
    try {
      viewer = new PointCloudViewer(canvas);
      viewers.push(viewer);
    } catch (error) {
      setStatus(canvas, error.message, 'error');
      return;
    }

    try {
      setStatus(canvas, 'Loading point cloud…', 'loading');
      let cloud = await loadPackedCloud(canvas);
      if (!cloud) {
        let response;
        try {
          response = await fetch(canvas.dataset.ply);
        } catch (error) {
          throw new Error('Could not load this point cloud. Serve the site over HTTP or rebuild its compact assets.');
        }
        if (!response.ok) throw new Error('Could not load this point cloud.');
        const buffer = await response.arrayBuffer();
        setStatus(canvas, 'Optimizing for your device…', 'loading');
        cloud = parseBinaryPly(buffer, pointLimit());
      }
      viewer.setCloud(cloud);
      setStatus(canvas, 'Point cloud ready.', 'loaded');
    } catch (error) {
      setStatus(canvas, error.message || 'Could not display this point cloud.', 'error');
    }
  }

  function loadPointClouds() {
    if (hasLoaded) return;
    hasLoaded = true;
    canvases.forEach(function(canvas) { loadCanvas(canvas); });
  }

  if (resetButton) resetButton.addEventListener('click', resetView);

  document.addEventListener('pointerdown', function(event) {
    if (activeViewer && activeViewer.stage && !activeViewer.stage.contains(event.target)) {
      activeViewer.deactivateInteraction();
    }
  }, true);

  if (window.location.hash === '#why-stereo' || window.location.hash === '#stereo-pointcloud-comparison') {
    loadPointClouds();
  } else if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function(entries) {
      if (entries.some(function(entry) { return entry.isIntersecting; })) {
        observer.disconnect();
        loadPointClouds();
      }
    }, { rootMargin: '320px 0px' });
    observer.observe(section);
  } else {
    loadPointClouds();
  }
})();
