import {KEYS,same} from './library-core.mjs';
import {indexPreview} from './nilam-safe.mjs';
const must=(x,m)=>{if(!x)throw Error(m)};
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000;
const total=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000;
const idOK=s=>typeof s==='string'&&/^[A-Z0-9_-]{1,100}$/.test(s);
const clsOK=s=>typeof s==='string'&&/^([1-6][A-Z]+|PRA[A-Z ]*)$/.test(s);
const yearOK=y=>Number.isInteger(y)&&y>=2027&&y<=2099;
const monthOK=(m,y)=>typeof m==='string'&&new RegExp('^'+y+'-(0[1-9]|1[0-2])$').test(m);
const keysOnly=(o,ks)=>o&&typeof o==='object'&&!Array.isArray(o)&&same(Object.keys(o).sort(),[...ks].sort());
const sumLegacy=r=>KEYS.slice(0,4).reduce((a,k)=>a+(r?.[k]??0),0);
const legacyValid=r=>keysOnly(r,KEYS)&&KEYS.every(k=>count(r[k]));
export const MATERIAL=['m1','m2','m3','m4','m5','m6'], DETAIL=['d1','d2','d3','d4','d5','d6'], SLOTS=[...MATERIAL,...DETAIL];
const labelOK=s=>typeof s==='string'&&s.length<=60&&s===s.trim()&&!/[\x00-\x1f\x7f]/.test(s);
export function configPreset(mode,year){const labels=Object.fromEntries(SLOTS.map(k=>[k,'']));if(mode==='count')labels.m1='Jumlah bahan bacaan';else if(mode==='science')Object.assign(labels,{m1:'Fiksyen',m2:'Bukan fiksyen',m3:'Digital (bulanan)',m4:'Bukan buku',d1:'BM',d2:'BI',d3:'AINS',d4:'Lain-lain'});else if(mode==='detail')Object.assign(labels,{m1:'Fiksyen',m2:'Bukan fiksyen',m3:'Digital (bulanan)',m4:'Bukan buku',d1:'BM',d2:'BI',d3:'Bahasa Cina',d4:'Bahasa Tamil',d5:'Lain-lain'});else throw Error('UNKNOWN_PRESET');return validateConfig({year,version:1,labels});}
export function validateConfig(c){must(keysOnly(c,['year','version','labels'])&&yearOK(c.year)&&c.version===1&&keysOnly(c.labels,SLOTS)&&SLOTS.every(k=>labelOK(c.labels[k]))&&MATERIAL.some(k=>c.labels[k]),'INVALID_SCHEMA');const names=SLOTS.map(k=>c.labels[k].normalize('NFKC').toLocaleLowerCase()).filter(Boolean);must(new Set(names).size===names.length,'DUPLICATE_LABEL');return structuredClone(c);}
export function customRow(config,values){const c=validateConfig(config);must(values&&typeof values==='object'&&!Array.isArray(values)&&Object.keys(values).every(k=>SLOTS.includes(k)&&c.labels[k]),'UNKNOWN_OR_DISABLED_FIELD');const counts=Object.fromEntries(SLOTS.map(k=>[k,c.labels[k]?values[k]:0]));must(SLOTS.every(k=>count(counts[k])),'INVALID_COUNT');return {counts,total:MATERIAL.reduce((a,k)=>a+counts[k],0),details:DETAIL.reduce((a,k)=>a+counts[k],0)};}
export function customPlan({config,meta,student,sid,month,old,expectedRevision,values}){const c=validateConfig(config);must(meta?.activeYear===c.year&&meta?.nilamReady===true&&meta?.nilamMode==='custom'&&monthOK(month,c.year),'CUSTOM_NOT_ACTIVE');must(idOK(sid)&&student?.masterYear===c.year&&student.status!=='inactive'&&clsOK(student.className)&&Number.isSafeInteger(student.masterRevision)&&student.masterRevision>=1,'ROSTER_CHANGED');must(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0&&expectedRevision===(old?.revision??0),'STALE_ROW');must(!old||old.sid===sid&&old.month===month&&old.year===c.year&&old.className===student.className&&old.schemaVersion===1,'OLD_ROW_REQUIRES_REVIEW');const {counts}=customRow(c,values);return {sid,year:c.year,month,className:student.className,schemaVersion:1,masterRevision:student.masterRevision,revision:expectedRevision+1,counts};}
export function summarizeCustom(config,rows){const c=validateConfig(config),seen=new Set(),byStudent={},byClass={},byMonth={},byField=Object.fromEntries(SLOTS.map(k=>[k,0]));let grand=0;for(const r of rows){must(idOK(r.sid)&&clsOK(r.className)&&r.year===c.year&&monthOK(r.month,c.year)&&r.schemaVersion===1&&keysOnly(r.counts,SLOTS)&&SLOTS.every(k=>count(r.counts[k])&&(c.labels[k]||r.counts[k]===0)),'INVALID_STORED_ROW');const key=r.sid+'_'+r.month;must(!seen.has(key),'DUPLICATE_STUDENT_MONTH');seen.add(key);const t=MATERIAL.reduce((a,k)=>a+r.counts[k],0);grand+=t;byStudent[r.sid]=(byStudent[r.sid]??0)+t;byClass[r.className]=(byClass[r.className]??0)+t;byMonth[r.month]=(byMonth[r.month]??0)+t;for(const k of SLOTS)byField[k]+=r.counts[k];}return {grand,byStudent,byClass,byMonth,byField};}
// Read-only reconciliation: validate every existing month first; never mutate the supplied snapshot.
// Original anchor = nearest populated CLASS month, not nearest month of each pupil.
export function legacyRepairPreview({year,cls,month,sid,input,rawDocs,netDocs,students}){
 must(yearOK(year)&&clsOK(cls)&&monthOK(month,year)&&idOK(sid)&&legacyValid(input),'INVALID_REPAIR');
 const check=indexPreview({year,cls,rawDocs,netDocs});must(check.ready,'EXISTING_MONTHS_REQUIRE_REVIEW');must(check.index.latest&&month<check.index.latest,'USE_NORMAL_LATEST_MONTH_SAVE');
 const st=students[sid];must(st?.className===cls&&st.masterYear===year&&st.status!=='inactive','TARGET_ROSTER_CHANGED');
 const raw=structuredClone(rawDocs),net=structuredClone(netDocs),id=cls+'_'+month;
 raw[id]??={class:cls,month,revision:0,records:{}};net[id]??={class:cls,month,revision:0,records:{}};raw[id].records[sid]=structuredClone(input);
 let previous={},changes=[],deltas=new Map();const months=[];
 for(let i=1;i<=12;i++){const m=year+'-'+String(i).padStart(2,'0'),k=cls+'_'+m,r=raw[k],n=net[k];if(!r)continue;months.push(m);let dirty=false;
  for(const [s,v] of Object.entries(r.records)){must(idOK(s)&&legacyValid(v),'INVALID_LEGACY_ROW');const anchor=previous[s]?.digital??0;must(v.digital>=anchor,'DIGITAL_REVERSED: '+m+' '+s);const next={...v,digital:v.digital-anchor};next.lain=sumLegacy(next)-next.bm-next.bi;must(count(next.lain),'LANGUAGE_EXCEEDS_RECALCULATED_TOTAL: '+m+' '+s);const old=netDocs[k]?.records?.[s]??null;const rawOld=rawDocs[k]?.records?.[s]??null;const rawNext={...v,lain:next.lain};if(!same(old,next)||!same(rawOld,rawNext)){dirty=true;const delta=sumLegacy(next)-sumLegacy(old);deltas.set(s,(deltas.get(s)??0)+delta);changes.push({month:m,sid:s,anchor,oldNet:old?sumLegacy(old):0,newNet:sumLegacy(next),delta,oldDigital:old?.digital??null,newDigital:next.digital});r.records[s]=rawNext;n.records[s]=next;}}
  if(dirty){const revision=(rawDocs[k]?.revision??0)+1;r.revision=n.revision=revision;delete r.lastStudentId;delete n.lastStudentId;}previous=r.records;
 }
 const totals=[];for(const [s,delta] of deltas){const p=students[s];must(p&&p.masterYear===year&&total(p.yearlyTotals?.[year]??0)&&total(p.lifetimeTotal??0),'MISSING_OR_INVALID_STUDENT_TOTAL: '+s);const oldYear=p.yearlyTotals?.[year]??0,oldLife=p.lifetimeTotal??0;must(total(oldYear+delta)&&total(oldLife+delta),'TOTAL_REQUIRES_REVIEW: '+s);totals.push({sid:s,oldYear,newYear:oldYear+delta,oldLife,newLife:oldLife+delta,delta,otherClass:p.className!==cls});}
 return {previewOnly:true,changes,totals,index:{class:cls,year,latest:months.at(-1),prior:months.at(-2)??''}};
}
