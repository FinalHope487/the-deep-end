import {test,expect} from '@playwright/test';
import {api,start,state} from './helpers.js';

async function waitPlaying(page,label,timeout){
  const started=Date.now();let sampled=0;
  await expect.poll(async()=>{
    const s=await state(page);
    if(Date.now()-sampled>15000){
      sampled=Date.now();const gate=await api(page,'gen2S2');
      console.log('S2 lifecycle',JSON.stringify({label,ms:sampled-started,seed:s.seed,mode:s.mode,x:s.x,z:s.z,h:s.floorH,busy:gate.busy,prefetching:gate.prefetching,active:gate.active,error:gate.error}));
    }
    return s.mode;
  },{timeout}).toBe('playing');
}

async function walkWitness(page,path){
  return page.evaluate(async path=>{
    const a=window.__deepend,start=performance.now();let index=1,minH=Infinity,maxH=-Infinity,lastMove=start,last=a.state();
    const key=type=>dispatchEvent(new KeyboardEvent(type,{code:'KeyW',key:'w',bubbles:true}));
    key('keydown');
    try{
      while(index<path.length){
        const s=a.state(),p=path[index],d=Math.hypot(s.x-p[0],s.z-p[1]);
        minH=Math.min(minH,s.floorH);maxH=Math.max(maxH,s.floorH);
        if(d<.09){if(Math.abs(s.floorH-p[2])>.25)throw new Error(`Wrong floor at ${index}: ${s.floorH} expected ${p[2]}`);index++;continue;}
        if(Math.hypot(s.x-last.x,s.z-last.z)>.015){lastMove=performance.now();last=s;}
        if(performance.now()-lastMove>4000||performance.now()-start>90000)throw new Error(`Walk stalled at ${index}/${path.length}: ${JSON.stringify({s,p,d})}`);
        a.lookAt(p[0],p[1]);await new Promise(requestAnimationFrame);
      }
      return {end:a.state(),minH,maxH,points:index,ms:performance.now()-start};
    }finally{key('keyup');}
  },path);
}

for(const root of ['/','/dist/index.html'])test(`S2 real keyboard bridge round trips and Worker loading ${root}`,async({page})=>{
  test.setTimeout(600000);
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const workers=[];page.on('worker',w=>workers.push(w.url()));
  const started=Date.now();await page.goto(`${root}?test=1&seed=42&gen=v2`);
  await page.waitForFunction(()=>window.__deepend?.ready,null,{timeout:120000});
  console.log('S2 initial ready',root,Date.now()-started);
  await start(page);
  const ids=[];
  for(const tile of ['zt:1,-1','zt:-1,0']){
    const loaded=(await state(page)).loadedChunks;
    const snapshot=await api(page,'gen2Bridge',tile);
    expect((await state(page)).loadedChunks).toBeGreaterThanOrEqual(loaded);
    const wanted=tile==='zt:1,-1'?'db:z:6,-4':'db:x:-3,0';
    const report=snapshot.reports.find(r=>r.borderId===wanted);
    expect(report).toBeTruthy();ids.push(report.borderId);
    const record=snapshot.records.find(r=>r.id===wanted);
    expect(record.floor).toBe(-1);
    console.log('S2 accepted',root,tile,JSON.stringify({record,floor:record.floor,ratios:report.directions.map(d=>d.ratio)}));
    const path=report.directions[0].path;
    await api(page,'teleport',path[0][0],path[0][1],0,true,path[0][2]);
    const before=await state(page);expect(before.loadedChunks).toBeGreaterThan(0);
    const mid=Math.floor(path.length/2),partA=await walkWitness(page,path.slice(0,mid+1));
    await page.screenshot({path:`work/s2-${root==='/'?'source':'dist'}-${tile==='zt:1,-1'?'first':'second'}-bridge.png`});
    if(root==='/'&&tile==='zt:-1,0'){
      await page.getByRole('button',{name:'暫停'}).click();const saved=await state(page);
      console.log('S2 reload saved',JSON.stringify(saved));
      await page.reload();await page.waitForFunction(()=>window.__deepend?.ready,null,{timeout:120000});
      console.log('S2 reload initialized');
      await page.getByRole('button',{name:'繼續'}).click();
      await waitPlaying(page,'bridge reload',180000);
      const restored=await state(page);
      expect(Math.hypot(restored.x-saved.x,restored.z-saved.z)).toBeLessThan(.15);
      expect(restored.floorH).toBeCloseTo(saved.floorH,2);
      console.log('S2 bridge save/reload',JSON.stringify({x:restored.x,z:restored.z,h:restored.floorH}));
    }
    const partB=await walkWitness(page,path.slice(mid));
    const forward={...partB,ms:partA.ms+partB.ms,points:partA.points+partB.points-1,minH:Math.min(partA.minH,partB.minH),maxH:Math.max(partA.maxH,partB.maxH)};
    const back=await walkWitness(page,report.directions[1].path);
    expect(Math.hypot(back.end.x-path[0][0],back.end.z-path[0][1])).toBeLessThan(.15);
    expect(Math.min(forward.minH,back.minH)).toBeLessThan(-5);
    expect(back.end.floorH).toBeCloseTo(path[0][2],1);
    console.log('S2 real walk',root,tile,JSON.stringify({id:report.borderId,forward:{ms:forward.ms,points:forward.points,minH:forward.minH},back:{ms:back.ms,points:back.points,minH:back.minH}}));
    await page.screenshot({path:`work/s2-${root==='/'?'source':'dist'}-${tile==='zt:1,-1'?'first':'second'}.png`});
  }
  expect(ids.sort()).toEqual(['db:x:-3,0','db:z:6,-4']);
  const corpus=['zt:0,0','zt:-1,-1','zt:1,-1','zt:-1,0'];
  // The source reload discards its previous planner cache, so query the corpus before reload via the dist run.
  if(root!=='/'){
    const results=(await api(page,'gen2S2')).tiles.filter(t=>corpus.includes(t.tile));
    expect(results).toHaveLength(4);
    const candidates=results.reduce((n,t)=>n+t.stats.s1Candidates,0),accepted=results.flatMap(t=>t.snapshot.records.map(r=>r.id));
    expect(candidates).toBe(10);expect(accepted).toEqual(expect.arrayContaining(ids));
    console.log('S2 fixed corpus',JSON.stringify({candidates,accepted}));
  }
  expect(workers.length).toBe(root==='/'?4:2);
  expect(workers.every(url=>url.includes(root==='/'?'/js/gen2-s2-worker.js':'/dist/js/gen2-s2-worker.js'))).toBe(true);
  expect(errors).toEqual([]);
});

