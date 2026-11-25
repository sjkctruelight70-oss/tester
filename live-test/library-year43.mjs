// Candidate for already initialized legacy library only. No cross-project proof.
import {planRoster} from './roster-sync.mjs';
import {canonical} from './annual-reference.mjs';
import {indexPreview} from './nilam-safe.mjs';
const check=(x,m)=>{if(!x)throw Error(m)};
const eq=(a,b)=>canonical(a)===canonical(b);
const validClass=c=>typeof c==='string'&&/^([1-6][A-Z]+|PRA[A-Z ]*)$/.test(c);
export function syncKey(i){check(Number.isInteger(i?.year)&&i.year>=2027&&i.year<=2099&&Number.isSafeInteger(i.revision)&&i.revision>=1&&i.jobId===`master-${i.year}-${i.revision}`,'INVALID_SYNC_JOB');return {jobId:i.jobId,year:i.year,revision:i.revision};}
const healthy=m=>m?.loanIndexReady===true&&m.nilamReady===true&&(m.nilamMode??'legacy')==='legacy';
export function beginYear(meta,input){const key=syncKey(input);check(meta&&Number.isInteger(meta.activeYear)&&(meta.nilamMode??'legacy')==='legacy','TRUSTED_BOOTSTRAP_REQUIRED');
 if(meta.syncLock){check(meta.loanIndexReady===false&&meta.nilamReady===false&&eq(meta.syncLock,{...key,fromYear:meta.activeYear}),'OTHER_LIBRARY_SYNC_LOCK');return {status:'locked',meta};}
 check(healthy(meta),'TRUSTED_BOOTSTRAP_REQUIRED');
 if(meta.lastSync&&eq(meta.lastSync,key)){check(meta.activeYear===key.year,'YEAR_MISMATCH');return {status:'ready',meta};}
 check(key.year===meta.activeYear||key.year===meta.activeYear+1,'YEAR_SEQUENCE_INVALID');
 if(meta.lastSync)check(key.year>meta.lastSync.year||(key.year===meta.lastSync.year&&key.revision>meta.lastSync.revision),'STALE_LIBRARY_SYNC');
 return {status:'begin',meta:{...meta,loanIndexReady:false,nilamReady:false,syncLock:{...key,fromYear:meta.activeYear}}};
}
export function assertLocked(meta,input){check(beginYear(meta,input).status==='locked','LIBRARY_SYNC_NOT_LOCKED');}
export function indexPlan({meta,input,students,indices,rawDocs,netDocs}){const mode=beginYear(meta,input).status;check(['locked','ready'].includes(mode),'LIBRARY_SYNC_NOT_LOCKED');const p=planRoster(input,students);check(p.ok&&!p.ops.length,'LIBRARY_ROSTER_NOT_VERIFIED');const year=input.year,newYear=mode==='locked'&&meta.activeYear!==year;const cls=new Set(Object.values(input.students).map(s=>s.className));const creates={};
 for(const [k,d] of [...Object.entries(rawDocs),...Object.entries(netDocs)]){check(validClass(d?.class)&&d.month?.startsWith(year+'-')&&k===d.class+'_'+d.month&&/^\d{4}-(0[1-9]|1[0-2])$/.test(d.month),'MONTH_PATH_INVALID');cls.add(d.class);}
 for(const [k,d] of Object.entries(indices)){check(validClass(d?.class)&&d.year===year&&k===d.class+'_'+year,'INDEX_PATH_INVALID');cls.add(d.class);}
 if(newYear){check(!Object.keys(rawDocs).length&&!Object.keys(netDocs).length,'TARGET_YEAR_HAS_RECORDS');for(const s of students)check((s.data.yearlyTotals?.[year]??0)===0,'TARGET_YEAR_HAS_TOTALS');}
 for(const c of cls){check(validClass(c),'CLASS_INVALID');const id=c+'_'+year,q=indexPreview({year,cls:c,rawDocs,netDocs});check(q.ready,'MONTH_PAIR_REQUIRES_REVIEW');const old=indices[id];if(old)check(eq(old,q.index),'MONTH_INDEX_MISMATCH');else{check(mode==='locked'&&!q.index.latest,'MISSING_EXISTING_MONTH_INDEX');creates[id]=q.index;}}
 return {creates,classes:[...cls].sort(),unmatched:p.unmatched.length};
}
export function finishYear(meta,input,verified){assertLocked(meta,input);check(verified&&Object.keys(verified.creates).length===0,'MONTH_INDEX_NOT_VERIFIED');const next={...meta,activeYear:input.year,loanIndexReady:true,nilamReady:true,lastSync:syncKey(input)};delete next.syncLock;return next;}
