// Shared constants for the v3 core contracts. No cell size lives here (it is
// part of World.structuralConfig).
export const FORMAT_VERSION = 1;
export const PROTOCOL_VERSION = 1;
export const PHASE_ID = 'p1';
export const QUERY_VERSION = 1;
export const SEED_MAX = 4294967295;
export const KINDS = Object.freeze(['w', 'r', 'l', 's', 'f']);
export const EXIT_STATES = Object.freeze(['locked', 'open', 'reached']);
export const FALLBACK_REASONS = Object.freeze([
  'PLAYER_POSITION_INVALID', 'LAST_FREE_POSITION_INVALID', 'NO_SAFE_POSITION']);
export const JOB_TYPES = Object.freeze(['init', 'query', 'cancel']);
