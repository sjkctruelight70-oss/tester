import {mountAnnual} from './annual29-panel.mjs';
// Test-only student-master controls on the existing tab. Explicit preview, confirmation and server acknowledgement.
// Do not use real students or publish draft rules. No write during loading / preview.
const root=document.getElementById('master23-root');
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const button=(label,fn)=>{const b=el('button',label);b.type='button';b.className='btn btn-blue';b.onclick=fn;return b;};
const status=el('p','Log masuk Admin / 管理员登录后预览。');status.setAttribute('role','status');
const input=el('input');input.type='file';input.accept='.xlsx';input.multiple=true;input.setAttribute('aria-label','Excel daftar murid');
const result=el('div');result.style.cssText='max-height:360px;overflow:auto';
let api=null,preview=null,serial=0,busy=false,ready=false,annualBusy=false,annual=null;
const modal=root.closest("dialog"),close=document.querySelector("#p-master-close");
async function getApi(){if(api)return api;const [{createSchoolAccess},{config},{createTestAdminWriter}]=await Promise.all([import('./school-access.mjs'),import('./test-config.mjs'),import('./firebase-admin-test.mjs')]);const access=createSchoolAccess(config);return api={access,writer:createTestAdminWriter(access)};}
function safe(e){const m=String(e?.code??e?.message??'ERROR');return /https?:|token|AIza|\?/i.test(m)?'NETWORK_OR_AUTH_ERROR':m.slice(0,160);}
const text=x=>String(x??'');
function render(p){result.replaceChildren();if(!p)return;const summary=el('p',`Tahun ${p.year} · Baharu / 新增 ${p.changes.filter(x=>!x.before).length} · Kemas kini / 更新 ${p.changes.filter(x=>x.before).length} · Tiada perubahan / 不变 ${p.unchanged.length} · Tidak disenaraikan / 未列入 ${p.notInImport.length} · Ralat / 异常 ${p.issues.length}`);result.append(summary);const table=el('table');table.className='data-table';const add=(values,head=false)=>{const tr=el('tr');for(const v of values)tr.append(el(head?'th':'td',text(v)));table.append(tr);};add(['ID / 学号','Nama asal / 原姓名','Nama baharu / 新姓名','Kelas asal / 原班','Kelas baharu / 新班','Status'],true);for(const c of p.changes)add([c.id,c.before?[c.before.nameEn,c.before.nameCn].filter(Boolean).join(' / '):'—',c.after.nameEn+(c.after.nameCn?' / '+c.after.nameCn:''),c.before?.className??'—',c.after.className,c.before?'Kemas kini':'Baharu']);for(const i of p.issues)add([`Baris ${i.row}`,'','','','',i.reason]);for(const id of p.notInImport)add([id,'','','','','Tidak disenaraikan · 保留']);result.append(table);}
function controls(){const locked=busy||annualBusy;for(const b of [loginK,loginL,previewBtn,syncBtn])b.disabled=locked;input.disabled=locked;saveBtn.disabled=locked||!ready||!preview||preview.issues.length>0||preview.changes.length===0;confirmBox.disabled=locked||!preview;if(close)close.disabled=locked;annual?.refreshControls();}
function invalidate(message){serial++;preview=null;ready=false;confirmBox.checked=false;result.replaceChildren();if(message)status.textContent=message;controls();}
async function run(fn){if(busy||annualBusy)return;busy=true;annual?.reset();controls();try{await fn();}catch(e){invalidate('Gagal / 操作未确认：'+safe(e)+'。请重新检查服务器状态。');}finally{busy=false;controls();}}
const login=side=>run(async()=>{invalidate('Google…');await (await getApi()).access.loginAdmin(side);status.textContent='Google '+side+' OK · 请确认两个 Project 均登录。';});
const loginK=button('Google Koko',()=>login('koko')),loginL=button('Google Library',()=>login('library'));
const previewBtn=button('Pratonton / 预览名单',()=>run(async()=>{invalidate('Membaca / 读取中…');if(!input.files.length)throw Error('PILIH_FAIL_XLSX');const mark=serial;const rows=[];for(const f of input.files){rows.push(...await window.readRosterXlsx(f));}const p=await (await getApi()).writer.preview(rows);if(mark!==serial)return;preview=p;render(p);status.textContent=p.issues.length?'Betulkan ralat / 请修正异常，不会写入。':'Pratonton sahaja / 仅预览，未写入。';}));
const confirmBox=el('input');confirmBox.type='checkbox';confirmBox.onchange=()=>{ready=confirmBox.checked;controls();};const label=el('label');label.append(confirmBox,' Sahkan senarai / 确认预览名单');
const saveBtn=button('Simpan / 确认保存',()=>run(async()=>{if(!ready||!preview||preview.issues.length)throw Error('PREVIEW_REQUIRED');const mark=serial,p=preview;await (await getApi()).writer.save(p,true);if(mark!==serial)return;invalidate('Disahkan oleh pelayan / 主档写入已确认。请执行图书馆同步并核对结果。');input.value='';}));
const syncBtn=button('Selaras / 同步或重试',()=>run(async()=>{if(!window.confirm('Test project only — Semasa penyelarasan, pinjaman/pemulangan dan NILAM dihentikan sementara. 确认同步或重试虚构名单？同步期间暂停借还书与 NILAM。'))return;invalidate('Menyelaras / 同步中…');const mark=serial,r=await (await getApi()).writer.sync({confirmed:true,maxWrites:100});if(mark!==serial)return;status.textContent=r.status==='complete'?`Semakan selesai / 已核对两端主档（${r.verifiedCount}）。`:`Belum selesai / 尚未完成 · ${r.remaining??'—'} 待处理。请查看结果并重试同一任务；图书馆维护锁可能仍然生效。`;const list=el('ul');for(const i of (r.results??[]))if(i.status==='failed'||i.status==='conflict')list.append(el('li',`${i.id} · ${i.status} · ${i.error??''}`));for(const i of (r.issues??[]))list.append(el('li',JSON.stringify(i)));result.append(list); }));
input.onchange=()=>invalidate('Fail dipilih / 已选文件，请重新预览。');
root.append(loginK,loginL,el('hr'),input,previewBtn,label,saveBtn,syncBtn,status,result);controls();
window.addEventListener('offline',()=>invalidate('Rangkaian terputus / 网络中断；请重新检查服务器状态。'));
document.addEventListener('visibilitychange',()=>{if(document.hidden)invalidate('Sesi disembunyikan / 页面切换后请重新预览。');});

const annualRoot=document.createElement("section");annualRoot.id="annual29-root";root.after(annualRoot);annual=mountAnnual(annualRoot,getApi,{blocked:()=>busy,onBusy:v=>{annualBusy=v;if(v)invalidate('Semak semula selepas operasi tahun / 年度操作后请重新预览主档。');else controls();}});
if(modal){
 const opener=document.querySelector('#p-master-open');
 const reset=()=>{invalidate('Sila semak semula / 请重新读取。');input.value='';annual.reset();};
 opener.onclick=()=>{if(busy||annualBusy)return;reset();modal.showModal();};
 close.onclick=()=>{if(!busy&&!annualBusy)modal.close();};
 modal.addEventListener('cancel',e=>{if(busy||annualBusy)e.preventDefault();});
 modal.addEventListener('close',reset);
}
controls();
