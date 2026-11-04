import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createAssets } from "./courtyardAssets.js";
import { createEnvironment } from "./courtyardEnvironment.js";
import { createHuman } from "./courtyardHuman.js";
import { createRitualTimeline } from "./ritualTimeline";

/** Client-only disposable renderer. Never owns authentication, DOM IDs or shared history. */
export function createCourtyard(host, options) {
  const lifetime = new AbortController();
  const assets = createAssets(lifetime.signal);
  let disposed = false,
    ready = false,
    frameId = 0,
    reduced = options.reducedMotion;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#b9bfae");
  scene.fog = new THREE.Fog("#b9bfae", 16, 36);
  const camera = new THREE.PerspectiveCamera(41, 1, 0.05, 70);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.1, -0.55);
  controls.enableDamping = !reduced;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 11;
  controls.minPolarAngle = 0.45;
  controls.maxPolarAngle = 1.49;
  controls.minAzimuthAngle = -1;
  controls.maxAzimuthAngle = 1.35;
  const environment = createEnvironment(scene, assets);
  let elapsed = 0;
  const human = createHuman(
    scene,
    environment,
    assets,
    (_id, text, subtitle) => {
      options.onPhase(text, subtitle, Math.min(1, elapsed / 14));
    },
  );
  const timeline = createRitualTimeline({
    pose(seconds) {
      elapsed = seconds;
      human.ritual(seconds);
    },
    complete() {
      environment.placePending();
      human.rest();
      options.onComplete();
      draw();
    },
  });
  timeline.setReducedMotion(reduced);

  function draw() {
    if (disposed || !ready) return;
    environment.updateSmoke(performance.now(), reduced);
    renderer.render(scene, camera);
  }
  function frame(now) {
    frameId = 0;
    if (disposed || document.hidden) return;
    if (ready) {
      if (timeline.running) timeline.step(now);
      else human.rest(reduced ? 0 : now / 1000);
    }
    controls.update();
    draw();
    if (!reduced) frameId = requestAnimationFrame(frame);
  }
  function schedule() {
    if (disposed || document.hidden || frameId) return;
    if (reduced) {
      controls.update();
      draw();
    } else frameId = requestAnimationFrame(frame);
  }
  function resize() {
    if (disposed) return;
    const width = Math.max(1, host.clientWidth),
      height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    schedule();
  }
  function resetView() {
    if (disposed) return;
    controls.enableDamping = false;
    camera.position.set(4.2, 2.35, 6);
    controls.target.set(0, 1.1, -0.55);
    if (host.clientWidth < 550) {
      camera.position.set(5, 2.9, 7.7);
      controls.target.set(0.25, 1.15, -0.4);
    }
    controls.update();
    controls.enableDamping = !reduced;
    draw();
  }
  function orbitChange() {
    if (reduced) draw();
  }
  function visibility() {
    if (document.hidden) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    } else schedule();
  }
  function contextLost(event) {
    event.preventDefault();
    fail();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  controls.addEventListener("change", orbitChange);
  document.addEventListener("visibilitychange", visibility);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  options.signal.addEventListener("abort", dispose, { once: true });
  function dispose() {
    if (disposed) return;
    disposed = true;
    lifetime.abort();
    timeline.dispose();
    cancelAnimationFrame(frameId);
    observer.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    options.signal.removeEventListener("abort", dispose);
    controls.removeEventListener("change", orbitChange);
    controls.dispose();
    human.dispose();
    renderer.domElement.removeEventListener("webglcontextlost", contextLost);
    assets.disposeObject(scene);
    if (scene.environment) scene.environment.dispose();
    assets.dispose();
    scene.clear();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  }
  function fail() {
    if (!disposed) {
      dispose();
      options.onError();
    }
  }
  resize();
  resetView();
  Promise.all([
    ...assets.tasks,
    assets.environment().then((texture) => {
      if (disposed) {
        texture.dispose();
        assets.dispose();
        return;
      }
      scene.environment = texture;
      scene.environmentIntensity = 0.55;
    }),
    human.load(),
  ])
    .then(() => {
      if (disposed) return;
      ready = true;
      human.rest();
      options.onReady();
      schedule();
    })
    .catch(() => fail());
  if (options.signal.aborted) dispose();
  return {
    start() {
      if (ready && !disposed) {
        timeline.start(performance.now());
        schedule();
      }
    },
    skip() {
      timeline.skip();
    },
    setReducedMotion(value) {
      if (disposed) return;
      reduced = value;
      timeline.setReducedMotion(value);
      controls.enableDamping = !value;
      if (value) {
        cancelAnimationFrame(frameId);
        frameId = 0;
        if (ready) human.rest();
      }
      schedule();
    },
    resetView,
    confirm() {
      if (!disposed) {
        environment.confirm();
        draw();
      }
    },
    rollback() {
      if (!disposed) {
        environment.rollback();
        draw();
      }
    },
    dispose,
  };
}
