// Which links a bridge may replace (S2 slice 4). A link is sealed by giving World2 its connection id in `sealed`; this says whether the link can be.
// A corridor and a connector room can. A seam is the opening of one shared hall and a district link is a cluster's own passage: there is no wall to
// close, so they are refused. A link that is a wall already (the district prune) is refused too. Pure: it asks the world for the raw link only.
// { status: 'sealed' } or { status: 'refused', reason: 'seam' | 'district' | 'already-closed' | 'unknown-link' }
const ID = /^v2:edge:([xz]):(-?\d+),(-?\d+)$/;

export function sealOutcome(world, connectionId) {
  const m = ID.exec(String(connectionId));
  if (!m) return { status: 'refused', reason: 'unknown-link' };
  const c = world.connectionOf(Number(m[2]), Number(m[3]), m[1], true);
  if (c.mode === 'corridor' || c.mode === 'connector-room') return { status: 'sealed' };
  return { status: 'refused', reason: c.mode === 'closed' ? 'already-closed' : c.mode };
}
