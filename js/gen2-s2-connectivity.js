// Physical connectivity witnesses for entrances affected by S2 geometry or seals.
import { Player } from './player.js';
import { roomGraphRecords } from './gen2-measure.js';
import { bridgeContext } from './gen2-bridge-world.js';
import { bodyReachJob } from './gen2-bridge-walk.js';
import { tileCells } from './gen2-zoning-runtime.js';
import { shapeContains, poolDepth, WADE_MAX, floorRise2 } from './gen2.js';

const s2BaseId=id=>id.split('#split:')[0];
const s2Touch=(a,b)=>a.x0<=b.x1&&b.x0<=a.x1&&a.z0<=b.z1&&b.z0<=a.z1;

export function s2EntranceSeeds(roomId,links,edges){
  const base=s2BaseId(roomId),out=[];
  for(const l of links){
    const edge=edges.get(l.id);if(!edge||edge.a!==roomId&&edge.b!==roomId)continue;
    if(l.a===base)out.push({point:l.line[0]});if(l.b===base)out.push({point:l.line.at(-1)});
  }
  return out.sort((a,b)=>a.point[0]-b.point[0]||a.point[1]-b.point[1]);
}

// Points are dry 1F in both snapshots. They never substitute for a ratio endpoint.
export function commonGroundPoint(before,after,rects,near,{maxPoints=4096,maxDistance=3,allowWading=false}={}){
  const candidates=[];
  for(const r of rects)for(let x=Math.ceil((r.x0-.25)/.5)*.5+.25;x<r.x1;x+=.5)
    for(let z=Math.ceil((r.z0-.25)/.5)*.5+.25;z<r.z1;z+=.5)candidates.push([x,z]);
  candidates.sort((a,b)=>Math.hypot(a[0]-near[0],a[1]-near[1])-Math.hypot(b[0]-near[0],b[1]-near[1])||a[0]-b[0]||a[1]-b[1]);
  const player=new Player();let tested=0,baselinePoints=0;
  for(const [x,z] of candidates){
    if(Math.hypot(x-near[0],z-near[1])>maxDistance)break;
    if(++tested>maxPoints)return {status:'inconclusive',reason:'representative-budget',checkedPoints:maxPoints};
    let valid=true;const heights=[];
    for(const [worldIndex,world] of [before,after].entries()){
      let h=0;
      if(allowWading){
        const plan=world.planAt(x,z),room=(plan.rooms??[]).find(r=>r.lv===0&&r.elevation===undefined&&x>=r.x0&&x<r.x1&&z>=r.z0&&z<r.z1);
        if(room)h=world.Y[0]+floorRise2(room,x,z);
        const pool=(plan.pools??[]).find(p=>p.lv===0&&shapeContains(p.shape,x,z));
        if(pool){const d=poolDepth(pool,x,z);if(!Number.isFinite(d)||d<0||d>WADE_MAX){valid=false;break;}h=pool.water-d;}
      }
      const land=world.surfaceAt(x,z,h);player.reset(x,z,0,h);
      if(!land||Math.abs(land.h-h)>1e-6||world.levelAt(h)!==0||!player.canStand(world,x,z,h)){valid=false;break;}
      if(worldIndex===0)baselinePoints++;
      heights.push(h);
    }
    if(valid)return {status:'found',beforePoint:[x,z,heights[0]],point:[x,z,heights[1]],checkedPoints:tested};
    if(baselinePoints)return {status:'inconclusive',reason:'baseline-point-obstructed',point:[x,z,heights[0]],checkedPoints:tested};
  }
  return {status:'inconclusive',reason:baselinePoints?'no-common-ground-point':'no-baseline-ground',baselinePoints,checkedPoints:tested};
}

export function* preserveGroundReachJob(before,after,hub,targets,options){
  const baseline=yield* bodyReachJob(before,options.beforeHub??hub,options.beforeTargets??targets,{...options,groundOnly:true});
  if(baseline.status!=='found')return {status:'inconclusive',reason:'baseline-connectivity',search:baseline.status};
  const current=yield* bodyReachJob(after,hub,targets,{...options,groundOnly:true});
  if(current.status!=='found')return {status:current.status==='unreachable'?'refused':'inconclusive',reason:'affected-room-disconnected',search:current.status};
  return {status:'verified',baseline,current};
}

