// Heavy planning stays in a module Worker. Only completed snapshots enter the game.
export const s2TileAt=(x,z)=>`zt:${Math.floor(x/512)},${Math.floor(z/512)}`;
export function s2TilesNear(x,z,reach){
  const tiles=[];
  for(let j=Math.floor((z-reach)/512);j<=Math.floor((z+reach)/512);j++)
    for(let i=Math.floor((x-reach)/512);i<=Math.floor((x+reach)/512);i++)tiles.push(`zt:${i},${j}`);
  return tiles.sort();
}

export class S2Planner{
  constructor(onProgress=()=>{}){
    this.onProgress=onProgress;this.workers=[];this.serial=0;this.pending=new Map();this.cache=new Map();this.needed=new Set();
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
        const error=new Error(data.message);error.stack=data.stack;console.error('S2 worker failed',error);this.cache.delete(request.key);request.reject(error);return;
      }
      if(data.type!=='complete'){request.reject(new Error('Unknown S2 worker response'));this.cache.delete(request.key);return;}
      request.entry.result=data.result;request.entry.fragments=data.fragments;request.entry.elapsedMs=data.elapsedMs;
      this.trim();
      request.resolve(data.result);
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
    for(const [key,e] of this.cache){if(this.cache.size<=16)break;if(e.result&&!this.needed.has(key))this.cache.delete(key);}
  }
  prepare(seed,tiles){this.needed=new Set(tiles.map(t=>`${seed>>>0}|${t}`));return Promise.all(tiles.map(tile=>this.request(seed,tile)));}
  request(seed,tile){
    const key=`${seed>>>0}|${tile}`,cached=this.cache.get(key);if(cached){this.cache.delete(key);this.cache.set(key,cached);return cached.promise;}
    this.start();const id=++this.serial,entry={seed:seed>>>0,tile,result:null,fragments:null};
    entry.promise=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        const error=new Error('S2 planning exceeded its time limit');console.error(error);
        this.fail(error);
      },600000);
      this.pending.set(id,{key,entry,resolve,reject,timer});
      const slot=this.workers.reduce((a,b)=>a.load<=b.load?a:b);slot.load++;
      slot.worker.postMessage({id,seed:seed>>>0,tile});
    });
    this.cache.set(key,entry);return entry.promise;
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
