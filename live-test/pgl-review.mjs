import {analysis,record,categories} from './competition.mjs';
import {POINT_SYSTEM,levelPriority} from './legacy-rates.mjs';
const order=(a,b)=>a<b?-1:a>b?1:0;
// Read-only comparison. No changes to extension projection or annual snapshots.
export function pglReview(y,{className='',category='',query=''}={}){
 if(!y||y.schoolYear<2027||y.readOnly)throw Error('CURRENT_YEAR_ONLY');
 const {scores,sources}=analysis(y), best=new Map();
 const source=(id,r)=>({recordId:id,competitionName:r.competitionName,date:r.date,level:r.level,role:r.role,mark:POINT_SYSTEM.PENGLIBATAN[r.level][r.role]});
 for(const [id,raw] of Object.entries(y.competition_records??{}).sort(([a],[b])=>order(a,b))){
  const r=record(y,raw.studentId,raw,{active:false});
  if(!r.isPAJSK||! /^[456]/.test(r.studentClass)||y.students[r.studentId].status!=='active')continue;
  const k=`${r.studentId}~${categories.indexOf(r.category)}`, c=source(id,r), prev=best.get(k);
  if(!prev||c.mark>prev.mark||(c.mark===prev.mark&&levelPriority(c.level)>levelPriority(prev.level)))best.set(k,c);
 }
 const rows=[];
 for(const [k,b] of best){const ext=scores[k];if(!ext||b.mark<=ext.m_pgl)continue;
  const s=y.students[ext.studentId], a=source(sources[k].pgl,record(y,ext.studentId,y.competition_records[sources[k].pgl],{active:false}));
  if(className&&s.className!==className||category&&ext.kategori!==category)continue;
  const name=[s.nameEn,s.nameCn].filter(Boolean).join(' ');
  if(query&& ![s.studentId,name,s.className].join(' ').toUpperCase().includes(String(query).trim().toUpperCase()))continue;
  rows.push({key:k,schoolYear:y.schoolYear,studentId:s.studentId,className:s.className,name,category:ext.kategori,extension:a,best:b,difference:b.mark-a.mark,achievement:ext.pcp,achievementMark:ext.m_pcp,review:'VERIFY_AKTIVITI_TAMBAHAN'});
 }
 rows.sort((a,b)=>a.className.localeCompare(b.className,undefined,{numeric:true})||a.name.localeCompare(b.name)||order(a.studentId,b.studentId)||order(a.category,b.category));
 return {schoolYear:y.schoolYear,students:new Set(rows.map(r=>r.studentId)).size,count:rows.length,rows};
}
export function exportPglReview(y,filters){return [['TAHUN','NO. MURID','KELAS','NAMA','KATEGORI','PERINGKAT EXTENSION','PGL EXTENSION','MARKAH EXTENSION','PERTANDINGAN EXTENSION','TARIKH EXTENSION','PERINGKAT MARKAH TERTINGGI','PGL MARKAH TERTINGGI','MARKAH TERTINGGI','PERTANDINGAN MARKAH TERTINGGI','TARIKH','PERBEZAAN (SEMAKAN SAHAJA)','PENCAPAIAN','MARKAH PCP','TINDAKAN'],...pglReview(y,filters).rows.map(r=>[r.schoolYear,r.studentId,r.className,r.name,r.category,r.extension.level,`P${r.extension.role}`,r.extension.mark,r.extension.competitionName,r.extension.date,r.best.level,`P${r.best.role}`,r.best.mark,r.best.competitionName,r.best.date,r.difference,r.achievement,r.achievementMark,'Semak kelayakan Aktiviti Tambahan; jangan tambah markah secara terus'])];}
