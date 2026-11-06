// P1 pure summary and diagnostic DOM rendering. No imports from entry/ or v1.
export function buildP1Summary(descriptor, snapshot) {
  if (!descriptor || typeof descriptor !== 'object' ||
      !snapshot || typeof snapshot !== 'object') {
    throw new TypeError('P1 summary requires a descriptor and a snapshot');
  }
  if (!Number.isInteger(descriptor.seed) || descriptor.seed < 0 ||
      descriptor.seed > 4294967295 ||
      typeof descriptor.worldId !== 'string' ||
      !Array.isArray(descriptor.modules) ||
      snapshot.worldId !== descriptor.worldId ||
      !Array.isArray(snapshot.spaces) ||
      typeof snapshot.structuralDigest !== 'string' ||
      !/^[0-9a-f]{64}$/.test(snapshot.structuralDigest)) {
    throw new TypeError('Invalid P1 world descriptor or snapshot');
  }
  return Object.freeze({
    seed: descriptor.seed,
    worldId: descriptor.worldId,
    moduleCount: descriptor.modules.length,
    spaceCount: snapshot.spaces.length,
    structuralDigest: snapshot.structuralDigest,
  });
}

export function renderP1Diagnostic(state) {
  const status = document.getElementById('p1-status');
  const error = document.getElementById('p1-error');
  const details = document.getElementById('p1-summary');
  error.hidden = true;
  details.hidden = true;
  error.textContent = '';

  if (state.error) {
    status.textContent = 'P1 initialization failed';
    error.textContent = `${state.error.code}: ${state.error.message}`;
    error.hidden = false;
    return;
  }
  if (!state.ready) {
    status.textContent = 'Initializing P1…';
    return;
  }
  const fields = {
    'p1-seed': state.summary.seed,
    'p1-world-id': state.summary.worldId,
    'p1-module-count': state.summary.moduleCount,
    'p1-space-count': state.summary.spaceCount,
    'p1-structural-digest': state.summary.structuralDigest,
  };
  for (const [id, value] of Object.entries(fields)) {
    document.getElementById(id).textContent = String(value);
  }
  details.hidden = false;
  status.textContent = 'P1 diagnostic ready';
}
