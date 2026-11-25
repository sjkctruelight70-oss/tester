import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {getAuth,setPersistence,browserLocalPersistence,browserSessionPersistence,signInAnonymously,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signOut} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {getDatabase,ref,get,set,update,onValue,serverTimestamp as rtime} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,setDoc,updateDoc,runTransaction,FieldPath,onSnapshot,serverTimestamp as ftime} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {initializeAppCheck,ReCaptchaEnterpriseProvider,getToken} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js';
import {cleanupPair,cleanupPlan} from "./cleanup-core.mjs";
import {createAppCheckRegistry,pairedPolicy} from './appcheck46.mjs';
const appChecks=createAppCheckRegistry({initialize:(app,key)=>initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(key),isTokenAutoRefreshEnabled:true}),token:getToken});
export function createSchoolAccess(config){
pairedPolicy(config);
// Pure, independently testable pairing and two-project operation logic.
function validateRequest(r){return !!r && typeof r.uid==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(r.uid) && typeof r.code==='string' && /^[A-F0-9]{24}$/.test(r.code) && typeof r.label==='string' && r.label.length>=1 && r.label.length<=80;}
function pairRequests(left,right){
 const group=new Map();
 for(const [side,items] of [['koko',left],['library',right]])for(const r of items){if(!validateRequest(r))continue;const p=group.get(r.code)||{code:r.code,koko:[],library:[]};p[side].push(r);group.set(r.code,p);}
 return [...group.values()].map(p=>({...p,paired:p.koko.length===1&&p.library.length===1&&p.koko[0].label===p.library[0].label}));
}
function grantMatches(request,grant){return !!request&&!!grant&&grant.code===request.code&&grant.active===true;}
function overall(k,l){return k==='active'&&l==='active'?'active':k==='revoked'||l==='revoked'?'revoked':k==='active'||l==='active'?'partial':'pending';}
async function applyPair(pair,active,adapters){
 if(active&&!pair.paired)throw Error('审批需要唯一、完整的两端申请');
 if(!pair.code||!Array.isArray(pair.koko)||!Array.isArray(pair.library))throw Error('无效申请');
 const jobs=[];
 for(const side of ['koko','library'])for(const req of pair[side]){if(!validateRequest(req)||req.code!==pair.code)throw Error('申请码不一致');jobs.push({side,uid:req.uid,run:()=>adapters[side].setGrant(req.uid,req.code,active)});}
 const results=await Promise.allSettled(jobs.map(j=>Promise.resolve().then(j.run)));
 return results.map((r,i)=>({side:jobs[i].side,uid:jobs[i].uid,ok:r.status==='fulfilled',error:r.status==='rejected'?String(r.reason?.code||r.reason?.message||'failed'):null}));
}



const sides=['koko','library'];
const waitAuth=auth=>new Promise((resolve,reject)=>{let stop=()=>{};stop=onAuthStateChanged(auth,u=>{stop();resolve(u)},e=>{stop();reject(e)})});
const makeCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();
const clients=new Map();
const deviceSessions=new Map();
function client(side,admin=false){
 if(!sides.includes(side))throw Error('unknown project');const c=config[side],name=`school-${admin?'admin':'device'}-${side}`;
 if(clients.has(name))return clients.get(name);
 if(!c?.firebase?.apiKey||!c.firebase.projectId||!c.firebase.appId||(side==='koko'&&!c.firebase.databaseURL))throw Error('请先填写测试 Firebase Web 配置');
 const existing=getApps().find(a=>a.name===name);if(existing&&(existing.options.projectId!==c.firebase.projectId||existing.options.appId!==c.firebase.appId||existing.options.databaseURL!==c.firebase.databaseURL))throw Error("APP_PROJECT_MISMATCH");const app=existing||initializeApp(c.firebase,name);
 const appCheck=appChecks(app,c.appCheckSiteKey??'');
 const auth=getAuth(app),db=side==='koko'?getDatabase(app):getFirestore(app);
 const read=async(path,id)=>side==='koko'?(await get(ref(db,`${path}/${id}`))).val():((await getDocFromServer(doc(db,path,id))).data()||null);
 const list=async(path)=>side==='koko'?Object.entries((await get(ref(db,path))).val()||{}).map(([uid,v])=>({...v,uid})):(await getDocsFromServer(collection(db,path))).docs.map(d=>({...d.data(),uid:d.id}));
 const write=(path,id,value)=>side==='koko'?set(ref(db,`${path}/${id}`),value):setDoc(doc(db,path,id),value);
 const stamp=()=>side==='koko'?rtime():ftime();
 const result={side,app,appCheck,auth,db,read,list,write,stamp,async setGrant(uid,code,active){await write('deviceGrants',uid,{code,active,updatedAt:stamp(),updatedBy:auth.currentUser.uid})}};
 if(side==='library')result.updateMember=(uid,value)=>updateDoc(doc(db,'adminRegistry','current'),new FieldPath('members',uid),value,'target',uid);
 result.purgeRevoked=async(uid,code)=>{
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||!/^[A-F0-9]{24}$/.test(code))throw Error('INVALID_TARGET');
  const actor=auth.currentUser?.uid;if(!actor)throw Error('NO_ADMIN');
  const event=crypto.randomUUID().replaceAll('-','');
  if(side==='koko'){
   const [r,g]=await Promise.all([read('deviceRequests',uid),read('deviceGrants',uid)]);
   if(!r&&!g)return;
   if(!r||r.code!==code||g?.code!==code||g.active!==false)throw Error('NOT_REVOKED');
   await update(ref(db),{[`deviceRequests/${uid}`]:null,[`deviceGrants/${uid}`]:null,[`deviceDeletionLog/${uid}/${event}`]:{code,actor,at:stamp()}});
  }else{
   await runTransaction(db,async tx=>{const r=doc(db,'deviceRequests',uid),g=doc(db,'deviceGrants',uid),[rs,gs]=await Promise.all([tx.get(r),tx.get(g)]);if(!rs.exists()&&!gs.exists())return;
   if(!rs.exists()||rs.data().code!==code||!gs.exists()||gs.data().code!==code||gs.data().active!==false)throw Error('NOT_REVOKED');
   tx.delete(r);tx.delete(g);tx.set(doc(db,'deviceDeletionLog',uid,'events',event),{code,actor,at:stamp()});});
  }
 };
 clients.set(name,result);return result;
}
async function deviceSession(side){
 if(deviceSessions.has(side))return deviceSessions.get(side);
 const pending=(async()=>{const c=client(side);await setPersistence(c.auth,browserLocalPersistence);let user=await waitAuth(c.auth);if(!user)user=(await signInAnonymously(c.auth)).user;if(!user.isAnonymous)throw Error('INVALID_DEVICE_SESSION');return {...c,uid:user.uid};})();
 deviceSessions.set(side,pending);try{return await pending;}finally{deviceSessions.delete(side);}
}
async function getPair(){const entries=await Promise.all(sides.map(async side=>{const c=await deviceSession(side);const req=await c.read('deviceRequests',c.uid);const grant=await c.read('deviceGrants',c.uid);return [side,{...c,req,grant,active:grantMatches(req,grant)}]}));return Object.fromEntries(entries);}
async function requestPair(label){
 label=String(label||'').trim();if(!label||label.length>80)throw Error('请输入设备备注（1–80字符）');
 const p=await getPair(),prior=sides.map(s=>p[s].req).filter(Boolean);
 if(prior.length&&prior.some(x=>x.code!==prior[0].code||x.label!==prior[0].label))throw Error('已有不一致申请，请联系管理员，不自动更换身份');
 const code=prior[0]?.code||makeCode(),savedLabel=prior[0]?.label||label;
 const results=await Promise.allSettled(sides.map(async side=>{const c=p[side];if(!c.req)await c.write('deviceRequests',c.uid,{code,label:savedLabel,createdAt:c.stamp()});}));
 if(results.some(r=>r.status==='rejected'))throw Error('申请尚未完整写入，请重试；已有申请会保留');return code;
}
function isDenied(e){return /permission[_ -]?denied|insufficient permissions/i.test(String(e.code||e.message||e));}
async function googleEmail(u){if(!u||u.isAnonymous)return null;const t=await u.getIdTokenResult();return t.signInProvider==='google.com'&&t.claims.email_verified===true&&typeof t.claims.email==='string'?t.claims.email:null;}
async function adminRole(c,u,bootstrap=false){
 if(!await googleEmail(u))return null;
 if(c.side==='koko')return (await c.read('deviceAdmins',u.uid))?.active===true?'admin':null;
 let reg;try{reg=await c.read('adminRegistry','current');}catch(e){if(isDenied(e))return null;throw e;}
 if(!reg&&bootstrap&&(await c.read('deviceAdmins',u.uid))?.active===true){
  try{await c.write('adminRegistry','current',{target:u.uid,members:{[u.uid]:{active:true,updatedAt:c.stamp(),updatedBy:u.uid}}});}catch(e){if(!isDenied(e))throw e;}
  try{reg=await c.read('adminRegistry','current');}catch(e){if(isDenied(e))return null;throw e;}
 }
 return reg?.members?.[u.uid]?.active===true?'admin':null;
}
async function popupAdmin(side){const c=client(side,true);await setPersistence(c.auth,browserSessionPersistence);await waitAuth(c.auth);const u=(await signInWithPopup(c.auth,new GoogleAuthProvider())).user;return {c,u};}
async function registerManager(c,u){const email=await googleEmail(u);if(!email)throw Error('需要已验证的 Google 邮箱');const old=await c.read('managerRequests',u.uid);if(old&&old.email!==email)throw Error('申请邮箱不一致，请联系管理员');if(!old)await c.write('managerRequests',u.uid,{email,createdAt:c.stamp()});return email;}
async function loginAdmin(side){const {c,u}=await popupAdmin(side);const role=await adminRole(c,u,true);if(!role){await signOut(c.auth);throw Error('Google 登录成功但尚未授权。UID='+u.uid+'。请通过交接区申请。');}await registerManager(c,u);return u.uid;}
async function getAdminSide(side){const c=client(side,true),u=await waitAuth(c.auth);if(!await adminRole(c,u))throw Error('未登录或管理员权限已撤销');return c;}
async function adminClients(){const result={};for(const s of sides)result[s]=await getAdminSide(s);if(await googleEmail(result.koko.auth.currentUser)!==await googleEmail(result.library.auth.currentUser))throw Error('两个 Project 必须使用同一 Google 账号');return result;}
async function adminList(){const c=await adminClients();const [a,b]=await Promise.all(sides.map(async side=>{const x=c[side];const [r,g]=await Promise.all([x.list('deviceRequests'),x.list('deviceGrants')]);const m=new Map(g.map(y=>[y.uid,y]));return r.map(y=>({...y,status:grantMatches(y,m.get(y.uid))?'active':m.get(y.uid)?.active===false&&m.get(y.uid)?.code===y.code?'revoked':'pending'}));}));return pairRequests(a,b);}
async function adminChange(code,active){const c=await adminClients();const p=(await adminList()).find(x=>x.code===code);if(!p)throw Error('找不到申请');return applyPair(p,active,c);}
async function logoutAdmins(){await Promise.all(sides.map(s=>signOut(client(s,true).auth)));}
// Call BEFORE starting any business database readers. Return the named app's DB.
// If either project's authorization is missing, fail closed. Rules independently enforce local grants.
async function requireDeviceAccess(onBlocked){
 const p=await getPair();if(!sides.every(s=>p[s].active)||p.koko.req.code!==p.library.req.code||p.koko.req.label!==p.library.req.label)throw Error('设备尚未在两个 Project 获得匹配授权');
 let blocked=false;const stop=[];const dispose=()=>{blocked=true;stop.splice(0).forEach(f=>f());};
 const fail=()=>{if(!blocked){dispose();onBlocked?.();}};
 for(const s of sides){const c=p[s];const check=g=>{if(!grantMatches(c.req,g))fail()};const reqCheck=r=>{if(!r||r.code!==c.req.code||r.label!==c.req.label)fail()};
 if(s==='koko'){
  stop.push(onValue(ref(c.db,`deviceGrants/${c.uid}`),v=>check(v.val()),fail));
  stop.push(onValue(ref(c.db,`deviceRequests/${c.uid}`),v=>reqCheck(v.val()),fail));
  stop.push(onValue(ref(c.db,'.info/connected'),v=>{if(v.val()===false)fail()},fail));
 }else{
  stop.push(onSnapshot(doc(c.db,'deviceGrants',c.uid),{includeMetadataChanges:true},v=>{if(!v.metadata.fromCache)check(v.data());},fail));
  stop.push(onSnapshot(doc(c.db,'deviceRequests',c.uid),{includeMetadataChanges:true},v=>{if(!v.metadata.fromCache)reqCheck(v.data());},fail));
 }
 stop.push(onAuthStateChanged(c.auth,u=>{if(!u||u.uid!==c.uid)fail()}));}
 // If a callback fired synchronously during installation, release late-added listeners too.
 if(blocked){dispose();throw Error('ACCESS_LOST');}
 return {koko:p.koko,library:p.library,assertOpen:()=>{if(blocked)throw Error('ACCESS_LOST');},dispose};
}


async function deleteRevoked(code){const c=await adminClients();const p=(await adminList()).find(x=>x.code===code);if(!p)throw Error('NO_REQUEST');return cleanupPair(p,c);}
return Object.freeze({deviceSession,getPair,requestPair,requireDeviceAccess,loginAdmin,getAdminSide,adminClients,adminList,adminChange,logoutAdmins,deleteRevoked,cleanupPlan,client,waitAuth,googleEmail,adminRole,popupAdmin,registerManager,grantMatches,validateRequest,pairRequests,applyPair,sides});
}
