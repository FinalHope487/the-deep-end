// Tile-local atomic S2 acceptance. Nothing mutates a published World2 or snapshot.
import { World2 } from './gen2.js';
import { tileInputs, tileCells, parseTileId } from './gen2-zoning-runtime.js';
import { validateZoningPlan, buildZoningPlan, zoningPairVariants, ZONING } from './gen2-zoning.js';
import { bridgeFragments, bridgeContext, compilePhysicalCandidate, physicalRatioPrefilter } from './gen2-bridge-world.js';
import { bodyPathJob } from './gen2-bridge-walk.js';
import { sealOutcome } from './gen2-seal.js';
import { verifyAffectedGroundJob } from './gen2-s2-connectivity.js';

const s2Freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);for(const v of Object.values(o))s2Freeze(v);}return o;};
const s2Overlap=(a,b,m=0)=>a.x0-m<b.x1&&b.x0-m<a.x1&&a.z0-m<b.z1&&b.z0-m<a.z1;
const s2Boxes=b=>[
  ...b.parts[1].rects.map(rect=>({rect,floors:[b.floor]})),
  ...[b.parts[0],b.parts[2]].map(p=>({rect:p.flight,floors:[0,b.floor]})),
  ...[b.parts[0],b.parts[2]].map(p=>({rect:p.flight.hallEntry,floors:[0]})),
];
export function s2GeometryConflict(bridges,tile){
  const {ti,tj}=parseTileId(tile),loX=ti*512,loZ=tj*512,hiX=loX+512,hiZ=loZ+512;
  for(const b of bridges)for(const {rect:r} of [...s2Boxes(b),...(b.softReservations??[]).map(rect=>({rect}))])
    if(r.x0<loX+1||r.z0<loZ+1||r.x1>hiX-1||r.z1>hiZ-1)return {reason:'owner-boundary',borderId:b.borderId};
  for(let i=0;i<bridges.length;i++)for(let j=i+1;j<bridges.length;j++)
    for(const a of s2Boxes(bridges[i]))for(const b of s2Boxes(bridges[j]))
      if(a.floors.some(f=>b.floors.includes(f))&&s2Overlap(a.rect,b.rect,1))return {reason:'bridge-overlap',borderId:bridges[j].borderId};
  return null;
}

export const s2Cone=(a,b)=>(x,z)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1],px=x-a[0],pz=z-a[1],dot=dx*px+dz*pz;
  return dot>=-1e-9&&dot<=dx*dx+dz*dz+1e-9&&Math.abs(dx*pz-dz*px)<=dot*Math.tan(ZONING.coneHalfDeg*Math.PI/180)+1e-9;
};

export function s2OwnerEscapeLower(a,b,tile){
  const {ti,tj}=parseTileId(tile),x0=ti*512,z0=tj*512,x1=x0+512,z1=z0+512;
  if(![...a,...b].every(Number.isFinite)||[a,b].some(p=>p[0]<x0||p[0]>x1||p[1]<z0||p[1]>z1))throw new RangeError('Escape endpoints must be in the owner tile');
  const mirrors=[[2*x0-b[0],b[1]],[2*x1-b[0],b[1]],[b[0],2*z0-b[1]],[b[0],2*z1-b[1]]];
  const A=[a[0]-x0,x1-a[0],a[1]-z0,z1-a[1]],B=[b[0]-x0,x1-b[0],b[1]-z0,z1-b[1]];
  let lower=Math.min(...mirrors.map(p=>Math.hypot(a[0]-p[0],a[1]-p[1])));
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)if(i!==j)lower=Math.min(lower,A[i]+B[j]);
  return lower;
}

export function s2ConeInsideOwner(a,b,tile){
  const {ti,tj}=parseTileId(tile),dx=b[0]-a[0],dz=b[1]-a[1],t=Math.tan(ZONING.coneHalfDeg*Math.PI/180);
  return [a,[b[0]-dz*t,b[1]+dx*t],[b[0]+dz*t,b[1]-dx*t]].every(p=>p[0]>=ti*512&&p[0]<=(ti+1)*512&&p[1]>=tj*512&&p[1]<=(tj+1)*512);
}

