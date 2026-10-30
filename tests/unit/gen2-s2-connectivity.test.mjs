import test from 'node:test';
import assert from 'node:assert/strict';
import {commonGroundPoint,preserveGroundReachJob,s2EntranceSeeds} from '../../js/gen2-s2-connectivity.js';
import {World2,shapeContains,poolDepth,WADE_MAX} from '../../js/gen2.js';

const smallWorld=(cut=false)=>({
  bodyR:.4,Y:{'-1':-6,0:0,1:6},levelAt:()=>0,
  blockedAt:(x,z)=>x<0||x>12||z<0||z>12||(cut&&x>5.5&&x<6.5),
  surfaceAt(x,z){return this.blockedAt(x,z)?null:{h:0,wl:NaN};},
  headBlockedAt:()=>false,railHit:()=>false,flightAt:()=>null,
  planAt:()=>({ladders:[],voids:[],flights:[],rooms:[]}),
});
const finish=job=>{for(;;){const n=job.next();if(n.done)return n.value;}};

test('split regions keep only the open entrances assigned to their own graph node',()=>{
  const links=[{id:'left',a:'hall',b:'n1',line:[[2,4],[0,4]]},{id:'right',a:'hall',b:'n2',line:[[10,4],[12,4]]}];
  const edges=new Map([['left',{a:'hall#split:0',b:'n1'}],['right',{a:'hall#split:1',b:'n2'}]]);
  assert.deepEqual(s2EntranceSeeds('hall#split:1',links,edges),[{point:[10,4]}]);
  assert.deepEqual(s2EntranceSeeds('hall#split:0',[...links].reverse(),edges),[{point:[2,4]}]);
});

test('connectivity representatives are deterministic, dry and valid in both worlds',()=>{
  const before=smallWorld(),after=smallWorld(true),rects=[{x0:0,x1:12,z0:0,z1:12}];
  const a=commonGroundPoint(before,after,rects,[2,2]);
  assert.equal(a.status,'found');assert.ok(a.point[0]<5.5||a.point[0]>6.5);
  assert.deepEqual(commonGroundPoint(before,after,rects,[2,2]),a);
  assert.equal(commonGroundPoint(before,after,rects,[6,6]).reason,'baseline-point-obstructed');
  after.surfaceAt=()=>({h:-6,wl:NaN});
  assert.equal(commonGroundPoint(before,after,rects,[6,6],{maxPoints:4}).status,'inconclusive');
});

test('an entrance representative cannot move across an isolating wall into another side',()=>{
  const before=smallWorld(),after=smallWorld();
  after.blockedAt=(x,z)=>x<6||x>12||z<0||z>12;
  const left=[{x0:0,x1:5.5,z0:0,z1:12}];
  assert.equal(commonGroundPoint(before,after,left,[5,6]).status,'inconclusive');
});

test('a proven 1F wading pool keeps its own baseline height after reservation makes it dry',()=>{
  const before=smallWorld(),after=smallWorld(),pool={lv:0,shape:{type:'rect',cx:6,cz:6,hw:6,hd:6},axis:'x',flip:false,d0:.7,d1:.7,water:-.6};
  before.planAt=()=>({pools:[pool],rooms:[],flights:[],voids:[],ladders:[]});
  before.surfaceAt=(x,z,h)=>Math.abs(h+1.3)<.8?{h:-1.3,wl:-.6}:null;
  const rects=[{x0:0,x1:12,z0:0,z1:12}],r=commonGroundPoint(before,after,rects,[6,6],{allowWading:true});
  assert.equal(r.status,'found');assert.ok(Math.abs(r.beforePoint[2]+1.3)<1e-9);assert.equal(r.point[2],0);
  pool.lv=-1;
  assert.equal(commonGroundPoint(before,after,rects,[6,6],{allowWading:true,maxPoints:4}).status,'inconclusive');
});

test('real seed42 pool distinguishes the walkable anchor from the deep artificial side',()=>{
  const before=new World2(42),x=-222.25,z=94.25;
  const pool=before.planAt(x,z).pools.find(p=>p.lv===0&&shapeContains(p.shape,x,z));
  assert.ok(pool);assert.ok(poolDepth(pool,x,z)<=WADE_MAX);
  const after=new World2(42,{bridgeParts:new Map([['-4,1',{rooms:[],flights:[],reservations:[{x0:x-1,x1:x+1,z0:z-1,z1:z+1}]}]])});
  const rects=[{x0:-233,x1:-198,z0:70,z1:119}];
  const r=commonGroundPoint(before,after,rects,[x,z],{allowWading:true});
  assert.equal(r.status,'found');assert.ok(r.beforePoint[2]<-.6);assert.equal(r.point[2],0);
  assert.ok(poolDepth(pool,-232.25,z)>WADE_MAX);
  const deep=commonGroundPoint(before,after,rects,[-232.25,z],{allowWading:true,maxDistance:.1});
  assert.equal(deep.reason,'no-baseline-ground');assert.equal(deep.baselinePoints,0);
  const limited=commonGroundPoint(before,after,rects,[-232.25,z],{allowWading:true,maxPoints:1});
  assert.equal(limited.reason,'representative-budget');assert.equal(limited.checkedPoints,1);
});

test('an explicit 1F ramp remains a baseline floor and cannot be omitted after blockage',()=>{
  const before=smallWorld(),after=smallWorld(),room={lv:0,x0:0,x1:12,z0:0,z1:12,slope:{axis:'x',a0:0,a1:4,b0:8,b1:12,d:1}};
  before.planAt=()=>({rooms:[room],pools:[],flights:[],voids:[],ladders:[]});
  before.surfaceAt=(x,z,h)=>Math.abs(h-1)<.8?{h:1,wl:NaN}:null;
  const r=commonGroundPoint(before,after,[room],[6,6],{allowWading:true});
  assert.equal(r.status,'found');assert.equal(r.beforePoint[2],1);assert.equal(r.point[2],0);
  after.blockedAt=()=>true;
  assert.equal(commonGroundPoint(before,after,[room],[6,6],{allowWading:true}).reason,'baseline-point-obstructed');
});

test('a non-endpoint entrance cut from its old component refuses acceptance',()=>{
  const hub=[2,2,0],targets=[[2,10,0],[10,2,0]],options={bounds:[0,0,12,12]};
  const r=finish(preserveGroundReachJob(smallWorld(),smallWorld(true),hub,targets,options));
  assert.equal(r.status,'refused');assert.equal(r.reason,'affected-room-disconnected');
  const limited=finish(preserveGroundReachJob(smallWorld(),smallWorld(),hub,targets,{...options,maxStates:2}));
  assert.equal(limited.status,'inconclusive');
});
