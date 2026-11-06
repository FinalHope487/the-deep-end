// Bounded A* over the real Player boundary. Found paths include their moves and a boundary lower-bound proof.
import { Player } from './player.js';
import { Q2 } from './gen2.js';

const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const inside = (p,b) => p[0]>=b[0]&&p[1]>=b[1]&&p[0]<=b[2]&&p[1]<=b[3];
const key = (p,used) => `${p.join(',')}|${used}`;

// Signed progress requires both ends of each stair. Negative values mean the reverse direction.
export function bridgeProgress(progress,zone) {
  if(Math.abs(progress)===7)return progress;
  if(progress===0)return zone==='ground:A'?1:zone==='ground:B'?-1:0;
  const sign=Math.sign(progress),a=sign>0?'A':'B',b=sign>0?'B':'A',stage=Math.abs(progress);
  if(zone===`ground:${a}`)return sign;
  if(zone===`base:${a}`&&stage>=1)return sign*2;
  if(zone===`far:${a}`&&stage>=2)return sign*3;
  if(zone==='passage'&&stage>=3)return sign*4;
  if(zone===`far:${b}`&&stage>=4)return sign*5;
  if(zone===`base:${b}`&&stage>=5)return sign*6;
  if(zone===`ground:${b}`&&stage===6)return sign*7;
  return progress;
}

export function bodyPath(world,start,target,options={}) {
  const job=bodyPathJob(world,start,target,options);
  for(;;){const next=job.next();if(next.done)return next.value;}
}

export function* bodyReachJob(world,start,targets,options={}){
  if(!Array.isArray(targets)||!targets.length)throw new TypeError('Reach targets are required');
  return yield* bodyPathJob(world,start,targets[0],{...options,ownBridge:null,requireBridge:false,reachTargets:targets});
}

