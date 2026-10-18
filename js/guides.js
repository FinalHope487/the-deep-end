// Which loaded chunks need rebuilding when the way on changes. Pure data, no three.js.

// the part of a chunk's guide that gets baked into its geometry (door signs and lamps); '' = no guide
export const guideKey = (g) => (g ? `${g.zone}:${g.x}:${g.z}` : '');

// only chunks whose guide differs from the one they were built with: not every chunk in range
export function staleGuideChunks(loaded, ctxFn) {
  const out = [];
  for (const c of loaded) {
    if (c.layout.kind === 'zone') continue;
    if (guideKey(ctxFn(c.cx, c.cz, c.layout).guide) !== c.guideKey) out.push(c);
  }
  return out;
}

// a chunk is drawn only when it is on the player's floor or the one above / below it
export const floorVisible = (chunkLevel, playerLevel) => Math.abs(chunkLevel - playerLevel) <= 1;
