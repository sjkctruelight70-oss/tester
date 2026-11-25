import {writeRTDBFresh} from './fresh38.mjs';
import {bindIdle,openSession,verify,fresh,loginAdmin} from './firebase-read-bridge.mjs';
import {createReportReader} from './reports35-reader.mjs';
import {createReportDefaults} from './report-defaults48.mjs';
import {createReportArchive} from './reports41-archive.mjs';
import {config} from './test-config.mjs';
const ok=(v,m)=>{if(!v)throw Error(m)};
export {loginAdmin};
export async function connect(role){
 const s=await openSession(role),k=s.koko,l=s.library,ku=k.auth.currentUser,lu=l.auth.currentUser;
 const guard=()=>ok(ku?.uid&&lu?.uid&&k.auth.currentUser===ku&&l.auth.currentUser===lu,'SESSION_CHANGED');
 const validate=async()=>{guard();await verify(s);guard();};const read=async p=>{guard();const r=await fresh(k,p);guard();return r;};
 const reader=createReportReader(read,validate);
 async function commit(path,value){await validate();ok(/^academic_years\/20\d{2}\/(?:reports\/[a-f0-9]{64}(?:\/removed)?|report_defaults\/[A-Za-z0-9_~-]{1,180})$/.test(path),'INVALID_WRITE_SCOPE');if(path.endsWith('/removed'))ok(role==='Admin','ADMIN_REQUIRED');await writeRTDBFresh(k,path,'PUT',value,{base:config.koko.firebase.databaseURL,assertOpen:guard,silent:true});}
 const defaults=createReportDefaults({read,verify:validate,commit});
 const archive=createReportArchive({read,verify:validate,group:reader.group,commit,uid:ku.uid,role});return bindIdle({...reader,savedList:archive.list,savedDocuments:archive.documents,saveReport:archive.save,removeReport:archive.remove,loadDefaults:defaults.load,saveDefaults:defaults.save},s);
}
