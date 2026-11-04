import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

/** A fresh asset scope per opening: fetches abort; late decodes are closed, never attached. */
export function createAssets(signal) {
  const textures = new Set();
  const tasks = [];
  async function buffer(name) {
    const response = await fetch(`/incense/assets/${name}`, { signal });
    if (!response.ok)
      throw new Error(`Courtyard asset ${name}: ${response.status}`);
    return await response.arrayBuffer();
  }
  function texture(name) {
    const value = new THREE.Texture();
    textures.add(value);
    tasks.push(
      (async () => {
        const bytes = await buffer(name);
        const bitmap = await createImageBitmap(new Blob([bytes]), {
          imageOrientation: "flipY",
        });
        if (signal.aborted) {
          bitmap.close();
          return;
        }
        value.image = bitmap;
        value.needsUpdate = true;
      })(),
    );
    return value;
  }
  async function environment() {
    const hdr = new HDRLoader().parse(await buffer("sky.hdr"));
    const value = new THREE.DataTexture(
      hdr.data,
      hdr.width,
      hdr.height,
      THREE.RGBAFormat,
      hdr.type,
    );
    textures.add(value);
    value.mapping = THREE.EquirectangularReflectionMapping;
    value.minFilter = THREE.LinearFilter;
    value.magFilter = THREE.LinearFilter;
    value.needsUpdate = true;
    return value;
  }
  function disposeObject(root) {
    const geometries = new Set(),
      materials = new Set(),
      skeletons = new Set();
    root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.skeleton) skeletons.add(object.skeleton);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) textures.add(value);
      }
      object.shadow?.dispose();
    });
    geometries.forEach((value) => value.dispose());
    materials.forEach((value) => value.dispose());
    skeletons.forEach((value) => value.dispose());
    // A GLB parse can finish after close; its newly decoded textures still need teardown.
    if (signal.aborted) dispose();
  }
  function dispose() {
    const images = new Set();
    textures.forEach((value) => {
      if (value.source?.data) images.add(value.source.data);
      value.dispose();
    });
    images.forEach((image) => image.close?.());
    textures.clear();
  }
  return {
    signal,
    buffer,
    texture,
    environment,
    tasks,
    disposeObject,
    dispose,
  };
}
