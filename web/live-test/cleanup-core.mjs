export const sides=['koko','library'];
// Allow cleanup only after fresh reads of both project lists. Missing side can be a previous partial cleanup.
export function cleanupPlan(pair){
 if(!pair || !/^[A-F0-9]{24}$/.test(pair.code)) throw Error('INVALID_CODE');
 const rows=[];
 for(const side of sides){
  if(!Array.isArray(pair[side])||pair[side].length>1)throw Error('AMBIGUOUS_PAIR');
  for(const r of pair[side]){
   if(!/^[A-Za-z0-9_-]{1,128}$/.test(r.uid)||r.code!==pair.code||r.status!=='revoked')throw Error('NOT_REVOKED');
   rows.push({side,uid:r.uid,code:r.code});
  }
 }
 if(!rows.length)throw Error('NO_REQUEST');
 if(pair.koko.length&&pair.library.length&&pair.koko[0].label!==pair.library[0].label)throw Error('AMBIGUOUS_PAIR');
 return rows;
}
export async function cleanupPair(pair,adapters){
 const jobs=cleanupPlan(pair);
 const results=await Promise.all(jobs.map(async j=>{try{await adapters[j.side].purgeRevoked(j.uid,j.code);return {...j,ok:true};}catch(e){return {...j,ok:false,error:String(e.code||e.message||e)};}}));
 return {complete:results.every(x=>x.ok),results};
}