test('S2 replay waits for the new seed owner before enabling play',async({page})=>{
  test.setTimeout(360000);
  await page.addInitScript(()=>{
    const original=crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues=array=>{if(array instanceof Uint32Array&&array.length===1){array[0]=1;return array;}return original(array);};
  });
  await page.goto('/?test=1&seed=42&gen=v2');
  await page.waitForFunction(()=>window.__deepend?.ready,null,{timeout:120000});await start(page);
  // Isolate request failure from old-seed queue delay. Queue priority has a separate contract test.
  await page.evaluate(async()=>{const a=window.__deepend,s=a.state();await a.gen2Prepare(s.x,s.z);});
  await page.getByRole('button',{name:'暫停'}).click();await page.getByRole('button',{name:'回標題'}).click();
  const saved=await page.evaluate(()=>localStorage.getItem('deepend.save.v1'));
  await page.evaluate(()=>{
    const original=Worker.prototype.postMessage;
    window.s2Faults=0;
    window.restoreS2PostMessage=()=>{Worker.prototype.postMessage=original;};
    Worker.prototype.postMessage=function(data,...rest){if(data.seed===1){window.s2Faults++;throw new DOMException('Injected new-seed request failure','DataCloneError');}return original.call(this,data,...rest);};
  });
  await page.getByRole('button',{name:'開始',exact:true}).click();
  await expect.poll(async()=>page.evaluate(()=>window.s2Faults)).toBeGreaterThan(0);
  await expect.poll(async()=>page.evaluate(()=>localStorage.getItem('deepend.save.v1'))).toBe(saved);
  await expect.poll(async()=>(await state(page)).seed).toBe(42);
  await expect(page.getByRole('button',{name:'繼續',exact:true})).toBeVisible();
  await page.evaluate(()=>window.restoreS2PostMessage());
  await page.getByRole('button',{name:'開始',exact:true}).click();
  await expect.poll(async()=>(await state(page)).seed).toBe(1);
  const gate=await api(page,'gen2S2');
  if(gate.busy)expect((await state(page)).mode).not.toBe('playing');
  await waitPlaying(page,'new seed retry',180000);
  const ready=await api(page,'gen2S2'),s=await state(page);
  expect(ready.busy).toBe(false);expect(ready.error).toBeNull();expect(s.seed).toBe(1);
  expect(s.loadedChunks).toBeGreaterThan(0);
});

test('pending Continue excludes Start and repeated Continue',async({page})=>{
  test.setTimeout(360000);
  const save={v:1,gen:2,seed:42,x:799.75,z:-416.25,h:0,yaw:0,visited:[false,false,false,false],found:[],elapsed:123,distance:50,last:-1};
  await page.addInitScript(s=>localStorage.setItem('deepend.save.v1',JSON.stringify(s)),save);
  await page.goto('/?test=1&seed=42&gen=v2');await page.waitForFunction(()=>window.__deepend?.ready,null,{timeout:120000});
  const before=await page.evaluate(()=>localStorage.getItem('deepend.save.v1'));
  await page.getByRole('button',{name:'繼續',exact:true}).click();
  await page.getByRole('button',{name:'開始',exact:true}).click();
  await page.getByRole('button',{name:'繼續',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('deepend.save.v1'))).toBe(before);
  expect((await state(page)).mode).toBe('title');
  await expect.poll(async()=>(await state(page)).mode,{timeout:180000}).toBe('playing');
  const s=await state(page);expect(s.seed).toBe(42);expect(s.runs).toBe(1);
  expect(Math.hypot(s.x-save.x,s.z-save.z)).toBeLessThan(.2);
  expect(s.elapsed).toBeGreaterThanOrEqual(save.elapsed);
  expect((await api(page,'gen2S2')).busy).toBe(false);
});
