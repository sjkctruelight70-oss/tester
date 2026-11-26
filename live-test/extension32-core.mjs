import {attendanceScore} from './attendance-score-v5.mjs';
import {decodeEventYear} from './event-master.mjs';
import {analysis,categories} from './competition.mjs';
import {pglReview} from './pgl-review.mjs';
import {grade} from './membership27-core.mjs';
const cats=['KELAB','UNIFORM','SUKAN'];
const check=(v,m)=>{if(!v)throw Error(m)};
const own=(x,k)=>Object.hasOwn(x??{},k);
const entries=x=>Object.entries(x??{});
const idOK=x=>typeof x==='string'&&/^[A-Z0-9_-]{1,100}$/.test(x)&&!['__PROTO__','CONSTRUCTOR','PROTOTYPE'].includes(x);
export const stars=n=>n>=720?5:n>=576?4:n>=432?3:n>=288?2:n>=144?1:0;
export function context(meta,h){check(Number.isInteger(meta?.activeYear)&&meta.activeYear>=2027&&meta.activeYear<=2099&&Number.isSafeInteger(meta.epoch)&&Number.isSafeInteger(meta.masterRevision)&&meta.masterRevision>0&&!meta.rolloverLock&&!meta.pendingSync&&h?.schoolYear===meta.activeYear&&h.format==='annual-v1'&&h.storageVersion===2&&h.readOnly===false,'CURRENT_YEAR_NOT_READY');return meta.activeYear;}
// Build projection for one selected student. Never use names as database keys, never use old-year records.
export function project({meta,header,raw,library,libraryMeta,studentId,officialNames={},now=Date.now()}){
 const year=context(meta,header);check(idOK(studentId)&&own(raw.students,studentId),'UNKNOWN_STUDENT');
 const s=raw.students[studentId];check(s.studentId===studentId&&s.schoolYear===year&&s.status==='active'&&/^[456][A-Z]+$/.test(s.className)&&typeof s.nameEn==='string'&&s.nameEn.trim(),'STUDENT_NOT_ELIGIBLE');
 const y=decodeEventYear({...raw,schoolYear:year,readOnly:false});
 // Only this student's live entries enter analysis. Decoder validates structure and ignores deleted entries.
 y.competition_records=Object.fromEntries(entries(y.competition_records).filter(([,r])=>r.studentId===studentId));
 for(const [,r] of entries(y.competition_records)){const event=raw.competition_events?.[r.eventId],p=raw.competition_projects?.[r.eventId]?.[r.projectId];check(event?.active===true&&p?.active===true&&r.competitionName===event.name&&r.date===event.date&&r.category===event.category&&r.level===event.level&&r.org===event.org,'COMPETITION_CATALOG_MISMATCH');}
 const {scores}=analysis(y), review=pglReview(y).rows, issues=[],activity=[];
 for(const [i,cat] of cats.entries()){
  const matches=entries(raw.memberships).filter(([,m])=>m.studentId===studentId&&m.category===cat&&m.active===true);
  const slot=raw.member_slots?.[studentId]?.[cat];
  const bad=()=>{issues.push({category:cat,reason:'MEMBER_INDEX_MISMATCH'});};
  if(matches.length!==1){issues.push({category:cat,reason:matches.length?'DUPLICATE_MEMBERSHIP':'NO_ACTIVE_MEMBERSHIP'});continue;}
  const [mid,m]=matches[0],g=raw.groups?.[m.groupId];
  if(!slot||slot.studentId!==studentId||slot.schoolYear!==year||slot.category!==cat||slot.membershipId!==mid||m.membershipId!==mid||m.schoolYear!==year||!g||g.id!==m.groupId||g.schoolYear!==year||g.active!==true||g.category!==cat||grade(g.year)!==grade(s.className)||typeof m.jawatan!=='string'||!m.jawatan.trim()){bad();continue;}
  const label=own(officialNames,m.groupId)?officialNames[m.groupId]:null;
  if(typeof label!=='string'||!label.trim()||label.length>250)issues.push({category:cat,reason:'OFFICIAL_ACTIVITY_NAME_UNVERIFIED'});
  let present=0,recorded=0;
  for(const [date,cells] of entries(raw.attendance?.[m.groupId])){
   if(!own(cells,mid))continue;
   const e=cells[mid];check(/^\d{4}-\d{2}-\d{2}$/.test(date)&&date.startsWith(year+'-')&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date&&['present','absent','clear'].includes(e?.state),'INVALID_ATTENDANCE');
   if(e.state!=='clear')recorded++;if(e.state==='present')present++;
  }
  const score=scores[studentId+'~'+i];
  const reminder=review.find(r=>r.category===categories[i]);
  if(entries(raw.memberships).some(([,h])=>h.studentId===studentId&&h.category===cat&&h.active===false))issues.push({category:cat,reason:'TRANSFER_ATTENDANCE_REVIEW_REQUIRED'});
  activity.push({category:cat,groupId:g.id,activityName:g.name,officialName:label,jawatan:m.jawatan,present,recorded,attendanceForPortal:attendanceScore(present).portalCount,attendanceMark:attendanceScore(present).mark,attendanceRemaining:attendanceScore(present).remaining,pgl:score?.pgl??'-',m_pgl:score?.m_pgl??0,pcp:score?.pcp??'-',m_pcp:score?.m_pcp??0,reminder:reminder?{highestLevel:reminder.extension.level,highestLevelMark:reminder.extension.mark,highestMark:reminder.best.mark,difference:reminder.difference}:null});
 }
 let nilam=null;const d=library?.data;
 if(libraryMeta?.activeYear!==year||libraryMeta?.nilamReady!==true||libraryMeta?.syncLock||(libraryMeta?.nilamMode??'legacy')!=='legacy'||library?.id!==studentId||d?.masterYear!==year||d?.masterRevision!==meta.masterRevision||d?.className!==s.className||d?.nameEn!==s.nameEn||d?.nameCn!==(s.nameCn??'')||!Number.isSafeInteger(d?.lifetimeTotal)||d.lifetimeTotal<0)issues.push({category:'NILAM',reason:'LIBRARY_SYNC_OR_TOTAL_REVIEW_REQUIRED'});
 else nilam={lifetimeTotal:d.lifetimeTotal,stars:stars(d.lifetimeTotal)};
 return {format:'pajsk-review-v1',year,epoch:meta.epoch,masterRevision:meta.masterRevision,createdAt:now,expiresAt:now+300000,student:{id:studentId,name:s.nameEn,className:s.className},activity,nilam,issues,mode:'REVIEW_ONLY'};
}
// Read-only with explicit recheck of year + both authorizations. Independent reads are not an atomic cross-project snapshot.
export function createReader({read,readLibrary,readLibraryMeta,verify,now=Date.now}){
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 async function start(){await verify();const meta=await read('academic_meta/current');check(Number.isInteger(meta?.activeYear)&&meta.activeYear>=2027&&meta.activeYear<=2099,'INVALID_YEAR');const b=`academic_years/${meta.activeYear}`,header=await read(b+'/header');context(meta,header);return {meta,header,b};}
 async function finish({meta,header,b}){const [m,h]=await Promise.all([read('academic_meta/current'),read(b+'/header')]);check(eq(meta,m)&&eq(header,h),'YEAR_OR_MASTER_CHANGED_RELOAD');await verify();}
 return {verify,async roster(){const c=await start(),s=await read(c.b+'/students');await finish(c);return {year:c.meta.activeYear,students:entries(s).filter(([id,v])=>idOK(id)&&v.studentId===id&&v.schoolYear===c.meta.activeYear&&v.status==='active'&&/^[456][A-Z]+$/.test(v.className)).map(([id,v])=>({id,name:v.nameEn,className:v.className}))};},async preview(studentId,expectedYear){check(idOK(studentId),'INVALID_STUDENT_ID');const c=await start();check(c.meta.activeYear===expectedYear,'STALE_YEAR');const keys=['students','groups','memberships','member_slots','attendance','competition_events','competition_projects','competition_entries','competition_records'];const [vals,library,libraryMeta]=await Promise.all([Promise.all(keys.map(k=>read(c.b+'/'+k))),readLibrary(studentId),readLibraryMeta()]);const raw=Object.fromEntries(keys.map((k,i)=>[k,vals[i]]));const p=project({...c,raw,library,libraryMeta,studentId,now:now()});await finish(c);return p;}};
}
