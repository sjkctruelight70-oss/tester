// Only for passive display checks. Never authorize a business read or write from a cached proof.
export function idleMonitor({full,poll,subscribe,identity,now=()=>Date.now(),maxAge=60000,timeoutMs=25000}){
 let dead=false,proof=null,at=0,stop=[],ready=new Set(),pending=null,notify=null;
 function dispose(){dead=true;proof=null;ready.clear();for(const f of stop.splice(0))try{f()}catch{}}
 function fail(){if(dead)return;dispose();notify?.();}
 const guard=()=>{if(dead||!identity())throw Error('ACCESS_LOST')};
 async function check(onBlocked){if(dead)throw Error('ACCESS_LOST');notify=onBlocked;if(pending)return pending;
  let deadline;const work=(async()=>{guard();if(!proof||now()-at>=maxAge||ready.size!==proof.watchCount){
    const next=await full();guard();if(proof&&next.fingerprint!==proof.fingerprint)throw Error('ACCESS_CHANGED');
    proof=next;at=now();if(!stop.length){const subscriptions=subscribe(proof,(index,valid,fromCache,pendingWrite)=>{
      if(dead)return;if(!identity()||pendingWrite||(!fromCache&&!valid)||(fromCache&&ready.has(index))){fail();return;}
      if(!fromCache)ready.add(index);
    },fail);for(const f of subscriptions){if(dead)f();else stop.push(f);}}
    guard();return;
   }
   await poll(proof);guard();
  })();const timeout=new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error("ACCESS_CHECK_TIMEOUT")),timeoutMs);});const task=Promise.race([work,timeout]).catch(e=>{fail();throw e});pending=task;try{return await task}finally{clearTimeout(deadline);if(pending===task)pending=null;}
 }
 return {check,dispose};
}
