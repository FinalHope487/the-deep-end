// Composition file: the default structural config. `cellSize` and `maxSpaceExtent` live only here
// (and in the config a World descriptor stores); `maxSpaceExtent` limits X and Z only.
export const DEFAULT_STRUCTURAL_CONFIG = Object.freeze({
  cellSize: 64,
  maxSpaceExtent: 64,
});
