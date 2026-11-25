import {POINT_SYSTEM,getLegacyIncentiveAmount,getIncentiveAmount,levelPriority} from './legacy-rates.mjs';
export const categories=['KELAB & PERSATUAN','BADAN BERUNIFORM','SUKAN & PERMAINAN'];
const own=(o,k)=>Object.hasOwn(o??{},k), entries=o=>Object.entries(o??{}), clone=structuredClone;
const ok=(x,m)=>{if(!x)throw Error(m)};
const norm=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const key=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x.toLowerCase());
const dateOK=(d,y)=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number(d.slice(0,4))===y&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const ranks=['JOHAN','NAIB JOHAN','KETIGA','KEEMPAT','KELIMA','EMAS','PERAK','GANGSA','PENYERTAAN','EXCELLENT AWARD'];
const flags=['isOnline','isGroup','isMedalSystem','isPAJSK'];
function student(y,id,active=false){ok(key(id)&&own(y.students,id),'UNKNOWN_STUDENT');const s=y.students[id];ok(s.studentId===id&&s.schoolYear===y.schoolYear&&(!active||s.status==='active'),'STUDENT_IDENTITY');return s;}
function writable(y,year){ok(y?.schoolYear===year&&Number.isInteger(year)&&year>=2027&&!y.readOnly,'READ_ONLY_YEAR');}
export function schoolRank(n){ok(Number.isInteger(n)&&n>=1&&n<=99,'INVALID_ACTUAL_RANK');return {actualRank:n,rank:['JOHAN','NAIB JOHAN','KETIGA','KEEMPAT'][n-1]??'KELIMA',reportAward:['JOHAN','NAIB JOHAN','KETIGA'][n-1]??'EXCELLENT AWARD',isPAJSK:true};}
export function identity(r){return JSON.stringify(r.eventId&&r.projectId?[r.schoolYear,r.eventId,r.projectId,r.studentId]:[r.schoolYear,r.studentId,r.category,norm(r.competitionName),r.date]);}
export function record(y,id,input,{active=true}={}){const s=student(y,id,active);const r={studentId:id,schoolYear:y.schoolYear,studentName:[s.nameEn,s.nameCn].filter(Boolean).join(' '),studentClass:s.className,competitionName:norm(input.competitionName),category:norm(input.category),level:norm(input.level),rank:norm(input.rank),role:String(input.role??''),date:input.date,org:String(input.org??'').trim()};ok(r.competitionName&&r.competitionName.length<=250&&categories.includes(r.category)&&own(POINT_SYSTEM.PENGLIBATAN,r.level)&&ranks.includes(r.rank)&&['1','2','3'].includes(r.role)&&dateOK(r.date,y.schoolYear),'INVALID_RECORD');for(const k of flags){ok(typeof input[k]==='boolean','INVALID_FLAG');r[k]=input[k];}if(input.actualRank!=null){ok(r.level==='SEKOLAH'&&!r.isMedalSystem,'RANK_MODE_MISMATCH');const expected=schoolRank(input.actualRank);ok(r.rank===expected.rank&&input.reportAward===expected.reportAward,'RANK_AWARD_MISMATCH');r.actualRank=expected.actualRank;r.reportAward=expected.reportAward;}if(input.eventId!==undefined||input.projectId!==undefined){ok(key(input.eventId)&&key(input.projectId),'INVALID_EVENT_PROJECT');r.eventId=input.eventId;r.projectId=input.projectId;r.projectName=String(input.projectName??'');}return r;}
function validateStored(y,r){ok(r.schoolYear===y.schoolYear,'WRONG_YEAR');return record(y,r.studentId,r,{active:false});}
const baseFields=['studentId','schoolYear','competitionName','category','level','rank','role','date','org',...flags,'actualRank','reportAward'];
function fingerprint(r){return JSON.stringify(baseFields.map(k=>r?.[k]??null));}
export function planImport(y,year,rows,{internal=false}={}){writable(y,year);ok(Array.isArray(rows),'INVALID_ROWS');const existing=new Set(entries(y.competition_records).map(([,r])=>identity(validateStored(y,r))));const seen=new Set();return rows.map((x,i)=>{try{ok(typeof x.studentId==='string','ID_MUST_BE_TEXT');const id=x.studentId.trim().toUpperCase(),s=student(y,id,true);ok(norm(x.className)===norm(s.className),'CLASS_MISMATCH');if(x.nameEn)ok([norm(s.nameEn),norm([s.nameEn,s.nameCn].filter(Boolean).join(' '))].includes(norm(x.nameEn)),'NAME_MISMATCH');if(x.nameCn)ok(norm(x.nameCn)===norm(s.nameCn),'CHINESE_NAME_MISMATCH');let input=x;if(internal){const mapped=schoolRank(x.actualRank);if(x.reportAward)ok(norm(x.reportAward)===mapped.reportAward,'REPORT_AWARD_MISMATCH');input={...x,...mapped,level:'SEKOLAH',role:'1',org:'SEKOLAH',isOnline:false,isGroup:false,isMedalSystem:false};}const r=record(y,id,input);const k=identity(r);if(existing.has(k)||seen.has(k))return {row:i+1,studentId:id,status:'duplicate',reason:'DUPLICATE_COMPETITION'};seen.add(k);return {row:i+1,studentId:id,status:'ready',record:r};}catch(e){return {row:i+1,status:'error',reason:e.message};}});}
// Compare source fields, not mutable display names. Recompute the entire derived score map on save, including deletion of stale scores.
export function applyChanges(y,year,changes){writable(y,year);ok(Array.isArray(changes)&&changes.length&&new Set(changes.map(c=>c.id)).size===changes.length,'INVALID_CHANGES');const n=clone(y);n.competition_records??={};for(const c of changes){ok(key(c.id),'INVALID_RECORD_ID');const old=own(n.competition_records,c.id)?n.competition_records[c.id]:null;ok((old===null)===(c.before==null)&&(!old||fingerprint(old)===fingerprint(c.before)&&old.revision===c.before.revision),'RECORD_CHANGED_RELOAD');if(c.after===null){ok(old,'RECORD_NOT_FOUND');delete n.competition_records[c.id];continue;}ok(c.after.schoolYear===year&&(!old||old.studentId===c.after.studentId),'IMMUTABLE_OWNER');const r=record(n,c.after.studentId,c.after,{active:!old});n.competition_records[c.id]={...r,revision:(old?.revision??0)+1};}const unique=new Set();for(const [,r] of entries(n.competition_records)){const id=identity(validateStored(n,r));ok(!unique.has(id),'DUPLICATE_COMPETITION');unique.add(id);}const result=analysis(n);n.pajsk_final_scores=result.scores;n.pajsk_score_sources=result.sources;n.pajsk_policy_version="2027-level-first-v1";return n;}
// Current-year selection: highest level first; within that level highest role score.
// Independent achievement, only records with a recognized positive achievement score.
export function analysis(y){
 if(y.readOnly||y.schoolYear<2027) return {scores:clone(y.pajsk_final_scores??{}),sources:clone(y.pajsk_score_sources??{})};
 const scores={},sources={},bestLevels={};
 for(const [rid,raw] of entries(y.competition_records).sort(([a],[b])=>a<b?-1:a>b?1:0)){
  const r=validateStored(y,raw),s=student(y,r.studentId);
  if(!r.isPAJSK||!(/^[456]/.test(s.className)))continue;
  const id=`${r.studentId}~${categories.indexOf(r.category)}`;
  const row=scores[id]??={studentId:r.studentId,schoolYear:y.schoolYear,nama:r.studentName,kelas:r.studentClass,kategori:r.category,pgl:'-',m_pgl:0,pcp:'-',m_pcp:0,pglLevel:null,pcpLevel:null};
  const src=sources[id]??={pgl:null,pcp:null};
  const p=POINT_SYSTEM.PENGLIBATAN[r.level][r.role]??0,a=POINT_SYSTEM.PENCAPAIAN[r.level][r.rank]??0,l=levelPriority(r.level);
  const prev=bestLevels[id]??-1;
  if(p>0&&(l>prev||(l===prev&&p>row.m_pgl))){bestLevels[id]=l;row.m_pgl=p;row.pgl=`${r.level} (P${r.role})`;row.pglLevel=r.level;src.pgl=rid;}
  if(a>row.m_pcp){row.m_pcp=a;row.pcp=`${r.level} (${r.rank})`;row.pcpLevel=r.level;src.pcp=rid;}
 }
 return {scores,sources};
}
export function exactRankComparison(r){return getIncentiveAmount(r);}
// Corrected amount drives all new-year totals; old amount retained only for audit comparison.
export function incentive(y){
 ok(!y.readOnly&&y.schoolYear>=2027,'ARCHIVED_INCENTIVE_USE_ORIGINAL_REPORT');
 const groups=new Map(),differences=[];
 for(const [id,raw] of entries(y.competition_records)){const r=validateStored(y,raw),amount=getIncentiveAmount(r),legacy=getLegacyIncentiveAmount(r);
 if(amount!==legacy)differences.push({recordId:id,studentId:r.studentId,rank:r.rank,level:r.level,legacy,comparison:amount});
 if(!amount)continue;const g=groups.get(r.studentId)??{studentId:r.studentId,name:r.studentName,className:r.studentClass,total:0,items:[]};
 g.total+=amount;g.items.push({recordId:id,competitionName:r.competitionName,rank:r.rank,level:r.level,amount});groups.set(r.studentId,g);}
 const rows=[...groups.values()];return {rows,total:rows.reduce((a,r)=>a+r.total,0),differences,settlementNeedsReview:false,policy:'exact-rank-v1'};
}
export function recordsDashboard(y,{className='',category='',query=''}={}){const rows=[],issues=[],keys=new Map();for(const [id,r] of entries(y.competition_records)){try{const v=validateStored(y,r),k=identity(v);if(keys.has(k))issues.push({recordId:id,other:keys.get(k),reason:'DUPLICATE_COMPETITION'});else keys.set(k,id);if((!className||v.studentClass===className)&&(!category||v.category===category)&&(!query||norm([v.studentId,v.studentName,v.competitionName].join(' ')).includes(norm(query))))rows.push({recordId:id,...v});}catch(e){issues.push({recordId:id,reason:e.message});}}return {count:rows.length,studentCount:new Set(rows.map(r=>r.studentId)).size,rows,issues};}
// Arrays for existing SheetJS export; all IDs stay text. No writes on dashboard reads.
export function exportMaster(y){return [['学号','NAMA MURID','KELAS','PERTANDINGAN','FORMAT','UNIT','SISTEM','PAJSK','JENIS','PENGLIBATAN','PERINGKAT','ANJURAN','PENCAPAIAN','TARIKH','TAHUN','实际名次','报告奖项'],...recordsDashboard(y).rows.map(r=>[r.studentId,r.studentName,r.studentClass,r.competitionName,r.isOnline?'ONLINE':'FIZIKAL',r.isGroup?'PASUKAN':'INDIVIDU',r.isMedalSystem?'PINGAT':'RANKING',r.isPAJSK?'YA':'TIDAK',r.category,r.role,r.level,r.org,r.rank,r.date,r.schoolYear,r.actualRank??'',r.reportAward??''])];}
export function exportAnalysis(y){return [['学号','NAMA','KELAS','KATEGORI','PGL (PERINGKAT TERTINGGI)','M','MAX PCP','M','TAHUN'],...Object.values(analysis(y).scores).map(r=>[r.studentId,r.nama,r.kelas,r.kategori,r.pgl,r.m_pgl,r.pcp,r.m_pcp,r.schoolYear])];}
export function exportIncentive(y){const a=incentive(y);return {needsReview:a.settlementNeedsReview,rows:[['学号','NAMA MURID','KELAS','PERTANDINGAN','LEVEL','PENCAPAIAN','INSENTIF (RM)'],...a.rows.flatMap(s=>[[s.studentId,s.name,s.className,'TOTAL','','',s.total],...s.items.map(r=>[s.studentId,s.name,s.className,r.competitionName,r.level,r.rank,r.amount])])],reviewRows:[['学号','Record ID','PENCAPAIAN','LEVEL','旧算法金额（审计）','修正金额'],...a.differences.map(r=>[r.studentId,r.recordId,r.rank,r.level,r.legacy,r.comparison])]};}
export function exportSchoolAwards(y){return [['学号','NAMA MURID','KELAS','PERTANDINGAN','KATEGORI','KEDUDUKAN SEBENAR','ANUGERAH UNTUK LAPORAN','PAJSK'],...recordsDashboard(y).rows.filter(r=>r.level==='SEKOLAH'&&(r.actualRank||['JOHAN','NAIB JOHAN','KETIGA','KEEMPAT','KELIMA','EXCELLENT AWARD'].includes(r.rank))).map(r=>{const n=r.actualRank??({'JOHAN':1,'NAIB JOHAN':2,'KETIGA':3,'KEEMPAT':4,'KELIMA':5})[r.rank];return [r.studentId,r.studentName,r.studentClass,r.competitionName,r.category,r.actualRank??'',r.reportAward??(n?schoolRank(n).reportAward:'EXCELLENT AWARD'),r.isPAJSK?'YA':'TIDAK'];})];}
