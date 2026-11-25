// Phase21 candidate: one row at a time, retain existing monthlyRecords/monthlyNetReads.
// Never publish until emulator acceptance; trusted class-year index initialization required.
import {KEYS,same} from './library-core.mjs';
const fail=m=>{throw Error(m)};
const isCount=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000;
const isTotal=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000;
const zero=()=>Object.fromEntries(KEYS.map(k=>[k,0]));
const sum=r=>KEYS.slice(0,4).reduce((a,k)=>a+(r?.[k]??0),0);
const valid=r=>r&&Object.keys(r).length===KEYS.length&&KEYS.every(k=>isCount(r[k]));
const monthOK=(m,y)=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m)&&m.slice(0,4)===String(y);
const identityOK=id=>typeof id==='string'&&/^[A-Z0-9_-]{1,100}$/.test(id);
const clsOK=c=>typeof c==='string'&&/^([1-6][A-Z]+|PRA[A-Z ]*)$/.test(c);
const cleanDoc=(d,cls,month)=>d===null?{class:cls,month,records:{},revision:0}:d;
export function indexPreview({year,cls,rawDocs,netDocs}){
 if(!Number.isInteger(year)||year<2027||!clsOK(cls))fail('INVALID_CLASS_YEAR');
 const issues=[], months=[];let priorRaw=null;for(let i=1;i<=12;i++){const month=year+'-'+String(i).padStart(2,'0'),id=cls+'_'+month,r=rawDocs[id],n=netDocs[id];if(!r&&!n)continue;
  if(!r||!n||r.class!==cls||n.class!==cls||r.month!==month||n.month!==month||!r.records||!n.records||!Object.keys(r.records).length||!same(Object.keys(r.records).sort(),Object.keys(n.records).sort())||!Object.values(r.records).every(valid)||!Object.values(n.records).every(valid)||(r.revision??0)!==(n.revision??0)){issues.push({id,reason:'MONTH_PAIR_REQUIRES_REVIEW'});continue;}for(const [sid,raw] of Object.entries(r.records)){const base=priorRaw?.records?.[sid]?.digital??0,net=n.records[sid];if(raw.digital<base||!same({...raw,digital:raw.digital-base},net)||sum(net)!==net.bm+net.bi+net.lain)issues.push({id,sid,reason:'NET_OR_LANGUAGE_MISMATCH'});}months.push(month);priorRaw=r;
 }
 return {ready:issues.length===0,issues,index:{class:cls,year,latest:months.at(-1)??'',prior:months.at(-2)??''}};
}
export function planRow({meta,index,cls,month,sid,student,raw,net,anchorDoc,input,expected}){
 const year=meta?.activeYear;if(meta?.nilamReady!==true||!Number.isInteger(year)||!monthOK(month,year)||!clsOK(cls)||!identityOK(sid))fail('NILAM_NOT_READY_OR_INVALID');
 if(!index||index.class!==cls||index.year!==year||!(index.latest===''||monthOK(index.latest,year))||!(index.prior===''||monthOK(index.prior,year))||(index.prior!==''&&index.prior>=index.latest))fail('INDEX_NOT_READY');
 if(!student||student.className!==cls||student.masterYear!==year||student.status==='inactive')fail('ROSTER_CHANGED');
 if(index.latest&&month<index.latest)fail('EARLIER_MONTH_RECONCILIATION_REQUIRED');
 const isNew=month!==index.latest,anchor=isNew?index.latest:index.prior;
 if(isNew&&(raw||net)||!isNew&&(!raw||!net))fail('MONTH_INDEX_MISMATCH');
 if(anchor&&(!anchorDoc||anchorDoc.class!==cls||anchorDoc.month!==anchor||!Object.keys(anchorDoc.records??{}).length))fail('ANCHOR_NOT_READY');
 const r=cleanDoc(raw,cls,month),n=cleanDoc(net,cls,month);
 if(r.class!==cls||n.class!==cls||r.month!==month||n.month!==month||!r.records||!n.records||(r.revision??0)!==(n.revision??0)||!Number.isSafeInteger(r.revision??0)||(r.revision??0)<0)fail('MONTH_PAIR_INVALID');
 const oldRaw=r.records[sid]??null,oldNet=n.records[sid]??null,base=anchor?anchorDoc.records[sid]?.digital??0:0;
 if((oldRaw===null)!==(oldNet===null)||oldRaw&&!valid(oldRaw)||oldNet&&!valid(oldNet)||!isCount(base))fail('ROW_REQUIRES_REVIEW');
 if(!same(expected,{raw:oldRaw,net:oldNet,anchor:base,masterRevision:student.masterRevision}))fail('STALE_ROW');
 if(!valid(input)||input.digital<base)fail('INVALID_INPUT_OR_DIGITAL_REVERSED');
 const next={...input,digital:input.digital-base};
 // Original UI auto-fills Lain-Lain. Reject impossible language allocation rather than silently undercount.
 const langRest=sum(next)-next.bm-next.bi;if(langRest<0||!isCount(langRest))fail('LANGUAGE_TOTAL_EXCEEDS_MATERIAL');next.lain=langRest;
 const normalized={...input,lain:langRest},delta=sum(next)-sum(oldNet??zero());
 const totals=student.yearlyTotals??{},oldYear=totals[year]??0,oldLife=student.lifetimeTotal??0;
 if(!isTotal(oldYear)||!isTotal(oldLife))fail('INVALID_EXISTING_TOTAL');
 const yearly=Math.max(0,oldYear+delta),life=Math.max(0,oldLife+delta);if(!isTotal(yearly)||!isTotal(life))fail('TOTAL_LIMIT');
 const rev=(r.revision??0)+1,mid=cls+'_'+month, marker={monthDoc:mid,revision:rev};
 return {raw:{class:cls,month,records:{...r.records,[sid]:normalized},revision:rev,lastStudentId:sid},net:{class:cls,month,records:{...n.records,[sid]:next},revision:rev,lastStudentId:sid},student:{yearlyTotals:{...totals,[year]:yearly},lifetimeTotal:life,nilamLast:marker},index:isNew?{...index,latest:month,prior:index.latest}:null,delta};
}
export function createNilamWriter(db,sdk){const {doc,runTransaction}=sdk,ref=(c,id)=>doc(db,c,id),val=s=>s.exists()?s.data():null;return async cmd=>runTransaction(db,async tx=>{
 const {cls,month,sid}=cmd;if(!clsOK(cls)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!identityOK(sid))fail('INVALID_PATH');
 const m=cls+'_'+month,idx=ref('nilamMonthIndex',cls+'_'+month.slice(0,4)),r=ref('monthlyRecords',m),n=ref('monthlyNetReads',m),s=ref('students',sid);
 const [meta,index,raw,net,student]=await Promise.all([ref('libraryMeta','current'),idx,r,n,s].map(async x=>val(await tx.get(x))));
 const anchor=index&&(month===index.latest?index.prior:index.latest),anchorDoc=anchor?val(await tx.get(ref('monthlyRecords',cls+'_'+anchor))):null;
 const p=planRow({...cmd,meta,index,raw,net,student,anchorDoc});tx.set(r,p.raw);tx.set(n,p.net);tx.update(s,p.student);if(p.index)tx.set(idx,p.index);return {sid,delta:p.delta};
 });}
// Sequential per-row commit avoids 20-call atomic-batch limit; explicit outcomes, no silent partial success.
export async function saveRows(write,commands){const outcomes=[];for(const cmd of commands){try{outcomes.push({sid:cmd.sid,ok:true,...await write(cmd)});}catch(e){outcomes.push({sid:cmd.sid,ok:false,error:String(e?.code??e?.message??'SAVE_FAILED')});}}return {outcomes,complete:outcomes.every(x=>x.ok)};}
