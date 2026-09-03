import JSZip from 'jszip';
import {
  Application,
  BlurFilter,
  ColorMatrixFilter,
  Container,
  Filter,
  GlProgram,
  Graphics,
  Matrix,
  NoiseFilter,
  Sprite,
  Texture,
  UniformGroup,
} from 'pixi.js';

const FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`;

const LEATHER_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uLight;
uniform float uTime;
uniform float uTranslucency;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main(void) {
  vec4 source = texture(uTexture, vTextureCoord);
  if (source.a < 0.001) { finalColor = vec4(0.0); return; }
  vec3 color = source.rgb / source.a;
  float lightDistance = distance(vTextureCoord, uLight);
  float localLight = smoothstep(0.88, 0.05, lightDistance);
  float fibers = (hash(vTextureCoord * 620.0 + uTime * 0.025) - 0.5) * 0.035;
  vec3 warm = color * vec3(1.12, 0.96, 0.76) + vec3(0.18, 0.075, 0.018) * localLight;
  color = mix(color, warm, uTranslucency) + fibers;
  float alpha = source.a * mix(1.0, 0.9 + localLight * 0.1, uTranslucency);
  finalColor = vec4(clamp(color, 0.0, 1.0) * alpha, alpha);
}`;

const BLOOM_FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uThreshold;
uniform float uSoftKnee;