// Each yield bounds the number of expanded states. Callers must measure elapsed time as well.
export function* bodyPathJob(world,start,target,{bounds,maxStates=250000,groundOnly=false,ownBridge=null,requireBridge=false,keep=null,batchStates=32,reachTargets=null}={}) {
  if(!bounds||bounds.length!==4||![...bounds,...start,...target].every(Number.isFinite)||!inside(start,bounds)||!inside(target,bounds)) throw new TypeError('Invalid body search bounds or endpoints');
  if(!Number.isSafeInteger(maxStates)||maxStates<1) throw new RangeError('Invalid body search budget');
  if(!Number.isSafeInteger(batchStates)||batchStates<1) throw new RangeError('Invalid body search batch');
  const player=new Player(), heap=[], states=new Map();
  const pending=reachTargets?new Map(reachTargets.map(p=>[p.join(','),p])):null,reached=[];
  if(reachTargets&&reachTargets.some(p=>p.length!==3||!p.every(Number.isFinite)||!inside(p,bounds)))throw new TypeError('Invalid reach target');
  let expanded=0,boundaryLower=Infinity,best=null;
  const estimate=p=>pending?Math.min(...[...pending.values()].map(goal=>distance(p,goal))):distance(p,target);
  const less=(a,b)=>a.f-b.f||a.d-b.d||a.p[0]-b.p[0]||a.p[1]-b.p[1]||a.p[2]-b.p[2]||Number(a.used)-Number(b.used);
  const push=n=>{heap.push(n);let i=heap.length-1;while(i){const p=(i-1)>>1;if(less(heap[p],n)<=0)break;heap[i]=heap[p];i=p;}heap[i]=n;};
  const pop=()=>{const n=heap[0],last=heap.pop();if(heap.length){let i=0;for(;;){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&less(heap[c+1],heap[c])<0)c++;if(less(last,heap[c])<=0)break;heap[i]=heap[c];i=c;}heap[i]=last;}return n;};
  const splitPairs=new WeakMap();
  const splits=plan=>{
    if(splitPairs.has(plan))return splitPairs.get(plan);
    const result=[];
    for(const v of plan.voids??[]){
      if(v.kind!=='split'||!Array.isArray(v.gap))continue;
      const runX=v.run==='x',along=(v.gap[0]+v.gap[1])/2;
      const pair=[runX?v.z0:v.x0,runX?v.z1:v.x1].map((edge,index)=>(plan.ladders??[]).find(l=>
        Math.abs(l.h0-world.Y[-1])<1e-6&&Math.abs(l.h1-world.Y[0])<1e-6&&
        Math.abs((runX?l.x:l.z)-along)<1e-6&&Math.abs((runX?l.z:l.x)-edge)<1e-6&&
        (runX?l.nz:l.nx)===(index===0?1:-1)&&(runX?l.nx:l.nz)===0));
      if(pair.every(Boolean))result.push({v,pair});
    }
    splitPairs.set(plan,result);return result;
  };
  const ground=p=>{
    if(!groundOnly)return true;
    const plan=world.planAt(p[0],p[1]);
    // Only the paired split ladders and their narrow bottom crossing belong to logical 1F.
    if(Math.abs(p[2]-world.Y[-1])<1e-6&&splits(plan).some(({v})=>
      p[0]>=v.x0&&p[0]<=v.x1&&p[1]>=v.z0&&p[1]<=v.z1&&
      (v.run==='x'?p[0]>=v.gap[0]&&p[0]<=v.gap[1]:p[1]>=v.gap[0]&&p[1]<=v.gap[1])))return true;
    // A stair remains another-floor travel even while it is closer to 1F than its landing.
    if(world.flightAt(p[0],p[1])&&Math.abs(p[2]-world.Y[0])>1e-9)return false;
    return world.levelAt(p[2])===0;
  };
  const progressAt=(progress,p)=>{
    if(!ownBridge)return 0;
    const plan=world.planAt(p[0],p[1]),contains=r=>p[0]>=r.x0&&p[0]<=r.x1&&p[1]>=r.z0&&p[1]<=r.z1;
    const flights=plan.flights.filter(f=>f.bridgeId===ownBridge);
    for(const f of flights)if(Math.abs(p[2]-world.Y[0])<1e-6&&contains(f.hallEntry))return bridgeProgress(progress,`ground:${f.bridgeEnd}`);
    for(const f of flights)if(contains(f)){
      if(Math.abs(p[2]-world.Y[0])<.3)return bridgeProgress(progress,`base:${f.bridgeEnd}`);
      const far=world.Y[f.lo===0?f.hi:f.lo];
      if(Math.abs(p[2]-far)<.3)return bridgeProgress(progress,`far:${f.bridgeEnd}`);
      return progress;
    }
    if(plan.rooms.some(r=>r.bridgeId===ownBridge&&Math.abs(world.Y[r.lv]-p[2])<1e-6&&contains(r)))return bridgeProgress(progress,'passage');
    return progress;
  };
  const sweep=(from,x,z,progress=0)=>{
    player.reset(from[0],from[1],0,from[2]);
    let cost=0,used=progress;
    const count=Math.max(1,Math.ceil(Math.hypot(x-from[0],z-from[1])/.1));
    for(let k=1;k<=count;k++){
      const nx=from[0]+(x-from[0])*k/count,nz=from[1]+(z-from[1])*k/count;
      if(keep&&!keep(nx,nz))return null;
      if(!player.canStand(world,nx,nz,player.floorH))return null;
      const old=[player.x,player.z,player.floorH];player.step(world,nx,nz);
      const p=[player.x,player.z,player.floorH];if(!ground(p))return null;
      cost+=distance(old,p);used=progressAt(used,p);
    }
    return {p:[player.x,player.z,player.floorH],cost,used};
  };
  const relax=(p,used,d,parent)=>{
    const k=key(p,used),old=states.get(k);
    if(old&&old.d<=d+1e-9)return;
    const n={p,used,d,f:d+estimate(p),parent};states.set(k,n);push(n);
  };
  player.reset(start[0],start[1],0,start[2]);
  const initial=world.surfaceAt(start[0],start[1],start[2]);
  if(!initial||Math.abs(initial.h-start[2])>1e-6||!player.canStand(world,start[0],start[1],start[2])||!ground(start)||(keep&&!keep(start[0],start[1])))return {status:'invalid-start',expanded};
  for(const goal of reachTargets??[target]){
    player.reset(goal[0],goal[1],0,goal[2]);
    const destination=world.surfaceAt(goal[0],goal[1],goal[2]);
    if(!destination||Math.abs(destination.h-goal[2])>1e-6||!player.canStand(world,goal[0],goal[1],goal[2])||!ground(goal)||(keep&&!keep(goal[0],goal[1])))return {status:'invalid-target',expanded};
  }
  relax([...start],progressAt(0,start),0,null);
  while(heap.length){
    const u=pop();if(states.get(key(u.p,u.used))!==u)continue;
    if(pending){const f=u.d+estimate(u.p);if(f>u.f+1e-9){u.f=f;push(u);continue;}}
    if(best&&u.f>=best.length-1e-9)break;
    if(++expanded>maxStates)return {status:'search-budget-exhausted',expanded,boundaryLower,lowerBound:Math.min(u.f,boundaryLower),upperBound:best?.length??Infinity,incumbent:best,...(reachTargets?{reached}:{})};
    if(expanded%batchStates===0)yield {status:'searching',expanded};
    if(pending){
      for(const [id,goal] of pending){
        if(Math.hypot(u.p[0]-goal[0],u.p[1]-goal[1])>Q2+1e-9||Math.abs(u.p[2]-goal[2])>.8)continue;
        const end=sweep(u.p,goal[0],goal[1],u.used);
        if(end&&Math.abs(end.p[2]-goal[2])<1e-6){reached.push({point:goal,length:u.d+end.cost});pending.delete(id);}
      }
      if(!pending.size)return {status:'found',reached,expanded};
    }
    const horizontal=reachTargets?Infinity:Math.hypot(u.p[0]-target[0],u.p[1]-target[1]);
    if(horizontal<=Q2+1e-9&&Math.abs(u.p[2]-target[2])<=.8){
      const end=sweep(u.p,target[0],target[1],u.used);
      if(end&&Math.abs(end.p[2]-target[2])<1e-6&&(!requireBridge||Math.abs(end.used)===7)){
        const length=u.d+end.cost;
        const path=[];for(let at=u;at;at=at.parent)path.push(at.p);path.reverse();
        if(horizontal>1e-9)path.push(end.p);
        if(!best||length<best.length)best={length,path,usedOwnBridge:Math.abs(end.used)===7};
      }
    }
    for(const [dx,dz] of [[Q2,0],[-Q2,0],[0,Q2],[0,-Q2]]){
      const move=sweep(u.p,u.p[0]+dx,u.p[1]+dz,u.used);if(!move)continue;
      if(!inside(move.p,bounds)){boundaryLower=Math.min(boundaryLower,u.d+move.cost+distance(move.p,target));continue;}
      relax(move.p,move.used,u.d+move.cost,u);
    }
    for(const l of world.planAt(u.p[0],u.p[1]).ladders??[]){
      if(groundOnly&&!splits(world.planAt(u.p[0],u.p[1])).some(s=>s.pair.includes(l)))continue;
      const foot=[l.x+l.nx*.75,l.z+l.nz*.75,l.h0],top=[l.x-l.nx*.45,l.z-l.nz*.45,l.h1];
      for(const [a,b] of [[foot,top],[top,foot]]){
        if(Math.abs(u.p[2]-a[2])>=.3||Math.hypot(u.p[0]-a[0],u.p[1]-a[1])>=.75)continue;
        if(!ground(b))continue;
        if(keep){
          const n=Math.max(1,Math.ceil(Math.hypot(b[0]-u.p[0],b[1]-u.p[1])/.1));
          let allowed=true;
          for(let k=0;k<=n;k++)if(!keep(u.p[0]+(b[0]-u.p[0])*k/n,u.p[1]+(b[1]-u.p[1])*k/n)){allowed=false;break;}
          if(!allowed)continue;
        }
        player.reset(u.p[0],u.p[1],0,u.p[2]);
        if(!player.canStand(world,b[0],b[1],b[2]))continue;
        const cost=distance(u.p,b);
        if(!inside(b,bounds)){boundaryLower=Math.min(boundaryLower,u.d+cost+distance(b,target));continue;}
        relax(b,progressAt(u.used,b),u.d+cost,u);
      }
    }
  }
  if(best)return boundaryLower<best.length-1e-9?{status:'search-boundary',expanded,boundaryLower,length:best.length,lowerBound:boundaryLower,upperBound:best.length,incumbent:best}:{status:'found',...best,expanded,boundaryLower,lowerBound:best.length,upperBound:best.length};
  return {status:boundaryLower<Infinity?'search-boundary':'unreachable',expanded,boundaryLower,...(reachTargets?{reached}:{})};
}
