import {writeRTDBFresh} from './fresh38.mjs';
import {bindIdle,openSession,verify,fresh,loginAdmin} from './firebase-read-bridge.mjs';
import {createCompetition25} from './competition25-core.mjs';
import {config} from './test-config.mjs';
export {loginAdmin};
const check=(v,m)=>{if(!v)throw Error(m)};
export async function connect(role){const s=await openSession(role),k=s.koko,l=s.library,uid=k.auth.currentUser?.uid,luid=l.auth.currentUser?.uid;const assertOpen=()=>check(uid&&luid&&k.auth.currentUser?.uid===uid&&l.auth.currentUser?.uid===luid,'SESSION_CHANGED');const validate=async()=>{assertOpen();await verify(s);assertOpen();};const read=async p=>{assertOpen();return fresh(k,p);};async function commit(patch){await validate();check(Object.keys(patch).length===1&&Object.keys(patch).every(p=>/^academic_years\/20\d{2}\/(?:competition_events\/[A-Za-z0-9_-]+|competition_projects\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+|competition_entries\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)$/.test(p)),'INVALID_SCOPE');await writeRTDBFresh(k,'','PATCH',patch,{base:config.koko.firebase.databaseURL,assertOpen});}return bindIdle(createCompetition25({read,commit,assertOpen,verify:validate,uid,stamp:()=>({'.sv':'timestamp'})}),s);
}