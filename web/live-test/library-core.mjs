// Pure planning functions. Original six collections retained; loanSlots is an auxiliary index.
export const KEYS=['digital','bukanBuku','fiksyen','bukanFiksyen','bm','bi','lain'];
const material=KEYS.slice(0,4), own=(o,k)=>Object.hasOwn(o??{},k);
const fail=m=>{throw new Error(m)};
const idOK=v=>typeof v==='string'&&v.length>0&&v.length<=200&&!v.includes('/');
const count=v=>Number.isSafeInteger(v)&&v>=0&&v<=10000000;
const n=v=>v===undefined?0:count(v)?v:fail('INVALID_COUNT');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export function loanIndexPreview(books,students){const slots={},issues=[];for(const [bookId,b] of Object.entries(books)){if(b.status!=='out')continue;const sid=b.borrowerId;if(!idOK(sid)||!own(students,sid)){issues.push({bookId,reason:'BORROWER_UNRESOLVED'});continue;}if(own(slots,sid)){issues.push({bookId,other:slots[sid].bookId,reason:'MULTIPLE_OPEN_LOANS'});continue;}slots[sid]={bookId};}return {slots,issues,ready:!issues.length};}
export function loanPlan({bookId,studentId,book,student,slot,action,expected,eventId,dateStr,timeStr,dueDate}){
 if(!idOK(bookId)||!idOK(studentId)||!idOK(eventId)||!book||!student)fail('INVALID_IDENTITY');
 if(!same(expected,{status:book.status,borrowerId:book.borrowerId??null,lastLoanEvent:book.lastLoanEvent??null}))fail('STALE_BOOK');
 const name=`${student.nameEn||''} ${student.nameCn?`(${student.nameCn})`:''}`.trim()||'未知', cls=student.className;
 if(action==='borrow'){
  if(book.status!=='in'||slot||book.borrowerId!=null)fail('ALREADY_BORROWED');
  if(!cls||cls==='未分配'||student.status==='inactive')fail('INACTIVE_BORROWER');
  if(book.accessLevel==='teacher_only'&&cls!=='TEACHER')fail('TEACHER_ONLY');
  return {book:{status:'out',borrowerId:studentId,borrowerName:name,borrowerClass:cls,borrowDate:dateStr,dueDate,lastLoanEvent:eventId},slot:{bookId},log:{bookId,bookTitle:book.title,action,studentId,studentName:name,className:cls,dateStr,timeStr}};
 }
 if(action!=='return'||book.status!=='out'||book.borrowerId!==studentId||slot?.bookId!==bookId)fail('LOAN_INDEX_MISMATCH');
 return {book:{status:'in',borrowerId:null,borrowerName:null,borrowerClass:null,borrowDate:null,dueDate:null,lastLoanEvent:eventId},slot:null,log:{bookId,bookTitle:book.title,action,studentId,studentName:book.borrowerName??name,className:book.borrowerClass??cls,dateStr,timeStr}};
}
const sum=r=>material.reduce((s,k)=>s+n(r?.[k]),0);
export function nilamPlan({month,cls,activeYear,baseline,current,inputs,students,anchors}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month.slice(0,4)!==String(activeYear))fail('HISTORICAL_MONTH');
 if(!same(baseline,current))fail('STALE_MONTH');
 const ids=Object.keys(inputs);if(!ids.length||ids.length>100)fail('CLASS_SIZE_LIMIT');
 const raw={...(current.raw?.records??{})},net={...(current.net?.records??{})},updates={};
 for(const id of ids){const s=students[id];if(!idOK(id)||!s||s.className!==cls||s.masterYear!==Number(activeYear))fail('ROSTER_CHANGED');const input=inputs[id];if(!input||Object.keys(input).length!==KEYS.length||!KEYS.every(k=>own(input,k)&&count(input[k])))fail('INVALID_INPUT');
  // Keep the existing digital cumulative-anchor and delta formula. Preserve rows of former members.
  const next={...input,digital:Math.max(0,input.digital-n(anchors[id]))};const delta=sum(next)-sum(net[id]);const yt={...(s.yearlyTotals??{})};const year=String(activeYear);const oldYear=n(yt[year]),oldLife=n(s.lifetimeTotal);yt[year]=Math.max(0,oldYear+delta);
  raw[id]={...input};net[id]=next;updates[id]={yearlyTotals:yt,lifetimeTotal:Math.max(0,oldLife+delta)};
 }
 return {raw:{class:cls,month,records:raw},net:{class:cls,month,records:net},updates};
}
