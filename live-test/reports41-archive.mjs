import {report} from './reports35-core.mjs';
const check=(x,m)=>{if(!x)throw Error(m)};
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9_~-]{1,180}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
const idOK=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const integer=(x,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const text=(x,max)=>typeof x==='string'&&x.length<=max;
const datesOK=(x,y)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number(x.slice(0,4))===y&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const day=x=>new Intl.DateTimeFormat('ms-MY',{weekday:'long',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(x+'T12:00:00+08:00'));
const fields=['teacher','place','officer','activity','sivik','pikebm','other'];
const max=k=>['teacher','place','officer'].includes(k)?300:5000;
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function archiveDocument(r,year){
 check(r&&r.format==='weekly-v1'&&r.schoolYear===year&&safe(r.groupId)&&text(r.groupName,500)&&integer(r.total,1,2000)&&integer(r.createdAt,1)&&safe(r.createdBy)&&integer(r.epoch,1)&&integer(r.masterRevision,1)&&integer(r.groupRevision),'INVALID_ARCHIVE');
 check(r.fields&&Object.keys(r.fields).length===7&&fields.every(k=>text(r.fields[k],max(k))),'INVALID_ARCHIVE_FIELDS');
 const rows=Object.entries(r.rows??{}).sort(([a],[b])=>a.localeCompare(b));check(rows.length>0&&rows.length<=60&&rows.every(([d,n])=>datesOK(d,year)&&integer(n,0,r.total)),'INVALID_ARCHIVE_ROWS');
 if(r.removed!==undefined)check(r.removed&&integer(r.removed.at,1)&&safe(r.removed.by),'INVALID_REMOVAL');
 return {type:'weekly',year,groupName:r.groupName,fields:Object.fromEntries(fields.map(k=>[k,r.fields[k]])),rows:rows.map(([date,reportPresent])=>({date,day:day(date),reportPresent,reportTotal:r.total}))};
}
export async function reportKey(payload){const data=new TextEncoder().encode(stable(payload));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');}
export function createReportArchive({read,verify,group,commit,uid,role,stamp=()=>({'.sv':'timestamp'})}){
 check(safe(uid)&&['Guru','Admin'].includes(role),'INVALID_SESSION');
 const meta=async()=>{const m=await read('academic_meta/current');check(integer(m?.activeYear,2027,2099)&&integer(m.epoch,1)&&integer(m.masterRevision,1),'CURRENT_YEAR_NOT_READY');return m;};
 const base=y=>`academic_years/${y}`;
 async function header(y,m,write=false){check(integer(y,2027,m.activeYear)&&y>=m.activeYear-6,'YEAR_OUTSIDE_RETENTION');const h=await read(base(y)+'/header');check(h?.schoolYear===y&&h.format==='annual-v1'&&h.storageVersion===2&&h.readOnly===(y!==m.activeYear),'YEAR_NOT_READY');if(write)check(y===m.activeYear&&!m.rolloverLock&&!m.pendingSync,'YEAR_NOT_WRITABLE');}
 async function guard(m){await verify();const n=await meta();check(stable(m)===stable(n),'YEAR_CHANGED_RELOAD');}
 async function context(y,gid){const m=await meta();await header(y,m,true);const g=await read(base(y)+'/groups/'+gid);check(g?.id===gid&&g.schoolYear===y&&g.active===true&&integer(g.memberRevision),'GROUP_NOT_READY');return {m,g};}
 async function saved(y,id){check(idOK(id),'INVALID_REPORT_ID');return read(base(y)+'/reports/'+id);}
 return {
 async list(y){await verify();const m=await meta();await header(y,m);const raw=await read(base(y)+'/reports');const result=[];for(const [id,r] of Object.entries(raw??{})){check(idOK(id),'INVALID_REPORT_ID');const d=archiveDocument(r,y);if(!r.removed)result.push({id,groupName:d.groupName,timestamp:new Date(r.createdAt).toISOString(),date:d.rows[0].date});}await guard(m);return result.sort((a,b)=>b.timestamp.localeCompare(a.timestamp)||a.id.localeCompare(b.id));},
 async documents(y,ids){await verify();const m=await meta();await header(y,m);check(Array.isArray(ids)&&ids.length>0&&ids.length<=30&&new Set(ids).size===ids.length&&ids.every(idOK),'INVALID_ARCHIVE_SELECTION');const docs=await Promise.all(ids.map(async id=>{const r=await saved(y,id);check(r&&!r.removed,'REPORT_UNAVAILABLE');return archiveDocument(r,y);}));await guard(m);return docs;},
 async save(snapshot,dates,f){await verify();const y=snapshot?.year,gid=snapshot?.gid;check(integer(y,2027,2099)&&safe(gid),'INVALID_GROUP');const {m,g}=await context(y,gid);const current=await group(gid,y);check(stable(current)===stable(snapshot),'GROUP_CHANGED_RELOAD');const d=report(current,dates,f);const payload={format:'weekly-v1',schoolYear:y,groupId:gid,groupName:d.groupName,total:d.activeCount,rows:Object.fromEntries(d.rows.map(r=>[r.date,r.reportPresent])),fields:d.fields,epoch:m.epoch,masterRevision:m.masterRevision,groupRevision:g.memberRevision};const id=await reportKey(payload);const path=base(y)+'/reports/'+id;const previous=await saved(y,id);if(previous){archiveDocument(previous,y);check(!previous.removed,'REPORT_REMOVED');const {createdAt,createdBy,...old}=previous;check(stable(old)===stable(payload),'REPORT_ID_COLLISION');await guard(m);return {id,alreadySaved:true};}await guard(m);const again=await context(y,gid);check(stable(again.m)===stable(m)&&again.g.memberRevision===g.memberRevision,'GROUP_CHANGED_RELOAD');await commit(path,{...payload,createdBy:uid,createdAt:stamp()});const actual=await saved(y,id);archiveDocument(actual,y);const {createdAt,createdBy,...rest}=actual;check(createdBy===uid&&stable(rest)===stable(payload),'WRITE_RESULT_UNKNOWN_RELOAD');await verify();return {id,alreadySaved:false};},
 async remove(y,id){check(role==='Admin','ADMIN_REQUIRED');await verify();const m=await meta();await header(y,m,true);const r=await saved(y,id);archiveDocument(r,y);check(!r.removed,'REPORT_REMOVED');await guard(m);await commit(base(y)+'/reports/'+id+'/removed',{by:uid,at:stamp()});const actual=await saved(y,id);check(actual?.removed?.by===uid,'WRITE_RESULT_UNKNOWN_RELOAD');archiveDocument(actual,y);await verify();return true;}
 };
}
