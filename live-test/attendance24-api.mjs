import {writeRTDBFresh} from './fresh38.mjs';
// TEST PROJECT ONLY. All mutations are scoped to explicit attendance/member leaves.
import {bindIdle,openSession,verify,fresh,loginAdmin} from './firebase-read-bridge.mjs';
import {createBusinessWriter} from './business-write.mjs';
import {config} from './test-config.mjs';
export {loginAdmin};
const check=(v,m)=>{if(!v)throw Error(m)};
export async function connect(role){
 const s=await openSession(role),k=s.koko,l=s.library,uid=k.auth.currentUser?.uid,luid=l.auth.currentUser?.uid;
 const assertOpen=()=>check(uid&&luid&&k.auth.currentUser?.uid===uid&&l.auth.currentUser?.uid===luid,'SESSION_CHANGED');
 const validate=async()=>{assertOpen();await verify(s);assertOpen();};
 const read=async path=>{assertOpen();return fresh(k,path);};
 // A timeout may mean committed or not committed: never automatically retry.
 async function commit(patch){await validate();check(Object.keys(patch).every(p=>/^academic_years\/20\d{2}\/(?:attendance\/[A-Za-z0-9_~-]+\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_~-]+|memberships\/[A-Za-z0-9_~-]+)$/.test(p)),'INVALID_WRITE_SCOPE');
 await writeRTDBFresh(k,'','PATCH',patch,{base:config.koko.firebase.databaseURL,assertOpen,silent:true});
 }
 const w=createBusinessWriter({read,readQuery:async(path,filter)=>{assertOpen();return fresh(k,path,filter);},commit,assertOpen,uid,stamp:()=>({'.sv':'timestamp'})});
 async function catalog(){await validate();const m=await read('academic_meta/current');check(m&&Number.isInteger(m.activeYear)&&m.activeYear>=2027&&m.activeYear<=2099&&Number.isSafeInteger(m.epoch)&&!m.rolloverLock,'CURRENT_YEAR_NOT_READY');const b=`academic_years/${m.activeYear}`,[h,g]=await Promise.all([read(b+'/header'),read(b+'/groups')]);check(h?.schoolYear===m.activeYear&&h.storageVersion===2&&h.format==='annual-v1'&&h.readOnly===false,'CURRENT_YEAR_NOT_READY');const latest=await read('academic_meta/current');check(latest?.activeYear===m.activeYear&&latest.epoch===m.epoch&&!latest.rolloverLock,'STALE_YEAR');await validate();return {year:m.activeYear,epoch:m.epoch,groups:Object.values(g??{}).filter(x=>x.active===true&&['KELAB','UNIFORM','SUKAN'].includes(x.category))};}
 return bindIdle({catalog,verify:validate,async open(x){await validate();const r=await w.openAttendance(x);await validate();return r;},async save(c,d,o){await validate();return w.saveAttendance(c,d,o);},async openPositions(x){await validate();const r=await w.openPositions(x);await validate();return r;},async positions(c,d){await validate();return w.savePositions(c,d);}},s);
}