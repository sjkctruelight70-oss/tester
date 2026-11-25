// Test-only annual controls; uses existing student-master Google sessions. No automatic writes.
export function mountAnnual(root,getApi,{blocked=()=>false,onBusy=()=>{}}={}){
 const el=(tag,t)=>{const x=document.createElement(tag);if(t!==undefined)x.textContent=t;return x;};
 const b=(id,t,fn)=>{const x=el('button',t);x.id=id;x.type='button';x.className='btn btn-blue';x.onclick=fn;return x;};
 const status=el('p','Log masuk kedua-dua Project dahulu. / 请先登录两个 Project。');status.id='p29-status';status.setAttribute('role','status');
 const file=el('input');file.id='p29-file';file.type='file';file.accept='.xlsx';file.multiple=true;file.setAttribute('aria-label','Senarai tahun baharu');
 const details=el('div');details.id='p29-detail';details.style.cssText='max-height:360px;overflow:auto;overflow-wrap:anywhere';
 const check=el('input');check.type='checkbox';check.id='p29-confirm';const label=el('label');label.append(check,' Sahkan tindakan / 确认操作');
 let state=null,preview=null,busy=false,serial=0;
 const error=e=>{const m=String(e?.code??e?.message??'ERROR');return /https?:|token|AIza|\?/i.test(m)?'NETWORK_OR_AUTH_ERROR':m.slice(0,160);};
 function controls(){const locked=busy||blocked();refresh.disabled=locked;file.disabled=locked;previewBtn.disabled=locked||!state||!(state.canFreeze||state.canRollover);check.disabled=locked||!state;freeze.disabled=locked||!check.checked||!preview||!state?.canFreeze;commit.disabled=locked||!check.checked||!preview||!state?.canRollover;cancel.disabled=locked||!check.checked||!state?.canCancel;}
 function clear(){serial++;preview=null;check.checked=false;details.replaceChildren();}
 function invalidate(msg){clear();state=null;status.textContent=msg;controls();}
 async function run(fn,{mutates=false}={}){if(busy||blocked())return;busy=true;onBusy(true,mutates);controls();try{await fn();}catch(e){invalidate('Gagal / 未确认：'+error(e)+'。请重新读取服务器，不要重复提交。');}finally{busy=false;onBusy(false);controls();}}
 async function load(){clear();state=null;const mark=serial;const v=await (await getApi()).writer.annualStatus();if(mark!==serial)return;state=v;status.textContent=`Tahun aktif / 当前学年 ${v.year} · ${v.pendingSync?'Penyelarasan belum selesai / 待同步':v.locked?'Dibekukan / 已冻结':'Aktif / 正常'} · Sasaran / 目标 ${v.target}`;}
 function render(p){details.replaceChildren();const s=p.summary;details.append(el('p',`Jumlah / 总数 ${s.total} · Baharu / 新增 ${s.added.length} · Tidak tersenarai / 未列入 ${s.missing.length} · Kumpulan / 活动组 ${s.groups}`));for(const [cls,rows] of Object.entries(s.byClass).sort()){const d=el('details');d.append(el('summary',`${cls} · ${rows.length}`));for(const r of rows)d.append(el('p',`${r.id} · ${r.name}`));details.append(d);}const d=el('details');d.append(el('summary',`Tidak tersenarai / 未列入 ${s.missing.length}（保留历史）`));for(const id of s.missing)d.append(el('p',id));details.append(d);}
 const refresh=b('p29-refresh','Semak status / 读取年度状态',()=>run(load));
 const previewBtn=b('p29-preview','Pratonton / 预览新名单',()=>run(async()=>{clear();if(!file.files.length)throw Error('PILIH_FAIL_XLSX');const mark=serial;const rows=[];for(const f of file.files)rows.push(...await window.readRosterXlsx(f));const p=await (await getApi()).writer.annualPreview(rows);if(mark!==serial)return;state=p.status;preview=p;render(p);status.textContent=`Pratonton ${state.target} / 仅预览，未写入。${state.locked?' 已冻结，可确认建立新学年。':''}`;}));
 function submit(type){return run(async()=>{if(!check.checked||!state||(type!=='cancel'&&!preview))throw Error('CONFIRM_REQUIRED');const p=type==='cancel'?{controlRevision:state.controlRevision,confirmed:true}:{...preview,confirmed:true};const mark=serial;await (await getApi()).writer.annualConfirmed(type,p);if(mark!==serial)return;await load();if(mark+1!==serial)return;status.textContent+=type==='freeze'?' · 请重新预览同一份新名单，再确认建立新学年。':type==='rollover'?' · 请使用上方同步或重试，核对图书馆。':' · 已取消冻结。';},{mutates:true});}
 const freeze=b('p29-freeze','Bekukan / 冻结旧学年',()=>submit('freeze')),commit=b('p29-commit','Buka tahun baharu / 建立新学年',()=>submit('rollover')),cancel=b('p29-cancel','Batal beku / 取消冻结',()=>submit('cancel'));
 file.onchange=()=>{clear();status.textContent='Fail dipilih / 已选名单，请预览。';controls();};check.onchange=controls;
 root.append(el('h3','Pengurusan Tahun Akademik · 年度管理'),el('p','TEST ONLY · 虚构名单。冻结后必须重新预览，建立新学年后同步。此入口不初始化首个学年或清理历史。'),refresh,file,previewBtn,label,freeze,commit,cancel,status,details);controls();
 window.addEventListener('offline',()=>invalidate('Rangkaian terputus / 网络中断，请重新读取。'));/* Keep in-memory form on tab switches; server authorization and offline handling remain. */
 return {refreshControls:controls,reset:()=>{file.value='';invalidate('Sila semak semula / 请重新读取年度状态。');}};
}
