import test from 'node:test';
import assert from 'node:assert/strict';
import {S2Planner,s2TileAt,s2TilesNear,s2ReadyDistance} from '../../js/gen2-s2-client.js';
test('visible tile requests use fixed ownership across zero and negative boundaries',()=>{
  assert.equal(s2TileAt(-.01,-.01),'zt:-1,-1');assert.equal(s2TileAt(512,0),'zt:1,0');
  assert.deepEqual(s2TilesNear(0,0,1),['zt:-1,-1','zt:-1,0','zt:0,-1','zt:0,0']);
  assert.deepEqual(s2TilesNear(700,-400,30),['zt:1,-1']);
});

test('unprepared neighbors limit visibility before missing geometry enters view',()=>{
  const ready=new Set(['zt:0,0']);
  assert.equal(s2ReadyDistance(20,30,ready,48),20);
  ready.add('zt:-1,0');assert.equal(s2ReadyDistance(20,30,ready,48),30);
  ready.add('zt:0,-1');assert.equal(s2ReadyDistance(20,30,ready,48),Math.hypot(20,30));
  ready.add('zt:-1,-1');assert.equal(s2ReadyDistance(20,30,ready,48),48);
  assert.equal(s2ReadyDistance(-.1,1,new Set(),48),0);
});

// Completed messages are data fixtures. No Worker or engine is mocked.
const completed=(tile,index)=>({seed:42,tile,result:{seed:42,tile,snapshot:{sealed:[`edge:${index}`]}},fragments:new Map([[`${index},0`,{parts:[index]}]]),promise:Promise.resolve()});

test('ready snapshot composition is independent of completion order and owns its fragment copies',()=>{
  const compose=reverse=>{
    const planner=new S2Planner(),entries=[completed('zt:0,0',0),completed('zt:1,0',1)];
    for(const e of reverse?entries.reverse():entries)planner.cache.set(`42|${e.tile}`,e);
    return planner.worldOptions(42);
  };
  const a=compose(false),b=compose(true);
  assert.deepEqual([...a.sealed].sort(),[...b.sealed].sort());
  assert.deepEqual([...a.bridgeParts].sort(),[...b.bridgeParts].sort());
  a.bridgeParts.get('0,0').parts.push(99);
  assert.deepEqual(compose(false).bridgeParts.get('0,0').parts,[0]);
});

test('prefetch replacement cannot evict a pinned live owner',async()=>{
  const planner=new S2Planner();
  for(let i=0;i<18;i++){const e=completed(`zt:${i},0`,i);planner.cache.set(`42|${e.tile}`,e);}
  planner.pin(42,['zt:0,0']);
  await planner.prepare(42,['zt:17,0']);planner.trim();
  assert.ok(planner.ready(42,'zt:0,0'));assert.ok(planner.ready(42,'zt:17,0'));
  assert.equal(planner.ready(42,'zt:1,0'),false);
  assert.ok(planner.worldOptions(42).bridgeParts.has('0,0'));
  planner.pin(42,[]);
  const e=completed('zt:18,0',18);planner.cache.set('42|zt:18,0',e);planner.trim();
  assert.equal(planner.ready(42,'zt:0,0'),false);
});

test('a late Worker completion is visible to activation before cache eviction',async()=>{
  const oldWorker=globalThis.Worker,oldDocument=globalThis.document,workers=[];
  globalThis.document={baseURI:'http://localhost/'};
  globalThis.Worker=class{constructor(){workers.push(this);}postMessage(message){this.message=message;}terminate(){}};
  try{
    let published=false;const planner=new S2Planner(()=>{},(seed,tile)=>{published=planner.worldOptions(seed).tiles.has(tile);});
    const promise=planner.request(42,'zt:0,0');
    for(let i=1;i<=17;i++){const e=completed(`zt:${i},0`,i);planner.cache.set(`42|${e.tile}`,e);}
    planner.pin(42,Array.from({length:17},(_,i)=>`zt:${i+1},0`));
    const data=completed('zt:0,0',0),worker=workers.find(w=>w.message);
    worker.onmessage({data:{type:'complete',id:worker.message.id,result:data.result,fragments:data.fragments}});
    await promise;
    assert.equal(published,true,'successful completion must reach the activation callback before eviction');
  }finally{globalThis.Worker=oldWorker;globalThis.document=oldDocument;}
});

test('required owners remain available until every activation waiter releases them',()=>{
  const planner=new S2Planner();
  for(let i=0;i<18;i++){const e=completed(`zt:${i},0`,i);planner.cache.set(`42|${e.tile}`,e);}
  const a=planner.hold(42,['zt:0,0']),b=planner.hold(42,['zt:0,0']);
  planner.pin(42,Array.from({length:17},(_,i)=>`zt:${i+1},0`));
  planner.trim();assert.ok(planner.ready(42,'zt:0,0'));
  a();a();assert.ok(planner.worldOptions(42).tiles.has('zt:0,0'));
  b();assert.equal(planner.ready(42,'zt:0,0'),false);
});

for(const promotion of ['request','hold'])test(`a required owner promoted by ${promotion} takes the next free Worker and keeps its Promise`,async()=>{
  const oldWorker=globalThis.Worker,oldDocument=globalThis.document,workers=[],sent=[];
  globalThis.document={baseURI:'http://localhost/'};
  globalThis.Worker=class{constructor(){workers.push(this);}postMessage(message){this.message=message;sent.push(message.tile);}terminate(){}};
  const planner=new S2Planner();
  try{
    const first=planner.request(42,'zt:0,0'),second=planner.request(42,'zt:1,0');
    const background=planner.request(42,'zt:2,0'),required=planner.request(42,'zt:3,0');
    if(promotion==='hold')planner.hold(42,['zt:3,0']);
    assert.equal(planner.request(42,'zt:3,0',promotion==='request'),required);
    assert.deepEqual(sent,['zt:0,0','zt:1,0'],'each Worker must have only one unfinished dispatched job');
    const complete=worker=>{const message=worker.message,data=completed(message.tile,message.id);worker.onmessage({data:{type:'complete',id:message.id,result:data.result,fragments:data.fragments}});};
    complete(workers[1]);await second;
    assert.deepEqual(sent,['zt:0,0','zt:1,0','zt:3,0'],'the newly free Worker must take the required owner');
    complete(workers[1]);await required;
    assert.equal(sent.at(-1),'zt:2,0');
    complete(workers[1]);complete(workers[0]);await Promise.all([first,background]);
  }finally{planner.fail(new Error('Test cleanup'));globalThis.Worker=oldWorker;globalThis.document=oldDocument;}
});

test('planner failure rejects queued and running requests and permits a fresh retry',async()=>{
  const oldWorker=globalThis.Worker,oldDocument=globalThis.document,workers=[];
  globalThis.document={baseURI:'http://localhost/'};
  globalThis.Worker=class{constructor(){workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}};
  const planner=new S2Planner();
  try{
    const requests=[0,1,2].map(i=>planner.request(42,`zt:${i},0`));
    const failures=requests.map(p=>assert.rejects(p,/Disconnected/));
    planner.fail(new Error('Disconnected'));await Promise.all(failures);
    assert.ok(workers.every(w=>w.terminated));
    const retry=planner.request(42,'zt:2,0'),worker=workers.at(-2),data=completed('zt:2,0',2);
    worker.onmessage({data:{type:'complete',id:worker.message.id,result:data.result,fragments:data.fragments}});
    await retry;assert.ok(planner.worldOptions(42).tiles.has('zt:2,0'));
  }finally{planner.fail(new Error('Test cleanup'));globalThis.Worker=oldWorker;globalThis.document=oldDocument;}
});
