import {bindIdle,openSession,verify,fresh,loginAdmin} from './firebase-read-bridge.mjs';
import {doc,getDocFromServer} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {createReader} from './extension32-core.mjs';
export {loginAdmin};
export async function connect(role){const s=await openSession(role),k=s.koko,l=s.library,uid=k.auth.currentUser?.uid,luid=l.auth.currentUser?.uid;const check=()=>{if(!uid||!luid||uid!==k.auth.currentUser?.uid||luid!==l.auth.currentUser?.uid)throw Error('SESSION_CHANGED');};const authorized=async()=>{check();await verify(s);check();};return bindIdle(createReader({verify:authorized,read:async p=>{check();return fresh(k,p);},readLibrary:async id=>{check();const d=await getDocFromServer(doc(l.db,'students',id));return d.exists()?{id:d.id,data:d.data()}:null;},readLibraryMeta:async()=>{check();return (await getDocFromServer(doc(l.db,'libraryMeta','current'))).data()??null;}}),s);
}