void main(void) {
  vec4 source = texture(uTexture, vTextureCoord);
  if (source.a < 0.001) { finalColor = vec4(0.0); return; }
  vec3 color = source.rgb / source.a;
  float peak = max(color.r, max(color.g, color.b));
  float bloomMask = smoothstep(uThreshold - uSoftKnee, uThreshold + uSoftKnee, peak) * source.a;
  float highlight = smoothstep(0.68, 1.0, peak);
  vec3 warmLight = mix(color, vec3(1.0, 0.61, 0.27), 0.46);
  warmLight *= 1.05 + highlight * 0.45;
  finalColor = vec4(clamp(warmLight, 0.0, 1.0) * bloomMask, bloomMask);
}`;

const M = {
  multiply(a, b) {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
  },
  inverse(m) {
    const det = m[0] * m[3] - m[1] * m[2];
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
      (m[2] * m[5] - m[3] * m[4]) / det,
      (m[1] * m[4] - m[0] * m[5]) / det];
  },
  translate(x, y) { return [1, 0, 0, 1, x, y]; },
  rotateAt(radians, point) {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return M.multiply(M.multiply(M.translate(point.x, point.y), [c, s, -s, c, 0, 0]), M.translate(-point.x, -point.y));
  },
  apply(m, p) { return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }; },
};

function anchorOf(part, id) {
  const anchor = part.anchors?.find((item) => item.id === id);
  return anchor ? { x: anchor.partPx[0], y: anchor.partPx[1] } : { x: part.width / 2, y: part.height / 2 };
}

function makeCurtainTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 640;
  const context = canvas.getContext('2d');
  const glow = context.createRadialGradient(286, 260, 34, 300, 300, 438);
  glow.addColorStop(0, '#f4dda8');
  glow.addColorStop(0.38, '#ebcc91');
  glow.addColorStop(0.68, '#d29b59');
  glow.addColorStop(0.88, '#965526');
  glow.addColorStop(1, '#55270f');
  context.fillStyle = glow;
  context.fillRect(0, 0, 640, 640);
  context.globalAlpha = 0.045;
  for (let y = 0; y < 640; y += 2) {
    for (let x = 0; x < 640; x += 2) {
      const value = 168 + Math.floor(Math.random() * 58);
      context.fillStyle = `rgb(${value}, ${value - 17}, ${value - 42})`;
      context.fillRect(x, y, 2, 2);
    }
  }
  context.globalAlpha = 0.055;
  for (let x = 8; x < 640; x += 13 + Math.random() * 11) {
    context.fillStyle = '#6e4f2f';
    context.fillRect(x, 0, Math.random() * 0.7 + 0.25, 640);
  }
  return Texture.from(canvas);
}

function makeVignetteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(220, 222, 92, 245, 248, 350);
  gradient.addColorStop(0, 'rgba(46,20,6,0)');
  gradient.addColorStop(0.55, 'rgba(54,24,8,0.025)');
  gradient.addColorStop(0.79, 'rgba(57,24,7,0.13)');
  gradient.addColorStop(1, 'rgba(38,13,3,0.5)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  return Texture.from(canvas);
}

function buildRig(manifest, textures) {
  const parts = new Map(manifest.parts.map((raw) => [raw.id, {
    ...raw,
    texture: textures.get(raw.id),
    restMatrix: raw.rest?.matrix ?? [1, 0, 0, 1, 0, 0],
  }]));
  const parentJointByChild = new Map();
  const childJointsByParent = new Map();
  manifest.joints.forEach((joint) => {
    parentJointByChild.set(joint.child.partId, joint);
    const children = childJointsByParent.get(joint.parent.partId) ?? [];
    children.push(joint);
    childJointsByParent.set(joint.parent.partId, children);
  });
  const rootId = [...parts.keys()].find((id) => !parentJointByChild.has(id)) ?? manifest.parts[0].id;
  const corners = [...parts.values()].flatMap((part) => [
    { x: 0, y: 0 }, { x: part.width, y: 0 },
    { x: part.width, y: part.height }, { x: 0, y: part.height },
  ].map((point) => M.apply(part.restMatrix, point)));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const bounds = {
    x: Math.min(...xs), y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  const root = parts.get(rootId);
  const rootCenter = M.apply(root.restMatrix, { x: root.width / 2, y: root.height / 2 });
  const neckIds = [];
  let cursor = 'part_015';
  while (cursor && cursor !== rootId) {
    neckIds.unshift(cursor);
    cursor = parentJointByChild.get(cursor)?.parent.partId;
  }
  return { manifest, parts, rootId, rootCenter, bounds, parentJointByChild, childJointsByParent, neckIds };
}

function computeWorld(rig, time, motion) {
  const world = new Map();
  const rootPart = rig.parts.get(rig.rootId);
  const bob = motion ? Math.sin(time * 0.00125) * 13 : 0;
  const rootTurn = motion ? Math.sin(time * 0.00072) * 0.018 : 0;
  let rootPose = M.multiply(M.translate(0, bob), rootPart.restMatrix);
  rootPose = M.multiply(rootPose, M.rotateAt(rootTurn, { x: rootPart.width / 2, y: rootPart.height / 2 }));
  world.set(rig.rootId, rootPose);

  const visit = (parentId) => {
    const parentPose = world.get(parentId);
    const parentRest = rig.parts.get(parentId).restMatrix;
    for (const joint of rig.childJointsByParent.get(parentId) ?? []) {
      const child = rig.parts.get(joint.child.partId);
      let childPose = M.multiply(M.multiply(parentPose, M.inverse(parentRest)), child.restMatrix);
      let rotation = 0;
      if (motion && rig.neckIds.includes(child.id)) {
        const index = rig.neckIds.indexOf(child.id);
        rotation = Math.sin(time * 0.00105 + index * 0.36) * (0.014 + index * 0.0023);
      }
      if (motion && child.id === 'part_017') rotation += Math.sin(time * 0.0017) * 0.026;
      if (rotation) childPose = M.multiply(childPose, M.rotateAt(rotation, anchorOf(child, joint.child.anchorId)));
      world.set(child.id, childPose);
      visit(child.id);
    }
  };
  visit(rig.rootId);
  return world;
}

function matrixForView(matrix, view) {
  return new Matrix(
    matrix[0] * view.scale, matrix[1] * view.scale,
    matrix[2] * view.scale, matrix[3] * view.scale,
    view.ox + matrix[4] * view.scale, view.oy + matrix[5] * view.scale,
  );
}

export async function createPixiStage(host, config, callbacks = {}) {
  const app = new Application();
  await app.init({
    resizeTo: host,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    backgroundAlpha: 0,
    preference: 'webgl',
  });
  host.appendChild(app.canvas);
  app.canvas.setAttribute('aria-label', '实时渲染的仙鹤皮影舞台');

  const scene = new Container();
  const curtain = new Sprite(makeCurtainTexture());
  const light = new Graphics();
  const shadowLayer = new Container();
  const bloomLayer = new Container();
  const puppetLayer = new Container();
  const selectionFrame = new Graphics();
  const vignette = new Sprite(makeVignetteTexture());
  scene.addChild(curtain, light, shadowLayer, bloomLayer, puppetLayer, selectionFrame, vignette);
  app.stage.addChild(scene);

  curtain.eventMode = 'static';
  curtain.cursor = 'default';
  curtain.on('pointertap', () => {
    config.selectedPartId = null;
    callbacks.onPartClear?.();
  });
  light.eventMode = 'none';
  shadowLayer.eventMode = 'none';
  bloomLayer.eventMode = 'none';
  selectionFrame.eventMode = 'none';
  vignette.eventMode = 'none';

  light.blendMode = 'screen';
  const lightBlur = new BlurFilter({ strength: 64, quality: 3, resolution: 0.5 });
  light.filters = [lightBlur];
  const shadowBlur = new BlurFilter({ strength: config.blur, quality: 3, resolution: 0.75 });
  shadowLayer.filters = [shadowBlur];
  shadowLayer.blendMode = 'multiply';
  const bloomUniforms = new UniformGroup({
    uThreshold: { value: 0.34, type: 'f32' },
    uSoftKnee: { value: 0.2, type: 'f32' },
  });
  const bloomExtract = new Filter({
    glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment: BLOOM_FRAGMENT, name: 'woop-bloom-extract' }),
    resources: { bloomUniforms },
    padding: 48,
  });
  const bloomBlur = new BlurFilter({ strength: 12, quality: 4, resolution: 0.65 });
  bloomLayer.filters = [bloomExtract, bloomBlur];
  bloomLayer.blendMode = 'screen';

  const leatherUniforms = new UniformGroup({
    uLight: { value: new Float32Array([0.5, 0.42]), type: 'vec2<f32>' },
    uTime: { value: 0, type: 'f32' },
    uTranslucency: { value: config.translucency, type: 'f32' },
  });
  const leatherFilter = new Filter({
    glProgram: GlProgram.from({ vertex: FILTER_VERTEX, fragment: LEATHER_FRAGMENT, name: 'woop-leather-light' }),
    resources: { leatherUniforms },
    padding: 12,
  });
  const focusBlur = new BlurFilter({ strength: 0.45, quality: 2, resolution: 1 });
  puppetLayer.filters = [leatherFilter, focusBlur];

  const noiseFilter = new NoiseFilter({ noise: config.grain, seed: 0.37 });
  const colorFilter = new ColorMatrixFilter();
  colorFilter.contrast(0.025, false);
  colorFilter.saturate(-0.08, true);
  colorFilter.brightness(1.08, true);
  scene.filters = [noiseFilter, colorFilter];

  const response = await fetch(`${import.meta.env.BASE_URL}animal-he-002.woop`);
  if (!response.ok) throw new Error(`无法载入仙鹤素材（${response.status}）`);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const manifest = JSON.parse(await zip.file('woop.json').async('string'));
  const urls = [];
  const textures = new Map();
  await Promise.all(manifest.parts.map(async (part) => {
    const group = manifest.partAssets?.[part.id];
    const assetId = group?.defaultAssetId ?? Object.keys(group?.items ?? {})[0];
    const path = group?.items?.[assetId]?.path ?? `parts/${part.id}/00.webp`;
    const entry = zip.file(path);
    if (!entry) throw new Error(`Woop 缺少部件：${path}`);
    const bytes = await entry.async('uint8array');
    const mime = path.endsWith('.webp') ? 'image/webp' : path.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    urls.push(url);
    const image = new Image();
    image.src = url;
    await image.decode();
    textures.set(part.id, Texture.from(image));
  }));

  const rig = buildRig(manifest, textures);
  const ordered = [...rig.parts.values()].sort((a, b) => (a.rest?.zIndex ?? 0) - (b.rest?.zIndex ?? 0));
  const bodySprites = new Map();
  const shadowSprites = new Map();
  const bloomSprites = new Map();
  const partBlurFilters = new Map();
  ordered.forEach((part) => {
    const shadow = new Sprite(part.texture);
    shadow.tint = 0x6b2f16;
    shadow.alpha = 0.56;
    shadowLayer.addChild(shadow);
    shadowSprites.set(part.id, shadow);
    const bloom = new Sprite(part.texture);
    bloomLayer.addChild(bloom);
    bloomSprites.set(part.id, bloom);
    const sprite = new Sprite(part.texture);
    const partBlur = new BlurFilter({ strength: 0, quality: 2, resolution: 0.8 });
    partBlur.enabled = false;
    sprite.filters = [partBlur];
    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';
    sprite.on('pointertap', (event) => {
      event.stopPropagation();
      config.selectedPartId = part.id;
      callbacks.onPartSelect?.(part.id);
    });
    puppetLayer.addChild(sprite);
    bodySprites.set(part.id, sprite);
    partBlurFilters.set(part.id, partBlur);
  });

  const pointer = { x: app.screen.width * 0.44, y: app.screen.height * 0.39, targetX: app.screen.width * 0.44, targetY: app.screen.height * 0.39 };
  const updatePointer = (event) => {
    const rect = app.canvas.getBoundingClientRect();
    pointer.targetX = event.clientX - rect.left;
    pointer.targetY = event.clientY - rect.top;
  };
  app.canvas.addEventListener('pointermove', updatePointer);

  let view = { scale: 1, ox: 0, oy: 0 };
  const layout = () => {
    const { width, height } = app.screen;
    curtain.width = width;
    curtain.height = height;
    vignette.width = width;
    vignette.height = height;
    const scale = Math.min(width / rig.bounds.width, height / rig.bounds.height) * 0.78;
    view = {
      scale,
      ox: (width - rig.bounds.width * scale) / 2 - rig.bounds.x * scale,
      oy: (height - rig.bounds.height * scale) / 2 - rig.bounds.y * scale + height * 0.035,
    };
    pointer.x = pointer.targetX = width * 0.44;
    pointer.y = pointer.targetY = height * 0.39;
  };
  layout();
  app.renderer.on('resize', layout);

  let frameCount = 0;
  let fpsStamp = performance.now();
  const tick = () => {
    const now = performance.now();
    pointer.x += (pointer.targetX - pointer.x) * 0.075;
    pointer.y += (pointer.targetY - pointer.y) * 0.075;
    light.clear().circle(pointer.x, pointer.y, Math.max(app.screen.width, app.screen.height) * 0.22)
      .fill({ color: 0xffe3a9, alpha: 0.105 + Math.sin(now * 0.0015) * 0.012 });
    shadowBlur.strength = config.blur;
    noiseFilter.noise = config.grain;
    noiseFilter.seed = (now * 0.000013) % 1;
    shadowLayer.alpha = config.shadowOpacity;
    bloomLayer.alpha = Math.min(1, config.glow * 1.35);
    bloomBlur.strength = 7 + config.glow * 27;
    puppetLayer.alpha = config.puppetOpacity;
    leatherUniforms.uniforms.uTime = now * 0.001;
    leatherUniforms.uniforms.uTranslucency = config.translucency;
    leatherUniforms.uniforms.uLight[0] = pointer.x / Math.max(app.screen.width, 1);
    leatherUniforms.uniforms.uLight[1] = pointer.y / Math.max(app.screen.height, 1);
    const dx = (app.screen.width * 0.5 - pointer.x) / Math.max(app.screen.width, 1);
    const dy = (app.screen.height * 0.5 - pointer.y) / Math.max(app.screen.height, 1);
    shadowLayer.position.set(dx * config.shadowDistance, dy * config.shadowDistance + 7);

    const world = computeWorld(rig, now, config.motion);
    ordered.forEach((part) => {
      const matrix = matrixForView(world.get(part.id), view);
      bodySprites.get(part.id).setFromMatrix(matrix);
      shadowSprites.get(part.id).setFromMatrix(matrix);
      bloomSprites.get(part.id).setFromMatrix(matrix);
      const partBlur = partBlurFilters.get(part.id);
      const partBlurStrength = Number(config.partBlur?.[part.id] ?? 0);
      partBlur.enabled = partBlurStrength > 0.01;
      partBlur.strength = partBlurStrength;
    });

    selectionFrame.clear();
    const selectedSprite = bodySprites.get(config.selectedPartId);
    if (selectedSprite) {
      const bounds = selectedSprite.getBounds();
      const pad = 7;
      selectionFrame.roundRect(
        bounds.minX - pad,
        bounds.minY - pad,
        bounds.maxX - bounds.minX + pad * 2,
        bounds.maxY - bounds.minY + pad * 2,
        6,
      ).stroke({ color: 0xe5ad56, width: 1.4, alpha: 0.9 });
      callbacks.onPartAnchor?.({
        x: Math.min(app.screen.width - 130, Math.max(130, (bounds.minX + bounds.maxX) / 2)),
        y: Math.min(app.screen.height - 88, Math.max(12, bounds.maxY + 12)),
      });
    }

    frameCount += 1;
    if (now - fpsStamp > 300) {
      callbacks.onFps?.(Math.round((frameCount * 1000) / (now - fpsStamp)));
      frameCount = 0;
      fpsStamp = now;
    }
  };
  app.ticker.add(tick);
  callbacks.onReady?.({ parts: rig.parts.size, joints: manifest.joints.length, renderer: 'WebGL', partIds: ordered.map((part) => part.id) });

  return () => {
    app.ticker.remove(tick);
    app.canvas.removeEventListener('pointermove', updatePointer);
    app.renderer.off('resize', layout);
    urls.forEach((url) => URL.revokeObjectURL(url));
    app.destroy(true, { children: true, texture: true, textureSource: true });
  };
}
