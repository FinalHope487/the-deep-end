import test from 'node:test';
import assert from 'node:assert/strict';
import { World2, CELL2, Q2, flightH, cellRaster } from '../../js/gen2.js';
import { tileInputs, tileCells } from '../../js/gen2-zoning-runtime.js';
import { buildZoningPlan } from '../../js/gen2-zoning.js';
import { compilePlan, bridgeFragments } from '../../js/gen2-bridge-world.js';
import { Player } from '../../js/player.js';

function fixture() {
  const seed = 42, tile = 'zt:-1,0', cells = tileCells(tile), inputs = tileInputs(seed, tile);
  const bridge = compilePlan(new World2(seed), inputs, cells, buildZoningPlan(inputs)).results.find(b => b.status === 'accepted');
  assert.ok(bridge);
  return { bridge, world: new World2(seed, { bridgeParts: bridgeFragments([bridge]) }) };
}

test('S2 reservations remove only intersecting 1F soft features in a private snapshot',()=>{
  const base=new World2(42);let found;
  for(let j=-2;j<=2&&!found;j++)for(let i=-2;i<=2&&!found;i++){
    const p=base.plan(i,j),pool=p.pools.find(o=>o.lv===0);
    if(pool)found={i,j,p,pool};
  }
  assert.ok(found);
  const {i,j,p,pool}=found,before=structuredClone(p),s=pool.shape;
  const rect={x0:Math.floor((s.cx-s.hw)/Q2)*Q2,x1:Math.ceil((s.cx+s.hw)/Q2)*Q2,z0:Math.floor((s.cz-s.hd)/Q2)*Q2,z1:Math.ceil((s.cz+s.hd)/Q2)*Q2};
  const fragments=new Map([[`${i},${j}`,{rooms:[],flights:[],reservations:[rect]}]]);
  const world=new World2(42,{bridgeParts:fragments});
  rect.x1=Infinity;
  const adjusted=world.plan(i,j);
  assert.ok(adjusted.s2Removed.pools>=1);
  for(const key of ['rooms','flights','voids','ladders','windows'])assert.deepEqual(adjusted[key],before[key],key);
  assert.deepEqual(adjusted.pools.filter(o=>o.lv!==0),before.pools.filter(o=>o.lv!==0));
  assert.deepEqual(base.plan(i,j),before);
  assert.deepEqual(new World2(42).plan(i,j),before);
});

test('seed42 bridge becomes cell-owned rooms and flights without changing its base world', () => {
  const { bridge, world } = fixture(), parts = bridgeFragments([bridge]), plain = new World2(42);
  assert.ok(parts.size >= 2);
  for (const [key, fragments] of parts) {
    const [i,j] = key.split(',').map(Number), plan = world.plan(i,j);
    for (const r of plan.rooms.filter(r => r.bridgeId)) {
      assert.equal(r.bridgeId, bridge.borderId);
      assert.ok(r.x0 >= i*CELL2 && r.x1 <= (i+1)*CELL2 && r.z0 >= j*CELL2 && r.z1 <= (j+1)*CELL2);
    }
    assert.equal(plan.rooms.filter(r => r.bridgeId).length, fragments.rooms.length);
    assert.equal(plain.plan(i,j).rooms.some(r => r.bridgeId), false);
  }
  for (const part of [bridge.parts[0], bridge.parts[2]]) {
    const f = part.flight, x = (f.x0+f.x1)/2, z = (f.z0+f.z1)/2;
    assert.ok(world.planAt(x,z).flights.some(f => f.bridgeId === bridge.borderId));
    assert.equal(world.surfaceAt(x,z,flightH(f,x,z))?.h, flightH(f,x,z));
  }
});

test('Player can follow both bridge stairs and the whole passage in both directions', () => {
  const { bridge, world } = fixture(), p = new Player();
  const a = bridge.parts[0], b = bridge.parts[2], line = bridge.parts[1].line;
  const points = [a.entry, a.exit, ...line.slice(1,-1), b.exit, b.entry];
  for (const route of [points, [...points].reverse()]) {
    p.reset(...[route[0][0],route[0][1]],0,0);
    for (let k=1;k<route.length;k++) {
      const from=route[k-1], to=route[k], n=Math.ceil(Math.hypot(to[0]-from[0],to[1]-from[1])/.1);
      for(let s=1;s<=n;s++) {
        const x=from[0]+(to[0]-from[0])*s/n,z=from[1]+(to[1]-from[1])*s/n;
        assert.ok(p.canStand(world,x,z,p.floorH),`blocked ${x},${z},${p.floorH}`);
        p.step(world,x,z);
      }
    }
    assert.equal(p.floorH,0);
  }
});

test('bridge cell meshes build finite geometry and keep the injected snapshot private', async () => {
  const { loadMesher } = await import('./mesh-helper.mjs');
  await loadMesher();
  const { buildCell2 } = await import('../../js/mesh2.js');
  const { bridge } = fixture(), parts = bridgeFragments([bridge]);
  const world = new World2(42, { bridgeParts: parts });
  const key = [...parts.keys()][0], [i,j] = key.split(',').map(Number);
  parts.get(key).rooms.length = 0;
  assert.ok(world.plan(i,j).rooms.some(r => r.bridgeId));
  for (const key of bridgeFragments([bridge]).keys()) {
    const [i,j]=key.split(',').map(Number), it=buildCell2(world,i,j);
    let r=it.next(); while(!r.done) r=it.next();
    assert.ok(r.value.static.attributes.position.array.length>0);
    assert.ok(r.value.static.attributes.position.array.every(Number.isFinite));
  }
});