export function* verifyAffectedGroundJob(before,after,inputs,tile,bridges,{bounds,maxStates=120000,batchStates=32}={}){
  const cells=tileCells(tile),ctx=bridgeContext(before,inputs,cells),open=roomGraphRecords(after,cells);
  const originalEdges=new Map(inputs.graph.edges.map(e=>[e.id,e]));
  const removed=new Set(bridges.flatMap(b=>b.removedConnectorIds)),closed=new Set(bridges.flatMap(b=>b.closedConnectionIds));
  const nodes=[...inputs.graph.nodes].filter(([id,n])=>n.floor===0&&!removed.has(id)),have=new Set(nodes.map(([id])=>id));
  const flights=bridges.flatMap(b=>[b.parts[0].flight,b.parts[2].flight]);
  const affected=new Set(),stairs=[...flights,...flights.map(f=>f.hallEntry)];
  const footprints=[...stairs,...bridges.flatMap(b=>b.softReservations??[])];
  for(const [id] of nodes)if(ctx.rects(id).some(r=>footprints.some(f=>s2Touch(r,f))))affected.add(id);
  for(const e of inputs.graph.edges)if(closed.has(e.id.replace(/:[ab]$/,'')))for(const id of [e.a,e.b])if(have.has(id))affected.add(id);
  const adj=new Map(nodes.map(([id])=>[id,[]]));
  for(const e of inputs.graph.edges)if(have.has(e.a)&&have.has(e.b)){adj.get(e.a).push(e.b);adj.get(e.b).push(e.a);}
  const seen=new Set(),components=[];
  for(const [id] of nodes){if(seen.has(id))continue;const todo=[id],group=[];seen.add(id);while(todo.length){const n=todo.pop();group.push(n);for(const v of adj.get(n))if(!seen.has(v)){seen.add(v);todo.push(v);}}components.push(group.sort());}
  const witnesses=[],emptySides=[];
  for(const group of components){
    const changed=group.filter(id=>affected.has(id));if(!changed.length)continue;
    const anchors=changed.map(id=>inputs.graph.nodes.get(id).anchor),centre=[anchors.reduce((s,p)=>s+p[0],0)/anchors.length,anchors.reduce((s,p)=>s+p[1],0)/anchors.length];
    const hubs=group.filter(id=>!affected.has(id)).sort((a,b)=>{
      const A=inputs.graph.nodes.get(a).anchor,B=inputs.graph.nodes.get(b).anchor;
      return Math.hypot(A[0]-centre[0],A[1]-centre[1])-Math.hypot(B[0]-centre[0],B[1]-centre[1])||a.localeCompare(b);
    });
    let hub=null,hubId=null;
    if(!hubs.length)return {status:'inconclusive',reason:'no-unaffected-hub'};
    for(const id of hubs){const r=commonGroundPoint(before,after,ctx.rects(id),inputs.graph.nodes.get(id).anchor,{maxDistance:Infinity});if(r.status==='found'){hub=r.point;hubId=id;break;}}
    if(!hub)return {status:'inconclusive',reason:'component-hub'};
    const points=new Map();
    for(const id of changed){
      const rects=ctx.rects(id),seeds=s2EntranceSeeds(id,open.links,originalEdges);
      for(const f of flights)if(rects.some(r=>s2Touch(r,f))){
        const x=(f.x0+f.x1)/2,z=(f.z0+f.z1)/2;
        if(f.axis==='z')seeds.push({point:[f.x0-.75,z],side:{x1:f.x0}},{point:[f.x1+.75,z],side:{x0:f.x1}});
        else seeds.push({point:[x,f.z0-.75],side:{z1:f.z0}},{point:[x,f.z1+.75],side:{z0:f.z1}});
      }
      if(!seeds.length)seeds.push({point:inputs.graph.nodes.get(id).anchor});
      for(const seed of seeds){
        const region=seed.side?rects.map(r=>({x0:Math.max(r.x0,seed.side.x0??-Infinity),x1:Math.min(r.x1,seed.side.x1??Infinity),z0:Math.max(r.z0,seed.side.z0??-Infinity),z1:Math.min(r.z1,seed.side.z1??Infinity)})).filter(r=>r.x1>r.x0&&r.z1>r.z0):rects;
        if(!region.length)continue; // This side is outside the original room; no original entrance exists there.
        const r=commonGroundPoint(before,after,region,seed.point,{allowWading:true});
        if(seed.side&&r.reason==='no-baseline-ground'){emptySides.push({roomId:id,side:seed.side,seed:seed.point,region,checkedPoints:r.checkedPoints,reason:r.reason});continue;}
        if(r.status!=='found')return {...r,roomId:id,seed:seed.point,region};
        points.set(r.point.join(','),{roomId:id,point:r.point,beforePoint:r.beforePoint});
      }
    }
    const targets=[...points.values()].map(r=>r.point),options={bounds,groundOnly:true,maxStates,batchStates};
    if(!targets.length)continue;
    const proof=yield* preserveGroundReachJob(before,after,hub,targets,{...options,beforeTargets:[...points.values()].map(r=>r.beforePoint)});
    if(proof.status!=='verified')return proof;
    const {baseline,current}=proof;
    for(const {roomId,point,beforePoint} of points.values())witnesses.push({roomId,point,beforePoint,hubId,hub,before:baseline.reached.find(r=>r.point.join(',')===beforePoint.join(',')).length,after:current.reached.find(r=>r.point.join(',')===point.join(',')).length});
  }
  return {status:'verified',witnesses,emptySides};
}
