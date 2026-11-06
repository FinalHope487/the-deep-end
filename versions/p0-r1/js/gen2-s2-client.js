// Heavy planning stays in a module Worker. Only completed snapshots enter the game.
export const s2TileAt=(x,z)=>`zt:${Math.floor(x/512)},${Math.floor(z/512)}`;
const freezeS2Client=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);for(const v of Object.values(o))freezeS2Client(v);}return o;};
export function s2TilesNear(x,z,reach){
  const tiles=[];
  for(let j=Math.floor((z-reach)/512);j<=Math.floor((z+reach)/512);j++)
    for(let i=Math.floor((x-reach)/512);i<=Math.floor((x+reach)/512);i++)tiles.push(`zt:${i},${j}`);
  return tiles.sort();
}

export function s2ReadyDistance(x,z,tiles,reach){
  let distance=reach;
  for(const tile of s2TilesNear(x,z,reach))if(!tiles.has(tile)){
    const [i,j]=tile.slice(3).split(',').map(Number);
    const dx=Math.max(i*512-x,0,x-(i+1)*512),dz=Math.max(j*512-z,0,z-(j+1)*512);
    distance=Math.min(distance,Math.hypot(dx,dz));
  }
  return distance;
}

export class S2Planner{
  constructor(onProgress=()=>{},onReady=()=>{}){
    this.onProgress=onProgress;this.onReady=onReady;this.workers=[];this.serial=0;this.pending=new Map();this.cache=new Map();this.needed=new Set();this.active=new Set();this.held=new Map();
  }
  start(){
    if(this.workers.length)return;
    for(let i=0;i<2;i++){
    const worker=new Worker(new URL('js/gen2-s2-worker.js',document.baseURI),{type:'module'}),slot={worker,load:0};this.workers.push(slot);
    worker.onmessage=({data})=>{
      const request=this.pending.get(data.id);if(!request)return;
      if(data.type==='progress'){this.onProgress(data);return;}
      clearTimeout(request.timer);this.pending.delete(data.id);slot.load--;
      if(data.type==='error'){
        const error=new Error(data.message);error.stack=data.stack;console.error('S2 worker failed',error);this.cache.delete(request.key);request.reject(error);this.dispatch();return;
      }
      if(data.type!=='complete'){request.reject(new Error('Unknown S2 worker response'));this.cache.delete(request.key);this.dispatch();return;}
      request.entry.result=freezeS2Client(data.result);request.entry.fragments=data.fragments;request.entry.elapsedMs=data.elapsedMs;
      try{this.onReady(request.entry.seed,request.entry.tile);}
      catch(error){console.error('S2 snapshot activation failed',error);this.cache.delete(request.key);request.reject(error);this.fail(error);return;}
      this.trim();
      request.resolve(data.result);
      this.dispatch();
    };
    worker.onerror=event=>{
      const error=new Error(event.message||'S2 worker could not start');console.error(error);
      this.fail(error);
    };
    }
  }
  fail(error){
    for(const r of this.pending.values()){clearTimeout(r.timer);this.cache.delete(r.key);r.reject(error);}
    this.pending.clear();for(const slot of this.workers)slot.worker.terminate();this.workers=[];
  }
  trim(){
    for(const [key,e] of this.cache){if(this.cache.size<=16)break;if(e.result&&!this.needed.has(key)&&!this.active.has(key)&&!this.held.has(key))this.cache.delete(key);}
  }
  pin(seed,tiles){this.active=new Set(tiles.map(t=>`${seed>>>0}|${t}`));}
  hold(seed,tiles){
    const keys=tiles.map(t=>`${seed>>>0}|${t}`);let released=false;
    for(const key of keys)this.held.set(key,(this.held.get(key)??0)+1);
    return ()=>{if(released)return;released=true;for(const key of keys){const count=this.held.get(key)-1;if(count)this.held.set(key,count);else this.held.delete(key);}this.trim();};
  }
  prepare(seed,tiles){this.needed=new Set(tiles.map(t=>`${seed>>>0}|${t}`));return Promise.all(tiles.map(tile=>this.request(seed,tile)));}
  dispatch(){
    for(const slot of this.workers){
      if(slot.load)continue;
      const queued=[...this.pending.entries()].filter(([,r])=>!r.slot);
      const next=queued.find(([,r])=>r.required||this.held.has(r.key))??queued[0];if(!next)break;
      const [id,request]=next;request.slot=slot;slot.load++;
      request.timer=setTimeout(()=>{
        const error=new Error('S2 planning exceeded its time limit');console.error(error);this.fail(error);
      },600000);
      try{slot.worker.postMessage({id,seed:request.entry.seed,tile:request.entry.tile});}
      catch(error){clearTimeout(request.timer);this.pending.delete(id);this.cache.delete(request.key);slot.load--;console.error('S2 worker request failed',error);request.reject(error);this.dispatch();}
    }
  }
  request(seed,tile,required=false){
    const key=`${seed>>>0}|${tile}`,cached=this.cache.get(key);if(cached){
      this.cache.delete(key);this.cache.set(key,cached);
      if(required)for(const r of this.pending.values())if(r.entry===cached)r.required=true;
      return cached.promise;
    }
    try{this.start();}catch(error){console.error('S2 worker startup failed',error);this.fail(error);return Promise.reject(error);}
    const id=++this.serial,entry={seed:seed>>>0,tile,result:null,fragments:null};
    this.cache.set(key,entry);
    entry.promise=new Promise((resolve,reject)=>{
      this.pending.set(id,{key,entry,resolve,reject,timer:null,required,slot:null});
    });
    this.dispatch();
    return entry.promise;
  }
  ready(seed,tile){return !!this.cache.get(`${seed>>>0}|${tile}`)?.result;}
  results(seed){return [...this.cache.values()].filter(e=>e.seed===(seed>>>0)&&e.result).sort((a,b)=>a.tile.localeCompare(b.tile)).map(e=>e.result);}
  worldOptions(seed){
    const sealed=new Set(),bridgeParts=new Map(),tiles=new Set();
    for(const e of this.cache.values())if(e.seed===(seed>>>0)&&e.result){
      tiles.add(e.tile);for(const id of e.result.snapshot.sealed)sealed.add(id);
      for(const [key,part] of e.fragments){
        if(bridgeParts.has(key))throw new Error('Two S2 tiles claim the same cell');
        bridgeParts.set(key,structuredClone(part));
      }
    }
    return {sealed,bridgeParts,tiles};
  }
}