test('bridge passage boundaries match the mesher grid instead of quarter-metre collision edges', () => {
  const { bridge } = fixture();
  for(const part of bridgeFragments([bridge]).values()) for(const r of part.rooms) {
    for(const value of [r.x0,r.x1,r.z0,r.z1]) assert.equal(value/Q2,Math.round(value/Q2),'raster and collision must share the same boundary');
  }
});

test('two bridges in a cell bind their own numeric passage ID and a satellite ceiling', () => {
  const makeRoom = (id,spaceId,x0,x1,ceil) => ({id,spaceId,x0,x1,z0:5,z1:55,lv:0,kind:'hall',ceil,lamps:[]});
  const base = {i:0,j:0,ox:0,oz:0,primaryHallId:0,rooms:[makeRoom(0,'main',0,20,5),makeRoom(7,'satellite',20,60,2.5)],flights:[],pools:[],voids:[],columns:[],windows:[],ladders:[]};
  const fragments = { rooms: [], flights: [] };
  for(const [k,z] of [[0,10],[1,30]]) {
    const id=`passage${k}`;
    fragments.rooms.push({id,spaceId:id,x0:43,x1:60,z0:z,z1:z+4,lv:1,kind:'bridge',ceil:3,lamps:[],bridgeId:id});
    fragments.flights.push({axis:'x',x0:30,x1:43,z0:z,z1:z+3.5,up:1,lo:0,hi:1,y0:0,y1:6,hallEntry:{x0:28,x1:30,z0:z+.25,z1:z+3.25},entry:[29,z+1.75],hallSpaceId:'satellite',room:id,bridgeId:id});
  }
  class FixtureWorld extends World2 { makePlan() { return structuredClone(base); } }
  const w=new FixtureWorld(42,{bridgeParts:new Map([['0,0',fragments]])});
  const plan=w.plan(0,0);
  for(const f of plan.flights) {
    assert.equal(f.hall,7);
    assert.equal(plan.rooms.find(r=>r.id===f.hall).ceil,2.5);
    assert.equal(plan.rooms.find(r=>r.id===f.room).bridgeId,f.bridgeId);
    assert.equal(typeof f.room,'number');
  }
  assert.notEqual(plan.flights[0].room,plan.flights[1].room);
  const missing=structuredClone(fragments);missing.flights[0].room='missing';
  assert.throws(()=>new FixtureWorld(42,{bridgeParts:new Map([['0,0',missing]])}),/exit room/);
  missing.flights[0].hallSpaceId='missing';
  assert.throws(()=>new FixtureWorld(42,{bridgeParts:new Map([['0,0',missing]])}),/entry room/);
});

test('B1 bridge floors meet at every cell seam without a mesh wall across the passage', async () => {
  const {loadMesher}=await import('./mesh-helper.mjs');await loadMesher();
  const {buildCell2}=await import('../../js/mesh2.js');
  const {bridge,world}=fixture(),line=bridge.parts[1].line;
  let seams=0;
  for(let k=1;k<line.length;k++) {
    const a=line[k-1],b=line[k],axis=a[0]===b[0]?1:0,other=1-axis;
    for(let edge=Math.ceil((Math.min(a[axis],b[axis])+.001)/CELL2)*CELL2;edge<Math.max(a[axis],b[axis]);edge+=CELL2) {
      seams++;
      for(const sign of [-1,1]) {
        const point=[...a];point[axis]=edge+sign*.1;
        assert.ok(world.roomAt(bridge.floor,...point));
        assert.ok(new Player().canStand(world,...point,world.Y[bridge.floor]));
      }
      const point=[...a];point[axis]=edge-.1;
      const i=Math.floor(point[0]/CELL2),j=Math.floor(point[1]/CELL2),r=cellRaster(world,i,j,bridge.floor);
      const at=(x,z)=>Math.floor((z-j*CELL2)/Q2)*r.n+Math.floor((x-i*CELL2)/Q2);
      assert.equal(r.inside[at(...point)],1);
      const it=buildCell2(world,i,j);let out=it.next();while(!out.done)out=it.next();
      const pos=out.value.static.attributes.position.array,idx=out.value.static.index;
      // The stub stores the raw index array. Only vertical faces through the centre could seal this doorway.
      const indices=idx.array??idx;
      for(let t=0;t<indices.length;t+=3) {
        const tri=[0,1,2].map(q=>Array.from(pos.slice(indices[t+q]*3,indices[t+q]*3+3)));
        if(!tri.every(v=>Math.abs(v[axis===0?0:2]-edge)<1e-5))continue;
        const across=tri.map(v=>v[other===0?0:2]),ys=tri.map(v=>v[1]);
        assert.ok(!(Math.min(...across)<a[other]&&Math.max(...across)>a[other]&&Math.min(...ys)<world.Y[bridge.floor]+1.6&&Math.max(...ys)>world.Y[bridge.floor]+.2),'seam has a wall across the walking centre');
      }
    }
  }
  assert.ok(seams>0);
});