export function* verifyS2SetJob(seed,tile,records,bridges,{inputs=tileInputs(seed,tile),maxStates=250000,batchStates=32,ownerOnly=true}={}){
  const conflict=s2GeometryConflict(bridges,tile);if(conflict)return {status:'refused',...conflict};
  const graph=validateZoningPlan(inputs,{version:1,seed,borders:records});
  if(!graph.ok)return {status:'refused',reason:'graph-contract',detail:graph.problems};
  if(records.length!==bridges.length||new Set(bridges.map(b=>b.borderId)).size!==bridges.length)return {status:'refused',reason:'bridge-record-mismatch'};
  const base=new World2(seed),sealed=[...new Set(bridges.flatMap(b=>b.closedConnectionIds))].sort();
  for(const id of sealed){const r=sealOutcome(base,id);if(r.status!=='sealed')return {status:'refused',reason:'illegal-seal',detail:{id,...r}};}
  const world=new World2(seed,{sealed:new Set(sealed),bridgeParts:bridgeFragments(bridges)});
  const {ti,tj}=parseTileId(tile),halo=ownerOnly?0:128,bounds=[ti*512-halo,tj*512-halo,(ti+1)*512+halo,(tj+1)*512+halo],reports=[];
  const walk=function*(a,b,options){return yield* bodyPathJob(world,a,b,{bounds,maxStates,batchStates,...options});};
  const unknown=r=>r.status==='search-boundary'||r.status==='search-budget-exhausted';
  for(const record of records){
    const bridge=bridges.find(b=>b.borderId===record.id);
    if(!bridge||bridge.parts[0].room!==record.pair.a||bridge.parts[2].room!==record.pair.b||bridge.floor!==record.floor||
       JSON.stringify([...bridge.closedConnectionIds].sort())!==JSON.stringify(record.closedPorts.map(p=>p.connection).sort()))return {status:'refused',reason:'bridge-record-mismatch',borderId:record.id};
    const ends=[record.pair.a,record.pair.b].map(id=>{
      const p=inputs.graph.nodes.get(id)?.anchor;
      if(!p)return null;
      const land=world.surfaceNear(p[0],p[1],0);return land?[...p,land.h]:null;
    });
    if(ends.some(p=>!p))return {status:'refused',reason:'invalid-endpoint',borderId:record.id};
    const [a,b]=ends,escapeLower=s2OwnerEscapeLower(a,b,tile),measure={borderId:record.id,endpoints:ends,drawn:record.ratio,escapeLower,directions:[]};
    if(ownerOnly&&(!s2ConeInsideOwner(a,b,tile)||!s2ConeInsideOwner(b,a,tile)))return {status:'inconclusive',reason:'cone-leaves-owner',borderId:record.id};
    const coneGround=[],coneAll=[];
    for(const [start,end] of [[a,b],[b,a]]){
      const keep=s2Cone(start,end);
      const cg=yield* walk(start,end,{groundOnly:true,keep});coneGround.push(cg);
      if(cg.status!=='unreachable')return {status:unknown(cg)?'inconclusive':'refused',reason:'cone-ground-open',borderId:record.id,search:cg};
      const ca=yield* walk(start,end,{ownBridge:record.id,requireBridge:true,keep});coneAll.push(ca);
    }
    if(!coneAll.some(r=>r.status==='found'))return {status:coneAll.some(unknown)?'inconclusive':'refused',reason:'cone-all-unreachable',borderId:record.id,search:coneAll};
    measure.cones=coneAll.map((r,k)=>({groundStatus:coneGround[k].status,allStatus:r.status,length:r.length,path:r.path??null}));
    for(const [start,end] of [[a,b],[b,a]]){
      const prove=r=>ownerOnly&&r.status==='search-boundary'&&r.incumbent&&escapeLower>=r.incumbent.length-1e-9?{...r,...r.incumbent,status:'found',globalEscapeLower:escapeLower}:r;
      const ground=prove(yield* walk(start,end,{groundOnly:true}));
      const all=prove(yield* walk(start,end,{ownBridge:record.id}));
      const own=prove(yield* walk(start,end,{ownBridge:record.id,requireBridge:true}));
      for(const [kind,r] of [['ground',ground],['all',all],['own',own]])if(r.status!=='found')return {status:unknown(r)?'inconclusive':'refused',reason:`${kind}-walk`,borderId:record.id,search:r};
      const ratio=ground.length/all.length;
      if(ownerOnly&&escapeLower<Math.max(ground.length,all.length,own.length)-1e-9)return {status:'inconclusive',reason:'owner-escape-bound',borderId:record.id,escapeLower};
      if(Math.abs(ratio-record.ratio)>ZONING.tolerance+1e-9)return {status:'refused',reason:'measured-ratio',borderId:record.id,ratio};
      if(!own.usedOwnBridge||Math.abs(own.length-all.length)>1e-6)return {status:'refused',reason:'shortest-bypasses-bridge',borderId:record.id};
      measure.directions.push({walk1F:ground.length,walkAll:all.length,ratio,path:own.path});
    }
    reports.push(measure);
  }
  const connectivity=yield* verifyAffectedGroundJob(base,world,inputs,tile,bridges,{bounds,maxStates,batchStates});
  if(connectivity.status!=='verified')return connectivity;
  return {status:'verified',sealed,reports,connectivity:connectivity.witnesses,connectivityEmptySides:connectivity.emptySides};
}

