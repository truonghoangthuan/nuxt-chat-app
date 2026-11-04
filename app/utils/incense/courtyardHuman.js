import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Original v2 two-arm IK, articulated fingers and absolute-time approach/bow/retreat.
export function createHuman(scene, environment, assets, setPhase) {
  const { held } = environment;
  const smooth = (t) => {
    t = THREE.MathUtils.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  let person,
    bones = {},
    bind = {};
  let mixer, idleClip;
  function saveBind() {
    person.traverse((o) => {
      if (o.isBone) {
        bones[o.name] = o;
        bind[o.name] = o.quaternion.clone();
      }
    });
  }
  function resetBones() {
    for (const n in bones) bones[n].quaternion.copy(bind[n]);
  }
  function rotateBone(n, x = 0, y = 0, z = 0) {
    const b = bones[n];
    if (b)
      b.quaternion.multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)),
      );
  }
  const world = (o) => o.getWorldPosition(new THREE.Vector3());
  function aim(b, child, target) {
    person.updateMatrixWorld(true);
    const origin = world(b),
      a = world(child).sub(origin).normalize(),
      d = target.clone().sub(origin).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(a, d),
      w = b.getWorldQuaternion(new THREE.Quaternion());
    w.premultiply(delta);
    const parentQ = b.parent
      .getWorldQuaternion(new THREE.Quaternion())
      .invert();
    b.quaternion.copy(parentQ.multiply(w));
    person.updateMatrixWorld(true);
  }
  function armIK(side, target) {
    const upper = bones["upperarm_" + side],
      lower = bones["lowerarm_" + side],
      hand = bones["hand_" + side];
    person.updateMatrixWorld(true);
    const a = world(upper),
      el = world(lower),
      h = world(hand),
      L1 = a.distanceTo(el),
      L2 = el.distanceTo(h);
    let d = target.clone().sub(a),
      dist = Math.min(d.length(), L1 + L2 - 0.005);
    d.normalize();
    const along = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist),
      height = Math.sqrt(Math.max(0.0001, L1 * L1 - along * along));
    const pole = new THREE.Vector3(
      side === "l" ? 0.6 : -0.6,
      -0.75,
      -0.1,
    ).applyQuaternion(person.quaternion);
    pole.addScaledVector(d, -pole.dot(d)).normalize();
    const elbow = a
      .clone()
      .addScaledVector(d, along)
      .addScaledVector(pole, height);
    aim(upper, lower, elbow);
    aim(lower, hand, target);
  }
  const localWorld = (x, y, z) =>
    person.localToWorld(new THREE.Vector3(x, y, z));
  function poseHands(y, z, separation = 0.083) {
    armIK("l", localWorld(separation, y, z));
    armIK("r", localWorld(-separation, y - 0.035, z + 0.015));
    for (const side of ["l", "r"]) {
      aim(
        bones["hand_" + side],
        bones["middle_01_" + side],
        localWorld(0, y + 0.045, z + 0.025),
      );
      for (const f of ["index", "middle", "ring", "pinky"]) {
        rotateBone(`${f}_01_${side}`, 0.16, 0, 0);
        rotateBone(`${f}_02_${side}`, 0.65, 0, 0);
        rotateBone(`${f}_03_${side}`, 0.48, 0, 0);
      }
      rotateBone("thumb_02_" + side, 0.25, 0, 0);
    }
  }
  function rest(t = 0) {
    if (!person) return;
    resetBones();
    person.position.set(1.65, 0, 0.9);
    person.rotation.set(0, 0.35, 0);
    if (mixer) {
      mixer.setTime(t % 6);
    }
    person.updateMatrixWorld(true);
    held.visible = false;
  }
  async function load() {
    const buffer = await assets.buffer("sam.glb");
    const gltf = await new GLTFLoader().parseAsync(buffer, "");
    if (assets.signal.aborted) {
      assets.disposeObject(gltf.scene);
      return false;
    }
    person = gltf.scene;
    scene.add(person);
    person.traverse((o) => {
      if (o.name.startsWith("Phone")) o.visible = false;
      if (o.isMesh) o.castShadow = o.receiveShadow = true;
    });
    saveBind();
    mixer = new THREE.AnimationMixer(person);
    idleClip = gltf.animations[0];
    if (idleClip) mixer.clipAction(idleClip).play();
    mixer.setTime(0);
    saveBind();
    const bounds = new THREE.Box3().setFromObject(person),
      height = bounds.max.y - bounds.min.y;
    person.scale.multiplyScalar(1.78 / height);
    rest();
    return true;
  }
  function ritual(t) {
    resetBones();
    person.rotation.set(0, Math.PI, 0);
    person.position.set(0, 0, 0.08);
    let handY = 1.16,
      handZ = 0.31,
      bow = 0,
      heldVisible = true;
    if (t < 3) {
      const u = smooth(t / 3);
      person.position.set(
        1.65 * (1 - u),
        0,
        THREE.MathUtils.lerp(0.9, 0.08, u),
      );
      person.rotation.y = THREE.MathUtils.lerp(0.35, Math.PI, smooth(t / 0.7));
      const gait = Math.sin(t * 7) * 0.24 * Math.sin((Math.PI * t) / 3);
      rotateBone("thigh_l", gait);
      rotateBone("thigh_r", -gait);
      rotateBone("calf_l", Math.max(0, -gait) * 0.8);
      rotateBone("calf_r", Math.max(0, gait) * 0.8);
      handY = 1.02;
      handZ = 0.25;
      setPhase(
        "approach",
        "Chậm bước đến sân.",
        "Một khoảng lặng, dành riêng cho bạn.",
      );
    } else if (t < 5.4) {
      const u = smooth((t - 3) / 2.4);
      handY = THREE.MathUtils.lerp(1.02, 1.39, u);
      handZ = 0.31;
      setPhase(
        "raise",
        "Dâng hương bằng hai tay.",
        "Giữ lại một ý nghĩ hiền lành.",
      );
    } else if (t < 8) {
      bow = Math.sin(((t - 5.4) / 2.6) * Math.PI) * 0.25;
      handY = 1.39 - bow * 0.5;
      handZ = 0.31 + bow * 0.5;
      rotateBone("spine_01", bow);
      rotateBone("spine_02", bow * 0.5);
      rotateBone("head", bow * 0.3);
      setPhase(
        "bow",
        "Cúi đầu, gửi một lời bình an.",
        "Không cần thành tiếng.",
      );
    } else if (t < 11) {
      const u = smooth((t - 8) / 2.1);
      person.position.z = THREE.MathUtils.lerp(0.08, -0.12, u);
      handY = THREE.MathUtils.lerp(1.39, 1.11, u);
      handZ = THREE.MathUtils.lerp(0.31, 0.61, u);
      rotateBone("spine_01", 0.17 * u);
      handY += 0.02;
      heldVisible = t < 10.4;
      if (t >= 10.4) environment.placePending();
      setPhase(
        "place",
        "Đặt nén hương vào lư.",
        "Một điều lành nhỏ đã được gửi đi.",
      );
    } else {
      const u = smooth((t - 11) / 3);
      person.position.set(1.65 * u, 0, THREE.MathUtils.lerp(-0.12, 0.9, u));
      handY = THREE.MathUtils.lerp(1.11, 1.0, smooth((t - 11) / 1));
      handZ = THREE.MathUtils.lerp(0.45, 0.22, u);
      heldVisible = false;
      rotateBone("thigh_l", Math.sin(t * 7) * 0.14 * Math.sin(u * Math.PI));
      rotateBone("thigh_r", -Math.sin(t * 7) * 0.14 * Math.sin(u * Math.PI));
      setPhase(
        "retreat",
        "Lùi lại, để hương nhẹ bay.",
        "Khoảnh khắc này chỉ được ghi một lần.",
      );
    }
    person.updateMatrixWorld(true);
    poseHands(handY, handZ);
    const lh = world(bones.middle_01_l),
      rh = world(bones.middle_01_r);
    held.position.copy(lh.add(rh).multiplyScalar(0.5));
    held.position.y -= 0.018;
    held.visible = heldVisible;
  }

  return {
    load,
    rest,
    ritual,
    dispose() {
      if (mixer) {
        mixer.stopAllAction();
        mixer.uncacheRoot(person);
      }
    },
  };
}
