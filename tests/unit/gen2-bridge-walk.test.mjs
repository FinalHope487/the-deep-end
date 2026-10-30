import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyPath, bodyPathJob, bodyReachJob, bridgeProgress } from '../../js/gen2-bridge-walk.js';
import { slow } from './slow.mjs';

const flat = (wall=false) => ({
  bodyR:.4, Y:{'-1':-6,0:0,1:6}, levelAt:()=>0,
  blockedAt:(x,z)=>x<0||x>12||z<0||z>12||(wall&&x>5&&x<7&&z<9),
  surfaceAt(x,z){return this.blockedAt(x,z)?null:{h:0,wl:NaN};},
  headBlockedAt:()=>false,railHit:()=>false,
  planAt:()=>({ladders:[],voids:[],rooms:[],flights:[]}),flightAt:()=>null,
});

test('one physical flood proves multiple entrances and preserves partial budget evidence',()=>{
  const run=job=>{for(;;){const n=job.next();if(n.done)return n.value;}};
  const targets=[[2,2,0],[10,2,0],[10,10,0]],options={bounds:[0,0,12,12],groundOnly:true};
  const result=run(bodyReachJob(flat(true),[2,2,0],targets,options));
  assert.equal(result.status,'found');assert.equal(result.reached.length,3);
  assert.deepEqual(result.reached.map(r=>r.point).sort(),targets.sort());
  const limited=run(bodyReachJob(flat(true),[2,2,0],targets,{...options,maxStates:2}));
  assert.equal(limited.status,'search-budget-exhausted');assert.equal(limited.reached.length,1);
});

test('bodyPath finds the shortest physical lattice walk and independently returns',()=>{
  const w=flat();
  for(const [a,b] of [[[2,2,0],[9,7,0]],[[9,7,0],[2,2,0]]]) {
    const r=bodyPath(w,a,b,{bounds:[0,0,12,12]});
    assert.equal(r.status,'found');assert.equal(r.length,12);
    assert.deepEqual(r.path[0],a);assert.deepEqual(r.path.at(-1),b);
  }
});
test('bodyPath routes around a wall and never calls that path its own bridge',()=>{
  const r=bodyPath(flat(true),[2,2,0],[10,2,0],{bounds:[0,0,12,12],ownBridge:'missing'});
  assert.equal(r.status,'found');assert.ok(r.length>20);assert.equal(r.usedOwnBridge,false);
  const own=bodyPath(flat(),[2,2,0],[10,2,0],{bounds:[0,0,12,12],ownBridge:'missing',requireBridge:true});
  assert.equal(own.status,'unreachable');
});
test('bodyPath distinguishes a budget or unknown boundary from proven failure',()=>{
  assert.equal(bodyPath(flat(true),[2,2,0],[10,2,0],{bounds:[0,0,12,12],maxStates:2}).status,'search-budget-exhausted');
  assert.equal(bodyPath(flat(true),[2,2,0],[10,2,0],{bounds:[1,1,11,5]}).status,'search-boundary');
});

test('resumable search preserves the synchronous result and reports honest budget bounds',()=>{
  const options={bounds:[0,0,12,12],batchStates:2},start=[2,2,0],end=[10,2,0];
  const job=bodyPathJob(flat(true),start,end,options);let result,yields=0;
  for(;;){const n=job.next();if(n.done){result=n.value;break;}yields++;assert.equal(n.value.status,'searching');}
  assert.ok(yields>1);assert.deepEqual(result,bodyPath(flat(true),start,end,options));
  const bounded=bodyPath(flat(true),start,end,{...options,maxStates:2});
  assert.equal(bounded.status,'search-budget-exhausted');assert.ok(bounded.lowerBound>=8);assert.equal(bounded.upperBound,Infinity);assert.equal(bounded.incumbent,null);
});

test('1F search rejects unrelated B1 travel inside a split footprint',()=>{
  const w=flat();
  w.levelAt=h=>h===0?0:-1;
  w.planAt=()=>({ladders:[],flights:[],rooms:[],voids:[{kind:'split',x0:0,z0:0,x1:12,z1:12,run:'x',gap:[5.5,6.5]}]});
  w.surfaceAt=()=>({h:-6,wl:NaN});
  assert.equal(bodyPath(w,[2,2,-6],[10,2,-6],{bounds:[0,0,12,12],groundOnly:true}).status,'invalid-start');
});

test('an endpoint at the wrong physical height fails before expanding states',()=>{
  const w=flat(), original=w.surfaceAt;
  w.surfaceAt=function(x,z,h){return x>8?{h:-1,wl:-.6}:original.call(this,x,z,h);};
  const r=bodyPath(w,[2,2,0],[10,2,0],{bounds:[0,0,12,12]});
  assert.equal(r.status,'invalid-target');assert.equal(r.expanded,0);
});

