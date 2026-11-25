import {requestHeaders} from './appcheck46.mjs';
// Server-only reads; no persistent cache, no token logging. Only the two intended indexed queries are supported.
const ok=(v,m)=>{if(!v)throw Error(m)};
const segment=x=>/^[A-Za-z0-9_~-]+$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
export function readURL(base,path,filter){
 ok(typeof path==='string'&&path.split('/').every(segment),'INVALID_PATH');
 const url=new URL(base);ok(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','INVALID_DATABASE_URL');
 const out=new URL(path+'.json',url);
 if(filter!==null&&filter!==undefined){
  ok(filter&&typeof filter==='object','INVALID_FILTER');
  const keys=Object.keys(filter).sort().join(',');
  const member=/^academic_years\/20\d{2}\/memberships$/.test(path)&&keys==='equalTo,orderBy'&&filter.orderBy==='groupId'&&typeof filter.equalTo==='string'&&segment(filter.equalTo);
  const student=/^academic_years\/20\d{2}\/students$/.test(path)&&keys==='endAt,orderBy,startAt'&&filter.orderBy==='className'&&typeof filter.startAt==='string'&&/^[3-6]$/.test(filter.startAt)&&filter.endAt===filter.startAt+'\uf8ff';
  ok(member||student,'INVALID_FILTER');for(const [k,v] of Object.entries(filter))out.searchParams.set(k,JSON.stringify(v));
 }
 return out;
}
// Strictly bind both credentials to the intended test database; never follow redirects.
const testBase='https://tester-960da-default-rtdb.firebaseio.com/';
function bound(c,base,outerGuard=()=>{}){
 const u=c?.auth?.currentUser,app=c?.app;
 ok(app?.options?.projectId==='tester-960da'&&u?.uid,'TEST_SESSION_REQUIRED');
 ok(new URL(base).href===testBase&&new URL(app.options.databaseURL).href===testBase,'DATABASE_TARGET_MISMATCH');
 const guard=()=>{outerGuard();ok(c.auth.currentUser===u&&c.auth.currentUser.uid===u.uid,'SESSION_CHANGED');};guard();return {u,guard};
}
async function credentials(c,url,u,guard){
 let auth;try{auth=await u.getIdToken();}catch{throw Error('AUTH_TOKEN_UNAVAILABLE');}
 guard();ok(typeof auth==='string'&&auth.length>0,'AUTH_TOKEN_UNAVAILABLE');
 const headers=await requestHeaders(c,guard);guard();url.searchParams.set('auth',auth);return headers;
}
const opts=()=>({cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000)});
export async function readRTDBFresh(c,path,filter,{base,fetcher=fetch}={}){
 const {u,guard}=bound(c,base);const url=readURL(base,path,filter);const headers=await credentials(c,url,u,guard);
 let res;guard();try{res=await fetcher(url,{...opts(),headers});}catch{throw Error('NETWORK_READ_FAILED');}
 guard();if(!res.ok)throw Error([401,403].includes(res.status)?'SERVER_PERMISSION_DENIED':'SERVER_READ_FAILED_'+res.status);
 let value;try{value=await res.json();}catch{throw Error('SERVER_RESPONSE_INVALID');}guard();return value;
}
// Callers retain business-specific path/patch allowlists and dual-project verification.
export async function writeRTDBFresh(c,path,method,value,{base,assertOpen,fetcher=fetch,silent=false,denied='SERVER_PERMISSION_DENIED_RELOAD'}={}){
 ok(typeof assertOpen==='function','WRITE_GUARD_REQUIRED');
 ok((method==='PATCH'&&path==='')||(method==='PUT'&&typeof path==='string'&&path.length>0),'INVALID_WRITE_SCOPE');
 const {u,guard}=bound(c,base,assertOpen);const url=path?readURL(base,path):new URL('.json',base);
 if(silent)url.searchParams.set('print','silent');
 const headers=await credentials(c,url,u,guard);const body=JSON.stringify(value);ok(typeof body==='string','INVALID_WRITE_BODY');
 let res;guard();try{res=await fetcher(url,{...opts(),method,headers:{...headers,'Content-Type':'application/json'},body});}catch{throw Error('WRITE_RESULT_UNKNOWN_RELOAD');}
 // No retry on any error, including a session switch after dispatch: commit may have succeeded.
 try{guard();}catch{throw Error('WRITE_RESULT_UNKNOWN_RELOAD');}
 if(!res.ok)throw Error([401,403].includes(res.status)?denied:'WRITE_RESULT_UNKNOWN_RELOAD');
}