export function* acceptS2CandidateJob(seed,tile,snapshot,variant,bridge,options={}){
  if(snapshot.seed!==seed||snapshot.tile!==tile)throw new TypeError('S2 snapshot belongs to another world');
  const records=structuredClone(variant.jointRecords),bridges=[...structuredClone(snapshot.bridges),structuredClone(bridge)];
  const inputs=options.inputs??tileInputs(seed,tile),source=buildZoningPlan(inputs).borders.find(r=>r.id===bridge.borderId),candidate=records.find(r=>r.id===bridge.borderId);
  if(!source||!candidate||candidate.ratio!==source.ratio||JSON.stringify(candidate.closedPorts)!==JSON.stringify(source.closedPorts)||JSON.stringify(candidate.closedNodes)!==JSON.stringify(source.closedNodes))return {status:'refused',reason:'s1-contract',snapshot};
  const oldIds=snapshot.records.map(r=>r.id).sort(),newIds=records.filter(r=>r.id!==bridge.borderId).map(r=>r.id).sort();
  if(JSON.stringify(oldIds)!==JSON.stringify(newIds))return {status:'refused',reason:'joint-record-mismatch',snapshot};
  for(const old of snapshot.records){
    const previous=structuredClone(old),next=structuredClone(records.find(r=>r.id===old.id));
    delete previous.verification;delete next.verification;
    if(JSON.stringify(previous)!==JSON.stringify(next))return {status:'refused',reason:'accepted-record-changed',snapshot};
  }
  const result=yield* verifyS2SetJob(seed,tile,records,bridges,{...options,inputs});
  if(result.status!=='verified')return {...result,snapshot};
  return {status:'accepted',snapshot:s2Freeze({seed,tile,records,bridges,sealed:result.sealed,reports:result.reports,connectivity:result.connectivity,connectivityEmptySides:result.connectivityEmptySides})};
}

