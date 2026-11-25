// Offline trusted preflight only. No SDK, credentials or network writes.
import {bootstrap2027Plan,assertPlanCurrent,jobInput} from './lifecycle.mjs';
import {digest,canonical} from './annual-reference.mjs';
import {planRoster} from './roster-sync.mjs';
import {indexPreview} from './nilam-safe.mjs';
import {loanIndexPreview} from './library-core.mjs';
const check=(x,m)=>{if(!x)throw Error(m)};
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[A-Z0-9_-]{1,100}$/.test(x)&&!['__PROTO__','CONSTRUCTOR','PROTOTYPE'].includes(x.toUpperCase());
const same=(a,b)=>canonical(a)===canonical(b);
const patchPath=k=>/^(academic_meta\/current|academic_years\/2026\/header|academic_years\/2027\/(header|students|groups)|master_sync_jobs\/master-2027-1)$/.test(k);
const legacy=['competition_records','pajsk_final_scores','school_data_v11','school_group_meta_v11','school_reports_v11','school_settings'];
const collections=['students','books','borrowLogs','monthlyRecords','monthlyNetReads','libraryVisits','loanSlots','nilamMonthIndex','libraryMeta'];
export async function initialRtdbPreview({snapshot,backup,rows,actor,stamp}){
 check(obj(snapshot)&&obj(backup)&&same(snapshot,backup),'BACKUP_NOT_IDENTICAL');
 check(legacy.every(k=>Object.hasOwn(snapshot,k)),'LEGACY_MISSING');
 check(!Object.hasOwn(snapshot,'academic_meta')&&!Object.hasOwn(snapshot,'academic_years')&&!Object.hasOwn(snapshot,'master_sync_jobs'),'EXISTING_INITIALIZATION');
 const p=bootstrap2027Plan(snapshot,rows,actor,stamp,{confirmed:true});
 p.patch['academic_meta/current'].controlRevision=1;
 check(Object.keys(p.patch).length===6&&Object.keys(p.patch).every(patchPath),'UNEXPECTED_PATCH_PATH');
 assertPlanCurrent(snapshot,p);
 return {kind:'RTDB_OFFLINE_PREVIEW',backupDigest:await digest(backup),rosterDigest:await digest(rows),...p};
}
export async function verifyInitialRtdb({before,after,preview}){
 check(await digest(before)===preview.backupDigest,'BACKUP_CHANGED');
 check(Object.keys(preview.patch).length===6&&Object.keys(preview.patch).every(patchPath),'UNEXPECTED_PATCH_PATH');
 check(!Object.hasOwn(before,'academic_meta')&&!Object.hasOwn(before,'academic_years')&&!Object.hasOwn(before,'master_sync_jobs'),'EXISTING_INITIALIZATION');
 const next=structuredClone(before);
 for(const [path,value] of Object.entries(preview.patch)){const parts=path.split('/');let node=next;for(const k of parts.slice(0,-1))node=node[k]??={};node[parts.at(-1)]=structuredClone(value);}
 check(same(next,after),'INITIALIZED_SNAPSHOT_MISMATCH');
 check(legacy.every(k=>same(before[k],after[k])),'LEGACY_CHANGED');
 return {verified:true,legacyUnchanged:true,year:jobInput(after).year};
}
function fullLibrary(x){check(obj(x)&&collections.every(k=>Object.hasOwn(x,k)&&obj(x[k])),'INCOMPLETE_LIBRARY_SNAPSHOT');for(const k of collections)for(const [key,d] of Object.entries(x[k]))check(key&&!['__proto__','constructor','prototype'].includes(key.toLowerCase())&&obj(d),'INVALID_DOCUMENT');}
function rosterVerification(rtdb,library){const input=jobInput(rtdb),p=planRoster(input,Object.entries(library.students).map(([id,data])=>({id,data})));return {input,p};}
export async function libraryInitializationPreview({rtdb,library,backup}){
 fullLibrary(library);fullLibrary(backup);check(same(library,backup),'BACKUP_NOT_IDENTICAL');
 const {input,p}=rosterVerification(rtdb,library),year=input.year;
 const issues=[...p.issues];
 const old=library.libraryMeta.current??null;
 if(old&&(old.activeYear>=year||old.loanIndexReady===true||old.nilamReady===true))issues.push({reason:'METADATA_NOT_IN_MAINTENANCE'});
 const loans=loanIndexPreview(library.books,library.students);issues.push(...loans.issues);
 for(const [bookId,b] of Object.entries(library.books)){
  if(!id(bookId)||!['in','out','retired'].includes(b.status)||(['in','retired'].includes(b.status)&&b.borrowerId!=null)||(b.status==='retired'&&(!b.retirement||['borrowerName','borrowerClass','borrowDate','dueDate'].some(k=>b[k]!=null)))||(b.status==='out'&&!id(b.borrowerId)))issues.push({bookId,reason:'BOOK_STATE_REQUIRES_REVIEW'});
 }
 for(const [sid,s] of Object.entries(library.loanSlots))if(!Object.hasOwn(loans.slots,sid)||!same(s,loans.slots[sid]))issues.push({sid,reason:'EXISTING_SLOT_CONFLICT'});
 const classes=new Set(Object.values(input.students).map(s=>s.className)),indices={};
 // Include every target-year document in the audit; no hidden extra class/month may be silently ignored.
 for(const kind of ['monthlyRecords','monthlyNetReads'])for(const [docId,d] of Object.entries(library[kind])){
  if(String(d.month??'').startsWith(String(year))||docId.includes('_'+year+'-')){
   if(!/^([1-6][A-Z]+|PRA[A-Z ]*)$/.test(d.class??'')||!new RegExp('^'+year+'-(0[1-9]|1[0-2])$').test(d.month??'')||docId!==d.class+'_'+d.month){issues.push({docId,reason:'INVALID_MONTH_PATH'});continue;}
   classes.add(d.class);
  }
 }
 const totals=new Map();
 for(const [docId,d] of Object.entries(library.monthlyNetReads))if(String(d.month??'').startsWith(String(year))){for(const [sid,r] of Object.entries(d.records??{})){if(!id(sid)||!Object.hasOwn(library.students,sid)||!obj(r)) {issues.push({docId,sid,reason:'MONTH_STUDENT_UNRESOLVED'});continue;} const counts=['digital','bukanBuku','fiksyen','bukanFiksyen'].map(k=>r[k]);if(!counts.every(n=>Number.isSafeInteger(n)&&n>=0))continue; totals.set(sid,(totals.get(sid)??0)+counts.reduce((a,b)=>a+b,0));}}
 for(const [sid,student] of Object.entries(library.students)){const existing=student.yearlyTotals?.[year]??0;if(!Number.isSafeInteger(existing)||existing<0||existing!==(totals.get(sid)??0))issues.push({sid,reason:'TARGET_YEAR_TOTAL_REQUIRES_REVIEW'});}
 for(const cls of classes){const q=indexPreview({year,cls,rawDocs:library.monthlyRecords,netDocs:library.monthlyNetReads});issues.push(...q.issues);indices[cls+'_'+year]=q.index;}
 for(const [key,v] of Object.entries(library.nilamMonthIndex))if(key.endsWith('_'+year)||v.year===year){if(!Object.hasOwn(indices,key)||!same(indices[key],v))issues.push({key,reason:'EXISTING_MONTH_INDEX_CONFLICT'});}
 // Never auto-reconcile legacy totals or reassign unmatched borrower IDs. Identity sync is an independent confirmed step.
 return {kind:'LIBRARY_OFFLINE_PREVIEW',year,jobId:input.jobId,revision:input.revision,backupDigest:await digest(backup),rtdbDigest:await digest({meta:rtdb.academic_meta.current,input}),ok:!issues.length,issues,identityOps:p.ops,unmatched:p.unmatched,slotCreates:Object.fromEntries(Object.entries(loans.slots).filter(([k])=>!Object.hasOwn(library.loanSlots,k))),indexCreates:Object.fromEntries(Object.entries(indices).filter(([k])=>!Object.hasOwn(library.nilamMonthIndex,k))),expectedSlots:loans.slots,expectedIndices:indices,metadataCandidate:{activeYear:year,loanIndexReady:true,nilamReady:true,nilamMode:'legacy'}};
}
export async function verifyLibraryInitialization({rtdb,before,after,preview}){
 fullLibrary(before);fullLibrary(after);check(preview.ok&&await digest(before)===preview.backupDigest,'PREVIEW_INVALID');check(await digest({meta:rtdb.academic_meta.current,input:jobInput(rtdb)})===preview.rtdbDigest,'MASTER_CHANGED');
 const fresh=await libraryInitializationPreview({rtdb,library:before,backup:before});check(same(fresh,preview),'PREVIEW_CHANGED');
 const expected=structuredClone(before);for(const op of preview.identityOps)expected.students[op.id]={...(expected.students[op.id]??{}),...op.after};Object.assign(expected.loanSlots,preview.slotCreates);Object.assign(expected.nilamMonthIndex,preview.indexCreates);
 // Readiness flags remain disabled until this exact comparison of all exported collections passes.
 check(same(expected,after),'LIBRARY_INITIALIZED_SNAPSHOT_MISMATCH');
 const {p}=rosterVerification(rtdb,after);check(p.ok&&!p.ops.length,'ROSTER_NOT_VERIFIED');
 check(same(after.loanSlots,preview.expectedSlots),'LOAN_INDEX_MISMATCH');
 for(const [k,v] of Object.entries(preview.expectedIndices))check(same(after.nilamMonthIndex[k],v),'MONTH_INDEX_MISMATCH');
 return {verified:true,metadataCandidate:preview.metadataCandidate,unmatchedCount:p.unmatched.length};
}
