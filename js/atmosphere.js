// Tension T (0 relaxed → 1 oppressive) drives fog, light colour, lamp flicker and new-chunk ceilings.
import * as THREE from 'three';

const TENSION_FULL_SECONDS = 25 * 60;
const FOG_FAR_RELAXED = 45, FOG_FAR_TENSE = 18;
export const CEIL_RELAXED = 6, CEIL_TENSE = 3.5;   // single-floor room ceilings, relaxed → most tense

const FOG_A = new THREE.Color(0.62, 0.69, 0.71), FOG_B = new THREE.Color(0.012, 0.035, 0.045);
const LIGHT_A = new THREE.Color(0.82, 0.8, 0.77), LIGHT_B = new THREE.Color(0.2, 0.27, 0.28);
const LAMP_A = new THREE.Color(1, 1, 1), LAMP_B = new THREE.Color(0.45, 0.62, 0.66);
const WATER_A = new THREE.Color(0.95, 0.98, 1), WATER_B = new THREE.Color(0.14, 0.3, 0.36);   // the water's own teal is baked per vertex
const SUN_A = new THREE.Color(1, 0.9, 0.7), SUN_B = new THREE.Color(0.45, 0.6, 0.7);

export function tensionTarget(visitedCount, elapsed) {
  return Math.min(1, Math.max(visitedCount / 4, elapsed / TENSION_FULL_SECONDS));
}

export class Atmosphere {
  constructor(scene, mats) {
    this.scene = scene;
    this.mats = mats;
    this.T = 0;
    this.flicker = 0;     // seconds left in current flicker
    this.fog = new THREE.Fog(FOG_A.clone(), 10, FOG_FAR_RELAXED);
    scene.fog = this.fog;
    scene.background = this.fog.color;
    this.fogFar = FOG_FAR_RELAXED;
  }

  // smooth towards target (spec: approaches every second, never jumps)
  update(dt, target, fogCap, fogMul) {
    this.T += (target - this.T) * Math.min(1, dt * 0.5);
    if (Math.abs(target - this.T) < 1e-4) this.T = target;
    const T = this.T;
    this.fogFar = Math.min((FOG_FAR_RELAXED + (FOG_FAR_TENSE - FOG_FAR_RELAXED) * T) * fogMul, fogCap);
    this.fog.far = this.fogFar;
    this.fog.near = this.fogFar * 0.22;
    this.fog.color.lerpColors(FOG_A, FOG_B, Math.min(1, T * 1.15));
    this.mats.static.color.lerpColors(LIGHT_A, LIGHT_B, T);
    this.mats.abyss.color.copy(this.mats.static.color);   // an abyss wall dims with the rest; its black stays black and fog never reaches it
    this.mats.water.color.lerpColors(WATER_A, WATER_B, T);
    this.mats.prop.color.lerpColors(LIGHT_A, LIGHT_B, T);
    // sunbeams fade and cool off as the place turns oppressive
    this.mats.sun.color.lerpColors(SUN_A, SUN_B, T);
    this.mats.sun.opacity = 0.75 * (1 - 0.85 * T);
    let lamp = 1;
    if (dt <= 0) this.flicker = 0;   // paused: hold the lights steady
    else if (this.flicker > 0) { this.flicker -= dt; lamp = 0.15 + Math.random() * 0.25; }
    else if (T > 0.55 && Math.random() < (T - 0.55) * 1.5 * dt) this.flicker = 0.06 + Math.random() * 0.1;
    this.mats.lamp.color.lerpColors(LAMP_A, LAMP_B, T).multiplyScalar(lamp);
  }

  // tile (static material) colour for the current tension: lamps flicker, the tiles do not
  staticNominal(out) {
    return out.lerpColors(LIGHT_A, LIGHT_B, this.T);
  }

  // lamp colour for the current tension without any flicker
  lampNominal(out) {
    return out.lerpColors(LAMP_A, LAMP_B, this.T);
  }

  ceiling() {
    return CEIL_RELAXED + (CEIL_TENSE - CEIL_RELAXED) * this.T;
  }
}
