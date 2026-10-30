import test from 'node:test';
import assert from 'node:assert/strict';
import { s2GeometryConflict, acceptS2CandidateJob, planS2TileJob, s2OwnerEscapeLower, s2ConeInsideOwner } from '../../js/gen2-s2-runtime.js';
import { slow } from './slow.mjs';

const descriptor=(id,x0=10,floor=1)=>({status:'accepted',borderId:id,floor,parts:[
  {flight:{x0,x1:x0+3,z0:10,z1:25,lo:0,hi:floor===1?1:0,hallEntry:{x0,x1:x0+3,z0:8,z1:10}}},
  {rects:[{x0,x1:x0+3,z0:25,z1:35}]},
  {flight:{x0,x1:x0+3,z0:35,z1:50,lo:floor===-1?-1:0,hi:floor===1?1:0,hallEntry:{x0,x1:x0+3,z0:50,z1:52}}},
]});

test('owner escape bounds cover any neighboring topology without rounding away the margin',()=>{
  const a=[799.75,-416.25,0],b=[799.75,-352.25,0];
  assert.equal(s2OwnerEscapeLower(a,b,'zt:1,-1'),255.5);
  const c=[-289.25,94.25,0],d=[-222.25,94.25,0],lower=s2OwnerEscapeLower(c,d,'zt:-1,0');
  assert.ok(Math.abs(lower-200.05311794620948)<1e-10);assert.ok(lower>200);
  assert.equal(s2OwnerEscapeLower(d,c,'zt:-1,0'),lower);
  assert.equal(s2ConeInsideOwner(c,d,'zt:-1,0'),true);assert.equal(s2ConeInsideOwner(d,c,'zt:-1,0'),true);
  assert.ok(s2OwnerEscapeLower([1,.1,0],[2,.1,0],'zt:0,0')<10);
  assert.equal(s2ConeInsideOwner([1,.1,0],[2,.1,0],'zt:0,0'),false);
});
test('S2 refuses overlapping bridges and geometry outside its owner tile',()=>{
  assert.equal(s2GeometryConflict([descriptor('a')],'zt:0,0'),null);
  assert.equal(s2GeometryConflict([descriptor('a'),descriptor('b',11)],'zt:0,0').reason,'bridge-overlap');
  assert.equal(s2GeometryConflict([descriptor('a',511)],'zt:0,0').reason,'owner-boundary');
});

test('S2 includes entrance clearances when stair bodies do not overlap',()=>{
  const a=descriptor('a'),b=descriptor('b');
  for(const part of b.parts){const rects=part.flight?[part.flight,part.flight.hallEntry]:part.rects;for(const r of rects){r.z0+=44;r.z1+=44;}}
  assert.equal(s2GeometryConflict([a,b],'zt:0,0')?.reason,'bridge-overlap');
});

test('seed42 atomic acceptance refuses the ratio-valid bridge whose stairs leave the cone',async()=>{
  const {World2}=await import('../../js/gen2.js');
  const {tileInputs,tileCells}=await import('../../js/gen2-zoning-runtime.js');
  const {buildZoningPlan,zoningPairVariants}=await import('../../js/gen2-zoning.js');
  const {bridgeContext,compilePhysicalCandidate}=await import('../../js/gen2-bridge-world.js');
  const tile='zt:1,-1',inputs=tileInputs(42,tile),source=buildZoningPlan(inputs).borders.find(b=>b.id==='db:z:6,-4');
  const variant=[...zoningPairVariants(inputs,source)].find(v=>v.floor===1&&v.pair.a==='v2:space:6,-4:r7'&&v.pair.b==='v2:space:6,-3:r0');
  assert.ok(variant);
  const bridge=compilePhysicalCandidate(variant.graphRecord,bridgeContext(new World2(42),inputs,tileCells(tile)),208);
  assert.equal(bridge.status,'accepted');
  const snapshot={seed:42,tile,records:[],bridges:[],sealed:[]},before=structuredClone(snapshot);
  const job=acceptS2CandidateJob(42,tile,snapshot,variant,bridge);let result;
  for(;;){const n=job.next();if(n.done){result=n.value;break;}}
  assert.equal(result.status,'refused');assert.equal(result.reason,'cone-all-unreachable');
  assert.deepEqual(snapshot,before);assert.equal(result.snapshot,snapshot);
});

test('seed42 tile atomically accepts a bidirectional cone-valid measured bridge',slow,()=>{
  const job=planS2TileJob(42,'zt:1,-1');let result;
  for(;;){const n=job.next();if(n.done){result=n.value;break;}}
  assert.equal(result.stats.s1Candidates,2);assert.ok(result.stats.atomicAccepted>=1);
  const snapshot=result.snapshot,record=snapshot.records.find(r=>r.id==='db:z:6,-4');
  assert.ok(record);assert.ok(Object.isFrozen(snapshot));assert.ok(Object.isFrozen(snapshot.bridges[0].parts));
  const report=snapshot.reports.find(r=>r.borderId===record.id);
  assert.equal(report.directions.length,2);
  for(const d of report.directions){assert.ok(Math.abs(d.ratio-record.ratio)<=.15);assert.ok(d.path.length>2);}
  assert.ok(snapshot.sealed.length>0);assert.equal(snapshot.bridges.length,snapshot.records.length);
});