export function* planS2TileJob(seed,tile,{maxPairs=ZONING.tries,maxVariants=128,maxStates=120000,batchStates=32,reserveSoftFeatures=false}={}){
  if(!Number.isSafeInteger(maxVariants)||maxVariants<1)throw new RangeError('Invalid S2 variant budget');
  const inputs=tileInputs(seed,tile),s1=buildZoningPlan(inputs),cells=tileCells(tile),{ti,tj}=parseTileId(tile);
  const bounds=[ti*512-128,tj*512-128,(ti+1)*512+128,(tj+1)*512+128],decisions=[];
  let snapshot=s2Freeze({seed,tile,records:[],bridges:[],sealed:[],reports:[]});
  const compiledIds=new Set(),bodyIds=new Set();
  for(const source of [...s1.borders].sort((a,b)=>a.id.localeCompare(b.id))){
    yield {status:'planning',borderId:source.id};
    const seals=new Set([...snapshot.sealed,...source.closedPorts.map(p=>p.connection)]);
    const preview=new World2(seed,{sealed:seals,bridgeParts:bridgeFragments(snapshot.bridges)});
    const ctx=bridgeContext(preview,inputs,cells),cache=new Map(),trials=[];
    let accepted=false,count=0;
    const variants=zoningPairVariants(inputs,source,snapshot.records,{maxPairs});
    for(;;){
      const next=variants.next();
      if(next.done){if(next.value?.status==='pair-budget')trials.push({status:'inconclusive',reason:'pair-budget'});break;}
      const variant=next.value;
      if(count++>=maxVariants){trials.push({status:'inconclusive',reason:'variant-budget'});break;}
      const ends=[variant.pair.a,variant.pair.b].map(id=>{
        const p=inputs.graph.nodes.get(id).anchor,land=preview.surfaceNear(p[0],p[1],0);
        return land?[...p,land.h]:null;
      });
      if(ends.some(p=>!p)){trials.push({pair:variant.pair,status:'refused',reason:'invalid-endpoint'});continue;}
      const [a,b]=ends,cones=[s2Cone(a,b),s2Cone(b,a)];
      // A geometry refusal does not depend on the target length. A ratio refusal does.
      const modes=reserveSoftFeatures?[false,true]:[false];
      const possible=modes.flatMap(reserve=>cones.map(keepPath=>compilePhysicalCandidate(variant.graphRecord,ctx,variant.graphRecord.verification.l1f,null,{keepPath,reserveSoftFeatures:reserve})));
      if(possible.every(r=>r.status==='refused'&&r.reason==='geometry-conflict')){
        trials.push({pair:variant.pair,floor:variant.floor,status:'refused',reason:'cone-geometry',detail:possible.map(r=>r.detail)});continue;
      }
      const key=JSON.stringify(ends);let ground=cache.get(key);
      if(!ground){ground=yield* bodyPathJob(preview,a,b,{bounds,groundOnly:true,maxStates,batchStates});cache.set(key,ground);}
      if(ground.status!=='found'){trials.push({pair:variant.pair,status:'inconclusive',reason:'ground-search',search:ground.status});continue;}
      const lower=Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
      const pre=physicalRatioPrefilter({groundLower:ground.length,groundUpper:ground.length,allLower:lower,allUpper:ground.length,drawn:source.ratio});
      if(pre.status!=='possible-unproven'){trials.push({pair:variant.pair,status:'refused',reason:pre.status});continue;}
      for(const reserve of modes){
       for(const keepPath of cones){
        let bridge=compilePhysicalCandidate(variant.graphRecord,ctx,ground.length,null,{keepPath,reserveSoftFeatures:reserve});
        if(bridge.status!=='accepted'){trials.push({pair:variant.pair,floor:variant.floor,...bridge});continue;}
        compiledIds.add(source.id);
        if(reserve){
          const reserved=new World2(seed,{sealed:seals,bridgeParts:bridgeFragments([...snapshot.bridges,bridge])});
          const points=[variant.pair.a,variant.pair.b].map(id=>{const p=inputs.graph.nodes.get(id).anchor,land=reserved.surfaceNear(p[0],p[1],0);return land?[...p,land.h]:null;});
          if(points.some(p=>!p)){trials.push({status:'refused',reason:'reserved-endpoint'});continue;}
          const measured=yield* bodyPathJob(reserved,points[0],points[1],{bounds,groundOnly:true,maxStates,batchStates});
          if(measured.status!=='found'){trials.push({status:'inconclusive',reason:'reserved-ground-search'});continue;}
          bridge=compilePhysicalCandidate(variant.graphRecord,ctx,measured.length,null,{keepPath,reserveSoftFeatures:true});
          if(bridge.status!=='accepted'){trials.push(bridge);continue;}
        }
        const result=yield* acceptS2CandidateJob(seed,tile,snapshot,variant,bridge,{inputs,maxStates,batchStates});
        if(result.status==='accepted'){
          snapshot=result.snapshot;bodyIds.add(source.id);accepted=true;break;
        }
        trials.push({pair:variant.pair,floor:variant.floor,status:result.status,reason:result.reason});
       }
       if(accepted)break;
      }
      if(accepted)break;
    }
    decisions.push({borderId:source.id,status:accepted?'accepted':trials.some(r=>r.status==='inconclusive')?'inconclusive':'refused',trials});
  }
  return s2Freeze({seed,tile,snapshot,decisions,stats:{s1Candidates:s1.borders.length,geometryCompiled:compiledIds.size,bodyVerified:bodyIds.size,atomicAccepted:snapshot.bridges.length}});
}
