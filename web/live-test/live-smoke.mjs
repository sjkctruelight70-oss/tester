import {createSchoolAccess} from './school-access.mjs';
import {config} from './test-config.mjs';
import {readRTDBFresh,writeRTDBFresh} from './fresh38.mjs';
const expected={koko:'tester-960da',library:'tester-2-f6895'};
if(Object.keys(expected).some(k=>config[k].firebase.projectId!==expected[k])||config.koko.firebase.databaseURL!=='https://tester-960da-default-rtdb.firebaseio.com')throw Error('TEST_PROJECT_ONLY');
const access=createSchoolAccess(config), $=id=>document.getElementById(id), lines=['STAGE 2A - TEST PROJECT LIVE SMOKE','Projects: tester-960da / tester-2-f6895','No student data accessed. App Check configuration: '+(config.koko.appCheckSiteKey?'configured':'not configured')];
let code=null, label='LIVE-DEMO-'+crypto.randomUUID().slice(0,8), busy=false, phase=0, completed=new Set();
const log=s=>{lines.push(new Date().toISOString()+' '+s);$('log').textContent=lines.join('\n');};
const safeError=e=>String(e?.code??e?.message??'ERROR').replace(/[^a-zA-Z0-9_\- /:]/g,'').slice(0,100);
const denied=e=>/^(?:permission[-_]denied|PERMISSION_DENIED|SERVER_PERMISSION_DENIED(?:_RELOAD)?|firestore\/permission-denied)$/i.test(String(e?.code??e?.message??''));
function guardPair(p){if(!code||!['koko','library'].every(s=>p[s].req?.code===code&&p[s].req?.label===label))throw Error('THIS_RUN_DEVICE_MISMATCH');}
async function getPair(){const p=await access.getPair();guardPair(p);return p;}
async function check(name,fn,allow,verify=()=>true){try{const v=await fn();const ok=allow&&verify(v);log(`${ok?'PASS':'FAIL'} ${name}: ${allow?'allowed':'unexpectedly allowed'}`);return ok;}catch(e){const ok=!allow&&denied(e);log(`${ok?'PASS':'FAIL'} ${name}: ${safeError(e)}`);return ok;}}
async function probes(mode){const p=await getPair(),allow=mode==='active';if(mode==='pending'&&Object.values(p).some(c=>c.grant))throw Error('NEW_PENDING_DEVICE_REQUIRED');if(mode==='active'&&Object.values(p).some(c=>!c.active))throw Error('BOTH_GRANTS_REQUIRED');if(mode==='revoked'&&Object.values(p).some(c=>c.grant?.active!==false))throw Error('BOTH_REVOKED_REQUIRED');
 const k=p.koko,l=p.library,path='deviceTest/'+k.uid,base=config.koko.firebase.databaseURL;
 const results=[];
 results.push(await check(`${mode} RTDB REST write`,()=>writeRTDBFresh(k,path,'PUT','B1 TEST',{base,assertOpen:()=>{}}),allow));
 results.push(await check(`${mode} Firestore SDK write`,()=>l.write('deviceTest',l.uid,{value:'B1 TEST'}),allow));
 results.push(await check(`${mode} RTDB REST read`,()=>readRTDBFresh(k,path,null,{base}),allow,v=>v==='B1 TEST'));
 results.push(await check(`${mode} Firestore SDK server read`,()=>l.read('deviceTest',l.uid),allow,v=>v?.value==='B1 TEST'));
 if(results.every(Boolean)){completed.add(mode);phase=mode==='pending'?2:mode==='active'?4:6;log('GROUP PASS '+mode);}else log('GROUP FAIL '+mode+' - STOP; download result.');
}
function controls(){for(const b of document.querySelectorAll('button'))b.disabled=busy;for(const [id,ok] of Object.entries({apply:phase===0,pending:phase===1,loginK:phase>=2&&phase<=3,loginL:phase>=2&&phase<=3,approve:phase===2,active:phase===3,revoke:phase===4||phase===3,revoked:phase===5}))$(id).disabled=busy||!ok;}
function action(id,fn){$(id).onclick=async()=>{if(busy)return;busy=true;controls();try{await fn()}catch(e){log('ERROR '+id+': '+safeError(e));}finally{busy=false;controls();}};}
action('apply',async()=>{const p=await access.getPair();if(Object.values(p).some(c=>c.req||c.grant))throw Error('USE_NEW_INCOGNITO_WINDOW');code=await access.requestPair(label);await getPair();phase=1;$('device').textContent=label;log('PASS new paired test request');});
action('pending',()=>probes('pending'));
action('loginK',async()=>{await access.loginAdmin('koko');log('PASS RTDB admin login');});
action('loginL',async()=>{await access.loginAdmin('library');log('PASS Firestore admin login');});
async function change(active){await getPair();if(!confirm((active?'批准':'撤销')+'本次虚构设备 '+label+'？'))return;const r=await access.adminChange(code,active);for(const x of r)log(`${x.ok?'PASS':'FAIL'} ${active?'approve':'revoke'} ${x.side}${x.ok?'':': '+safeError({message:x.error})}`);if(r.length!==2||r.some(x=>!x.ok))throw Error('PARTIAL_CHANGE_RETRY');phase=active?3:5;}
action('approve',()=>change(true));action('active',()=>probes('active'));action('revoke',()=>change(false));action('revoked',()=>probes('revoked'));
$('download').onclick=()=>{const summary=completed.size===3?'STAGE 2A THREE PROBE GROUPS PASS':'STAGE 2A INCOMPLETE - DO NOT DEPLOY';const u=URL.createObjectURL(new Blob([lines.join('\n')+'\n'+summary+'\n'],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download='LIVE_RESULT.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
controls();log('Ready; only test device paths will be written.');