test('endpoint validation does not sweep rails from the remote start',()=>{
  const w=flat();
  w.railHit=(x,z,r,h,fromX,fromZ)=>Math.hypot(x-fromX,z-fromZ)>1;
  assert.equal(bodyPath(w,[2,2,0],[10,2,0],{bounds:[0,0,12,12]}).status,'found');
});

test('logical 1F keeps a paired split crossing but excludes its adjacent B1 floor',()=>{
  const w=flat(),v={kind:'split',x0:0,z0:4,x1:12,z1:8,run:'x',gap:[5.5,6.5]};
  const ladders=[{x:6,z:4,nx:0,nz:1,h0:-6,h1:0},{x:6,z:8,nx:0,nz:-1,h0:-6,h1:0}];
  const plan={voids:[v],ladders,flights:[],rooms:[]};
  w.planAt=()=>plan;w.levelAt=h=>h< -3?-1:0;
  w.surfaceAt=function(x,z,h){const floor=z>4&&z<8?-6:0;return !this.blockedAt(x,z)&&Math.abs(h-floor)<.8?{h:floor,wl:NaN}:null;};
  const r=bodyPath(w,[6,2,0],[6,10,0],{bounds:[0,0,12,12],groundOnly:true});
  assert.equal(r.status,'found');assert.ok(r.path.some(p=>p[2]===-6));
  assert.equal(bodyPath(w,[2,6,-6],[10,6,-6],{bounds:[0,0,12,12],groundOnly:true}).status,'invalid-start');
});

test('full bridge proof rejects a touched stair or a passage out-and-back',()=>{
  const run=zones=>zones.reduce(bridgeProgress,0);
  assert.equal(run(['ground:A','base:A','ground:A']),1);
  assert.equal(run(['ground:A','base:A','far:A','passage','far:A','base:A','ground:A']),1);
  assert.notEqual(run(['ground:A','base:A','far:A','passage','base:B','ground:B']),7,'dipping into the other stair from 1F is not a crossing');
  assert.equal(run(['ground:A','base:A','far:A','passage','far:B','base:B','ground:B']),7);
  assert.equal(run(['ground:B','base:B','far:B','passage','far:A','base:A','ground:A']),-7);
});

test('a ladder cannot jump across a forbidden direction region',()=>{
  const w=flat(), ladder={x:1.25,z:2,nx:1,nz:0,h0:0,h1:4};
  w.planAt=()=>({ladders:[ladder],voids:[],rooms:[],flights:[]});
  w.surfaceAt=function(x,z,h){return this.blockedAt(x,z,h)?null:{h:h>2?4:0,wl:NaN};};
  const groundBlocked=w.blockedAt;
  w.blockedAt=(x,z,h)=>groundBlocked(x,z)||(h>2&&!(x>=.3&&x<=2&&z>=.3&&z<=3.7));
  const r=bodyPath(w,[2,2,0],[.8,2,4],{bounds:[0,0,12,12],keep:x=>!(x>1.1&&x<1.3)});
  assert.equal(r.status,'unreachable');
});

test('seed42 body search crosses its own physical bridge in both directions',slow,async()=>{
  const {World2}=await import('../../js/gen2.js');
  const {tileInputs,tileCells}=await import('../../js/gen2-zoning-runtime.js');
  const {buildZoningPlan}=await import('../../js/gen2-zoning.js');
  const {compilePlan,bridgeFragments}=await import('../../js/gen2-bridge-world.js');
  const tile='zt:-1,0',inputs=tileInputs(42,tile);
  const bridge=compilePlan(new World2(42),inputs,tileCells(tile),buildZoningPlan(inputs)).results.find(b=>b.status==='accepted');
  const world=new World2(42,{bridgeParts:bridgeFragments([bridge]),sealed:new Set(bridge.closedConnectionIds)});
  const a=[bridge.endpoints.A.x,bridge.endpoints.A.z,0],b=[bridge.endpoints.B.x,bridge.endpoints.B.z,0];
  const lengths=[];
  for(const [start,end] of [[a,b],[b,a]]){
    const r=bodyPath(world,start,end,{bounds:[-576,-64,64,576],ownBridge:bridge.borderId,requireBridge:true});
    assert.equal(r.status,'found');assert.equal(r.usedOwnBridge,true);
    assert.deepEqual(r.path[0],start);assert.deepEqual(r.path.at(-1),end);
    assert.ok(r.path.some(p=>Math.abs(p[2]-world.Y[bridge.floor])<1e-6));
    lengths.push(r.length);
  }
  assert.ok(Math.abs(lengths[0]-lengths[1])<1e-6);
});
