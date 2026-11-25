// Candidate runner: no network, no credential handling, no portal navigation or save.
// The integration must supply a trusted live authorization/data bridge and verified portal identity.
import {POINT_SYSTEM} from './legacy-rates.mjs';
const require=(x,m)=>{if(!x)throw Error(m)};
const tabs={KELAB:'Kelab & Persatuan',UNIFORM:'Badan Beruniform',SUKAN:'Sukan & Permainan',NILAM:'Ekstra Kurikulum'};
const roles={'AJK':'AHLI JAWATANKUASA','PEN. SETIAUSAHA':'NAIB SETIAUSAHA','PENOLONG SETIAUSAHA':'NAIB SETIAUSAHA','PENOLONG BENDAHARI':'NAIB BENDAHARI'};
const norm=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim().toUpperCase();
const exact=(s,t)=>norm(s)===norm(t);
const validId=s=>typeof s==='string'&&/^[A-Z0-9_-]{1,100}$/.test(s)&&!['__PROTO__','CONSTRUCTOR','PROTOTYPE'].includes(s);
const int=n=>Number.isSafeInteger(n)&&n>=0;
const star=n=>n>=720?5:n>=576?4:n>=432?3:n>=288?2:n>=144?1:0;
function score(v,mark,section){require(typeof v==='string'&&int(mark),'INVALID_SCORE');if(v==='-'){require(mark===0,'INVALID_SCORE');return null;}const m=/^([A-Z/]+) \(([A-Z0-9 ]+)\)$/.exec(v);require(m,'INVALID_SCORE');const [,level,rank]=m;const t=POINT_SYSTEM[section]?.[level];const key=section==='PENGLIBATAN'?(/^P[123]$/.test(rank)?rank.slice(1):''):rank;require(t&&Object.hasOwn(t,key)&&t[key]===mark&&mark>0,'INVALID_SCORE');const col=section==='PENGLIBATAN'?Number(key):({JOHAN:1,EMAS:1,'NAIB JOHAN':2,PERAK:2,KETIGA:3,GANGSA:3,KEEMPAT:4,KELIMA:5})[rank];return {level,rank,col};}
export function plan(p,identity,category,now=Date.now()){
 require(p?.format==='pajsk-review-v1'&&p.mode==='REVIEW_ONLY'&&Number.isSafeInteger(p.year)&&p.year>=2027&&p.year<=2099&&int(p.epoch)&&int(p.masterRevision)&&p.masterRevision>0&&int(p.createdAt)&&p.expiresAt===p.createdAt+300000&&p.createdAt<=now&&now<p.expiresAt,'PREVIEW_INVALID_OR_EXPIRED');
 require(Object.hasOwn(tabs,category)&&identity?.tab===tabs[category]&&validId(identity.studentId)&&p.student?.id===identity.studentId&&p.year===identity.year&&p.student.className===identity.className&&/^[456][A-Z]+$/.test(identity.className)&&typeof identity.name==='string'&&identity.name.trim()&&exact(p.student.name,identity.name),'PORTAL_IDENTITY_OR_TAB_MISMATCH');
 require(Array.isArray(p.issues)&&p.issues.every(i=>i&&['KELAB','UNIFORM','SUKAN','NILAM'].includes(i.category)&&typeof i.reason==='string')&&!p.issues.some(i=>i.category===category),'CATEGORY_REQUIRES_REVIEW');
 require(Array.isArray(p.activity)&&p.activity.length<=3&&p.activity.every(a=>a&&['KELAB','UNIFORM','SUKAN'].includes(a.category))&&new Set(p.activity.map(a=>a.category)).size===p.activity.length,'INVALID_ACTIVITY');
 if(category==='NILAM'){const n=p.nilam;require(n&&int(n.lifetimeTotal)&&n.stars===star(n.lifetimeTotal),'NILAM_NOT_VERIFIED');return [{field:'Program NILAM',kind:'stars',value:n.stars}];}
 const a=p.activity.find(a=>a.category===category);require(a&&typeof a.officialName==='string'&&a.officialName.trim()&&a.officialName.length<=250&&typeof a.jawatan==='string'&&a.jawatan.trim()&&int(a.present)&&int(a.recorded)&&a.present<=a.recorded&&a.attendanceForPortal===Math.min(a.present,12),'ACTIVITY_NOT_VERIFIED');
 return [{field:'AKTIVITI KOKURIKULUM',kind:'select',value:norm(a.officialName)},{field:'JAWATAN',kind:'select',value:roles[norm(a.jawatan)]??norm(a.jawatan)},{field:'PELIBATAN',kind:'table',value:score(a.pgl,a.m_pgl,'PENGLIBATAN')},{field:'TAHAP PENCAPAIAN',kind:'table',value:score(a.pcp,a.m_pcp,'PENCAPAIAN')},{field:'KEHADIRAN',kind:'attendance',value:a.attendanceForPortal}];
}
export function uniqueExact(options,value){const matches=options.filter(x=>exact(x.label,value));require(matches.length===1,'OPTION_MISSING_OR_AMBIGUOUS');return matches[0];}
// Trusted, injected adapter only. A downloaded JSON file is not proof of authorization.
// Preflight all fields before modifying anything; re-check identity and permission before each action, then re-read source before marking draft verified.
export function createRunner({verify,readFresh,identity,adapter,now=Date.now}){let busy=false;return async function run(category){require(!busy,'RUN_ALREADY_ACTIVE');busy=true;let applied=0,attempted=0;try{
 await verify();const id=await identity();const p=await readFresh(id.studentId,id.year);const steps=plan(p,id,category,now());
 const fingerprint=JSON.stringify([p.year,p.epoch,p.masterRevision,p.student,steps]);
 async function guard(){await verify();const current=await identity();require(JSON.stringify(current)===JSON.stringify(id),'PORTAL_CHANGED');require(now()<p.expiresAt,'PREVIEW_INVALID_OR_EXPIRED');}
 const prepared=[];for(const step of steps){await guard();prepared.push(await adapter.prepare(step));}
 for(let i=0;i<steps.length;i++){await guard();attempted++;await adapter.apply(prepared[i]);await guard();require(await adapter.check(prepared[i]),'FIELD_NOT_VERIFIED');applied++;}
 await guard();for(const x of prepared)require(await adapter.check(x),'FIELD_NOT_VERIFIED');const latest=await readFresh(id.studentId,id.year);await guard();require(JSON.stringify([latest.year,latest.epoch,latest.masterRevision,latest.student,plan(latest,id,category,now())])===fingerprint,'SOURCE_CHANGED_RELOAD');
 return {status:'DRAFT_VERIFIED_NOT_SAVED',applied,attempted,manualFields:category==='NILAM'?['KHIDMAT MASYARAKAT']:['KOMITMEN','KHIDMAT SUMBANGAN']};
 }catch(e){return {status:'STOPPED_NOT_SAVED',applied,attempted,reason:/^[A-Z_]+$/.test(e?.message)?e.message:'ADAPTER_OR_NETWORK_ERROR'};}finally{busy=false;}};}
