import {writeRTDBFresh} from './fresh38.mjs';
import {createMemberBatch} from './batch28-core.mjs';
import {bindIdle,openSession,verify,fresh,loginAdmin} from './firebase-read-bridge.mjs';
import {config} from './test-config.mjs';
import {createMembershipWriter} from './membership27-core.mjs';
export {loginAdmin};
const check=(v,m)=>{if(!v)throw Error(m)};
export async function connect(){const s=await openSession('Admin'),k=s.koko,l=s.library,uid=k.auth.currentUser?.uid,luid=l.auth.currentUser?.uid;
 const assertAdmin=async()=>{check(uid&&luid&&k.auth.currentUser?.uid===uid&&l.auth.currentUser?.uid===luid,'SESSION_CHANGED');await verify(s);check(k.auth.currentUser?.uid===uid&&l.auth.currentUser?.uid===luid,'SESSION_CHANGED');};
 const read=path=>fresh(k,path);
 async function readState(){await assertAdmin();const m=await read('academic_meta/current');check(Number.isInteger(m?.activeYear)&&m.activeYear>=2027&&m.activeYear<=2099&&!m.rolloverLock&&!m.pendingSync,'CURRENT_YEAR_NOT_READY');const b=`academic_years/${m.activeYear}`,keys=['header','students','groups','memberships','member_slots'];const vals=await Promise.all(keys.map(x=>read(b+'/'+x)));const after=await read('academic_meta/current');check(JSON.stringify(m)===JSON.stringify(after),'STATE_CHANGED_RELOAD');await assertAdmin();return {academic_meta:{current:m},academic_years:{[m.activeYear]:Object.fromEntries(keys.map((x,i)=>[x,vals[i]]))}};}
 async function commit(patch){await assertAdmin();check(Object.keys(patch).length>0&&Object.keys(patch).every(p=>/^academic_years\/20\d{2}\/(?:memberships\/[A-Za-z0-9_~-]+|member_slots\/[A-Za-z0-9_~-]+\/(?:KELAB|UNIFORM|SUKAN)|groups\/[A-Za-z0-9_~-]+\/memberRevision)$/.test(p)),'INVALID_WRITE_SCOPE');await writeRTDBFresh(k,'','PATCH',patch,{base:config.koko.firebase.databaseURL,assertOpen:()=>check(k.auth.currentUser?.uid===uid&&l.auth.currentUser?.uid===luid,'SESSION_CHANGED'),denied:'SERVER_PERMISSION_DENIED_OR_CONFLICT_RELOAD'});}
 const deps={readState,commit,assertAdmin,actor:{role:'Admin',uid,verified:true},stamp:()=>({'.sv':'timestamp'})};return bindIdle({...createMembershipWriter(deps),...createMemberBatch(deps),verify:assertAdmin},s);
}