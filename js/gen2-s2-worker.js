import { planS2TileJob } from './gen2-s2-runtime.js';
import { bridgeFragments } from './gen2-bridge-world.js';

globalThis.onmessage=event=>{
  const {id,seed,tile}=event.data;
  const started=performance.now();let last=started;
  try{
    const job=planS2TileJob(seed,tile,{reserveSoftFeatures:true});
    for(;;){
      const next=job.next();
      if(next.done){
        const result=next.value;
        postMessage({type:'complete',id,result,fragments:bridgeFragments(result.snapshot.bridges),elapsedMs:performance.now()-started});
        break;
      }
      const now=performance.now();
      if(now-last>=250){postMessage({type:'progress',id,tile,progress:next.value,elapsedMs:now-started});last=now;}
    }
  }catch(error){
    console.error('S2 planning failed',error);
    postMessage({type:'error',id,message:error.message,stack:error.stack});
  }
};
