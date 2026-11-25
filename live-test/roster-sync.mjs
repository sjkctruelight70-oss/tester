// Competition master -> library student identity only. No production connection.
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const idOf=v=>String(v??'').trim().toUpperCase();
const validId=v=>typeof v==='string'&&/^[A-Z0-9_-]{1,100}$/.test(v)&&!['__PROTO__','CONSTRUCTOR','PROTOTYPE'].includes(v);
const identity=d=>d===null?null:{nameEn:d.nameEn??'',nameCn:d.nameCn??'',className:d.className??'',masterYear:d.masterYear??null,masterRevision:d.masterRevision??null};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function sourceVersion(year,revision){if(!Number.isInteger(year)||year<2027||year>2099||!Number.isSafeInteger(revision)||revision<1)throw Error('无效学年或主档版本');}
export function planRoster({year,revision,students},library){
 sourceVersion(year,revision);if(!students||typeof students!=='object'||Array.isArray(students)||!Object.keys(students).length||!Array.isArray(library))throw Error('需要有效主档及完整图书馆快照');
 const issues=[],ops=[],unchanged=[],unmatched=[],seen=new Set(),docs=new Map();
 for(const d of library){if(!d||typeof d.id!=='string'||!d.id||!d.data||typeof d.data!=='object'||docs.has(idOf(d.id))){issues.push({reason:'图书馆编号无效或标准化后重复',id:d?.id});continue;}docs.set(idOf(d.id),d);}
 for(const [key,s] of Object.entries(students)){
  if(!s||!validId(key)||key!==s.studentId||s.schoolYear!==year||s.status!=='active'||typeof s.nameEn!=='string'||!s.nameEn.trim()||typeof s.nameCn!=='string'||! /^(?:[1-6][A-Z]+|PRA[A-Z ]*)$/.test(s.className)){issues.push({id:key,reason:'主档字段无效'});continue;}
  if(seen.has(key)){issues.push({id:key,reason:'重复学号'});continue;}seen.add(key);
  const old=docs.get(key);if(old&&(old.id!==key||old.data.className==='TEACHER')){issues.push({id:key,reason:'现有证件号格式不同或与教职工冲突；不自动改 ID'});continue;}
  const before=identity(old?.data??null), after={nameEn:s.nameEn.trim(),nameCn:s.nameCn.trim(),className:s.className,masterYear:year,masterRevision:revision};
  if(before&&((before.masterYear!==null&&(!Number.isInteger(before.masterYear)||!Number.isSafeInteger(before.masterRevision)))||(before.masterYear===null&&before.masterRevision!==null))){issues.push({id:key,reason:'已有同步版本格式无效'});continue;}
  if(before&&(before.masterYear>year||(before.masterYear===year&&before.masterRevision>revision))){issues.push({id:key,reason:'旧主档版本，禁止覆盖'});continue;}
  if(before&&before.masterYear===year&&before.masterRevision===revision&&!eq(before,after)){issues.push({id:key,reason:'同版本内容冲突'});continue;}
  if(eq(before,after))unchanged.push(key);else ops.push({id:key,before,after,kind:old?'update':'create'});
 }
 for(const [key,d] of docs)if(!seen.has(key)&&d.data.className!=='TEACHER')unmatched.push({id:d.id,className:d.data.className??''});
 return {year,revision,ok:issues.length===0,issues,ops,unchanged,unmatched};
}
// Adapter transaction must re-read the identity in the transaction before writing.
export function decideWrite(op,current){
 if(!validId(op.id)||!op.after||!op.before&&op.kind!=='create'||op.before&&op.kind!=='update')throw Error('无效同步操作');
 const now=identity(current);if(eq(now,op.after))return {status:'unchanged'};
 if(!eq(now,op.before))return {status:'conflict'};
 if(current?.className==='TEACHER')return {status:'conflict'};
 return {status:'write',fields:{...op.after}};
}
export async function executePlan(plan,adapter,{confirmed=false}={}){
 if(!confirmed||!plan.ok||plan.issues.length)throw Error('预览未通过或未确认');
 const results=[];for(const op of plan.ops){try{results.push({id:op.id,status:await adapter.apply(op)});}catch(e){results.push({id:op.id,status:'failed',error:String(e.code||e.message||e)});}}
 return {year:plan.year,revision:plan.revision,results,complete:results.every(r=>['written','unchanged'].includes(r.status))};
}
