import {createSchoolAccess} from './school-access.mjs';
import {config} from './test-config.mjs';
import {collection,getDocsFromServer,doc,getDocFromServer,query,where,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {idleMonitor} from './idle39.mjs';
import {createReadBridge} from './read-core.mjs';
const access=createSchoolAccess(config);
// No SDK cache fallback for archive/annual RTDB reads. Firebase REST receives an ID token
// over HTTPS; never log URL/token or propagate raw fetch errors. No production URL accepted.
import {readRTDBFresh} from './fresh38.mjs';
export async function fresh(c,path,filter=null){return readRTDBFresh(c,path,filter,{base:config.koko.firebase.databaseURL});}
async function fsRead(c,coll,id){return (await getDocFromServer(doc(c.db,coll,id))).data()??null;}
const fail=m=>{throw Error(m)};
export async function openSession(role){if(role==='Admin'){const c=await access.adminClients();const s={role,...c};ids(s);return s;}if(role!=='Guru')fail('INVALID_ROLE');const [koko,library]=await Promise.all(['koko','library'].map(s=>access.deviceSession(s)));const s={role,koko,library};ids(s);return s;}
// Bind to the original authenticated identities, not whatever user happens to be logged in later.
const identities=new WeakMap(), invalidated=new WeakSet();
function ids(s){if(!identities.has(s))identities.set(s,[s.koko.auth.currentUser,s.library.auth.currentUser]);return identities.get(s);}
function identity(s){const [ku,lu]=ids(s);return !invalidated.has(s)&&!!ku&&!!lu&&s.koko.auth.currentUser===ku&&s.library.auth.currentUser===lu;}
function guard(s){if(s.koko.app.options.projectId!=='tester-960da'||s.library.app.options.projectId!=='tester-2-f6895')fail('TEST_PROJECT_ONLY');if(!identity(s))fail('SESSION_LOST');}
async function kokoProof(s){guard(s);const k=s.koko,[ku,lu]=ids(s);if(s.role==='Admin'){const [a,ke,le]=await Promise.all([fresh(k,`deviceAdmins/${ku.uid}`),access.googleEmail(ku),access.googleEmail(lu)]);guard(s);if(a?.active!==true||!ke||ke!==le)fail('ADMIN_NOT_AUTHORIZED');return ['Admin',ke];}
 if(s.role!=='Guru'||!ku.isAnonymous||!lu.isAnonymous)fail('DEVICE_SESSION_REQUIRED');const [r,g]=await Promise.all([fresh(k,`deviceRequests/${ku.uid}`),fresh(k,`deviceGrants/${ku.uid}`)]);guard(s);if(!access.grantMatches(r,g))fail('DEVICE_NOT_AUTHORIZED');return ['Guru',r.code,r.label];}
async function fullProof(s){guard(s);const l=s.library,[,lu]=ids(s);const specs=s.role==='Admin'?[['adminRegistry','current']]:[['deviceRequests',lu.uid],['deviceGrants',lu.uid]];const [k,docs]=await Promise.all([kokoProof(s),Promise.all(specs.map(([c,id])=>fsRead(l,c,id)))]);guard(s);
 const checks=s.role==='Admin'?[v=>v?.members?.[lu.uid]?.active===true]:[v=>v?.code===k[1]&&v?.label===k[2],v=>v?.code===k[1]&&v?.active===true];
 if(!checks.every((f,i)=>f(docs[i])))fail('ACCESS_NOT_AUTHORIZED');return {fingerprint:JSON.stringify(k),watchCount:specs.length,specs,checks};}
export async function verify(s){await fullProof(s);guard(s);}
export function bindIdle(api,s){ids(s);const m=idleMonitor({identity:()=>identity(s),full:()=>fullProof(s),poll:async proof=>{if(JSON.stringify(await kokoProof(s))!==proof.fingerprint)fail('ACCESS_CHANGED');},subscribe:(proof,report,blocked)=>{const stops=[];try{for(const [i,[coll,id]] of proof.specs.entries())stops.push(onSnapshot(doc(s.library.db,coll,id),{includeMetadataChanges:true},v=>report(i,proof.checks[i](v.data()),v.metadata.fromCache,v.metadata.hasPendingWrites),blocked));for(const c of [s.koko,s.library])stops.push(onAuthStateChanged(c.auth,()=>{if(!identity(s))blocked();},blocked));return stops;}catch(e){for(const stop of stops)stop();throw e;}}});return {...api,idleVerify:cb=>m.check(()=>{invalidated.add(s);cb?.();}),disposeIdle:()=>{invalidated.add(s);m.dispose();}};}
export function reader(s){const ku=s.koko.auth.currentUser?.uid,lu=s.library.auth.currentUser?.uid;const guard=()=>{if(!ku||!lu||s.koko.auth.currentUser?.uid!==ku||s.library.auth.currentUser?.uid!==lu)fail('SESSION_CHANGED');};const docs=async q=>{guard();const v=await getDocsFromServer(q);guard();return v.docs.map(d=>({id:d.id,data:d.data()}));};return bindIdle(createReadBridge({assertOpen:guard,verify:async()=>{guard();await verify(s);guard();},read:path=>fresh(s.koko,path),readLibrary:()=>docs(collection(s.library.db,'students')),readLoans:()=>docs(query(collection(s.library.db,'books'),where('status','==','out'))),readLibraryClass:cls=>docs(query(collection(s.library.db,'students'),where('className','==',cls))),readLibraryDoc:async(c,id)=>{guard();const d=await getDocFromServer(doc(s.library.db,c,id));guard();return d.data()??null;}}),s);}
export const loginAdmin=side=>access.loginAdmin(side);
