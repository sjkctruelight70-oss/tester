import {review,preview} from './membership27-core.mjs';
import {assertPlanCurrent} from './lifecycle.mjs';
import {canonical} from './annual-reference.mjs';
const check=(v,m)=>{if(!v)throw Error(m)};
export const MAX_BATCH=100;
export function memberBatchPlan(state,request,actor,stamp){
 const {year,epoch,category,groupId,students}=request;
 check(Array.isArray(students)&&students.length>0&&students.length<=MAX_BATCH&&new Set(students.map(x=>x.studentId)).size===students.length,'INVALID_BATCH_SELECTION');
 const v=review(state);check(v.year===year&&v.epoch===epoch,'STALE_YEAR');
 const g=v.groups.find(x=>x.id===groupId&&x.active&&x.category===category);check(g,'INVALID_GROUP');
 const patch={},expected={},rows=[];
 for(const s of students){
  const r=v.rows.find(x=>x.id===s.studentId&&x.category===category);
  check(r&&!r.invalid&&!r.currentGroupId&&!r.expectedMembershipId&&r.grade===g.grade&&s.expectedSlotRevision===r.expectedSlotRevision&&s.expectedMembershipId===null,'BATCH_UNASSIGNED_ONLY_RELOAD');
  const p=preview(state,{year,epoch,category,groupId,studentId:s.studentId,expectedSlotRevision:s.expectedSlotRevision,expectedMembershipId:null},actor,stamp);
  for(const [k,val] of Object.entries(p.plan.patch)){if(Object.hasOwn(patch,k))check(k.endsWith('/memberRevision')&&canonical(patch[k])===canonical(val),'BATCH_PATCH_COLLISION');patch[k]=val;}
  for(const [k,val] of Object.entries(p.plan.expected)){if(Object.hasOwn(expected,k))check(canonical(expected[k])===canonical(val),'BATCH_GUARD_COLLISION');expected[k]=val;}
  rows.push({studentId:r.id,name:r.name,className:r.className});
 }
 return {request:structuredClone(request),group:g.name,rows,plan:{patch,expected}};
}
export function createMemberBatch({readState,commit,assertAdmin,actor,stamp}){return {
 async previewBatch(request){await assertAdmin();const p=memberBatchPlan(await readState(),request,actor,stamp());await assertAdmin();return p;},
 async saveBatch(p,confirmed){check(confirmed===true,'CONFIRM_REQUIRED');await assertAdmin();const state=await readState();assertPlanCurrent(state,p.plan);const next=memberBatchPlan(state,p.request,actor,stamp());check(canonical(next.plan.expected)===canonical(p.plan.expected)&&canonical(next.rows)===canonical(p.rows)&&next.group===p.group,'PREVIEW_CHANGED');await assertAdmin();await commit(next.plan.patch);return {status:'committed',count:next.rows.length};}
};}
// Excel: one already-selected school event/project; no automatic overwrite, no silent omission.
export function parseSchoolRows(headers,rows){
 const required=['NO. MURID','KELAS','KEDUDUKAN'];check(Array.isArray(headers)&&required.every(h=>headers.filter(x=>x===h).length===1),'EXCEL_REQUIRED_HEADERS');
 check(Array.isArray(rows)&&rows.length>0&&rows.length<=MAX_BATCH,'EXCEL_BATCH_1_TO_100');
 return rows.map((r,i)=>{const raw=String(r.KEDUDUKAN??'').trim();return {studentId:typeof r['NO. MURID']==='string'?r['NO. MURID']:null,className:String(r.KELAS??'').trim().toUpperCase(),actualRank:/^\d{1,2}$/.test(raw)?Number(raw):null,sourceRow:r.__rowNum__===undefined?i+2:r.__rowNum__+1};});
}
export function createSchoolBatch({snapshot,importPreview,save,verify}){
 async function previewImport(context,eventId,projectId,rows){
  check(Array.isArray(rows)&&rows.length>0&&rows.length<=MAX_BATCH,'EXCEL_BATCH_1_TO_100');await verify();
  const s=await snapshot(context),event=s.raw.competition_events[eventId],project=s.raw.competition_projects[eventId]?.[projectId];check(event?.active&&project?.active&&event.level==='SEKOLAH','SELECT_SCHOOL_EVENT');
  const entries=await importPreview(s.context,eventId,projectId,rows,s);const count=new Map();for(const r of rows){const id=typeof r.studentId==='string'?r.studentId.trim().toUpperCase():'';if(id)count.set(id,(count.get(id)??0)+1);}
  const checked=entries.map((r,i)=>{const id=typeof rows[i].studentId==='string'?rows[i].studentId.trim().toUpperCase():'';const student=s.raw.students[id];const old=s.raw.competition_entries?.[eventId]?.[projectId]?.[id];return {...r,...(old?{existingRank:old.record?.actualRank??old.record?.rank??'',existingDeleted:old.deleted===true}:{}),requestedRank:rows[i].actualRank??null,sourceRow:rows[i].sourceRow??i+2,studentId:r.studentId??id,name:student?.nameEn??'',className:student?.className??'',...(count.get(id)>1?{status:'error',reason:'DUPLICATE_IMPORT'}:{})};});
  return {context:s.context,eventId,projectId,event,project,rows:structuredClone(rows),checked};
 }
 async function saveImport(p,confirmed){check(confirmed===true,'CONFIRM_REQUIRED');check(p.checked.every(r=>r.status!=='error')&&p.checked.some(r=>r.status==='ready'),'FIX_IMPORT_ERRORS_OR_NO_NEW_ROWS');const q=await previewImport(p.context,p.eventId,p.projectId,p.rows);check(canonical(q.context)===canonical(p.context)&&canonical(q.event)===canonical(p.event)&&canonical(q.project)===canonical(p.project)&&canonical(q.checked)===canonical(p.checked),'IMPORT_PREVIEW_CHANGED');
  const results=[],ready=q.checked.filter(r=>r.status==='ready');for(const r of ready){try{const v=await save(q.context,{eventId:q.eventId,projectId:q.projectId,studentId:r.studentId,expectedRevision:0,expectedClassName:r.className,input:r.input});results.push({studentId:r.studentId,sourceRow:r.sourceRow,status:v.status});if(!['committed','duplicate'].includes(v.status))break;}catch(e){const code=String(e?.message??'ERROR');results.push({studentId:r.studentId,sourceRow:r.sourceRow,status:'check_required',reason:/https?:|token|AIza|\?/i.test(code)?'NETWORK_OR_AUTH_ERROR':code.slice(0,100)});break;}}
  return {results,skipped:q.checked.filter(r=>r.status==='existing').map(r=>r.studentId),notAttempted:ready.slice(results.length).map(r=>r.studentId)};
 }
 return {previewImport,saveImport};
}
