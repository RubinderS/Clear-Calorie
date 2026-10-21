import * as THREE from 'three';

/**
 * Materials and shapes the 3D rabbit and its equipment share: toon shading
 * with outlines, in one place so a scene can dispose of everything at once.
 */
export type Kit = {
  /** A toon material; `outline` sets the outline's thickness, or turns it off for tiny details. */
  toon(colour: string, outline?: number | false): THREE.MeshToonMaterial;
  /** Flat colour with no shading or outline, for eye shines and blush. */
  flat(colour: string, opacity?: number): THREE.MeshBasicMaterial;
  /** A sphere, scaled into an ellipsoid if asked, that casts a shadow. */
  ball(
    radius: number,
    material: THREE.Material,
    scale?: [number, number, number],
    detail?: [number, number],
  ): THREE.Mesh;
  dispose(): void;
};

const OUTLINE: [number, number, number] = [0.17, 0.17, 0.16];

/** Three tones of light and shade, for the cartoon look. */
function toonGradient(): THREE.DataTexture {
  const tones = new Uint8Array([110, 190, 255]);
  const texture = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createKit(): Kit {
  const gradientMap = toonGradient();
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  return {
    toon(colour, outline = 0.01) {
      const material = new THREE.MeshToonMaterial({color: colour, gradientMap});
      material.userData.outlineParameters =
        outline === false ? {visible: false} : {thickness: outline, color: OUTLINE};
      materials.push(material);
      return material;
    },
    flat(colour, opacity = 1) {
      const material = new THREE.MeshBasicMaterial({color: colour, transparent: opacity < 1, opacity});
      material.userData.outlineParameters = {visible: false};
      materials.push(material);
      return material;
    },
    ball(radius, material, scale = [1, 1, 1], detail = [28, 18]) {
      const geometry = new THREE.SphereGeometry(radius, ...detail);
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.scale.set(...scale);
      mesh.castShadow = true;
      return mesh;
    },
    dispose() {
      for (const material of materials) material.dispose();
      for (const geometry of geometries) geometry.dispose();
      gradientMap.dispose();
    },
  };
}
