import {writeRTDBFresh} from './fresh38.mjs';
import {bindIdle,openSession,verify,fresh,loginAdmin} from './firebase-read-bridge.mjs';
import {config} from './test-config.mjs';
import {createSports} from './sports31-core.mjs';
export {loginAdmin};
export async function connect(role){const s=await openSession(role),k=s.koko,l=s.library,uid=k.auth.currentUser?.uid,luid=l.auth.currentUser?.uid;function assertOpen(){if(!uid||!luid||k.auth.currentUser?.uid!==uid||l.auth.currentUser?.uid!==luid)throw Error('SESSION_CHANGED');}async function validate(){assertOpen();await verify(s);assertOpen();}async function commit(p){await validate();const keys=Object.keys(p);if(keys.length!==1||!/^academic_years\/20\d{2}\/(?:sports_houses\/[A-Za-z0-9_-]+|sports_tara\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)$/.test(keys[0]))throw Error('INVALID_WRITE_SCOPE');await writeRTDBFresh(k,'','PATCH',p,{base:config.koko.firebase.databaseURL,assertOpen,denied:'SERVER_PERMISSION_DENIED'});}return bindIdle(createSports({read:p=>{assertOpen();return fresh(k,p)},commit,verify:validate,assertOpen,actor:{role,uid},stamp:()=>({'.sv':'timestamp'})}),s);
}