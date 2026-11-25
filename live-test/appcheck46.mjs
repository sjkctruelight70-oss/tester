// No token persistence or logging. SDK owns token refresh; never force refresh per request.
const require=(v,m)=>{if(!v)throw Error(m)};
const safeToken=v=>typeof v==='string'&&v.length>0&&!/[\s\x00-\x1f\x7f]/.test(v);
export function pairedPolicy(config){
 const keys=['koko','library'].map(s=>config?.[s]?.appCheckSiteKey??'');
 require(keys.every(k=>typeof k==='string'&&k===k.trim()),'INVALID_APP_CHECK_CONFIG');
 require(Boolean(keys[0])===Boolean(keys[1]),'BOTH_APP_CHECK_KEYS_REQUIRED');
 return Boolean(keys[0]);
}
export function createAppCheckRegistry({initialize,token}){
 const entries=new WeakMap();
 return (app,key)=>{
  const existing=entries.get(app);
  if(existing){require(existing.key===key,'APP_CHECK_CONFIG_CHANGED_RELOAD');return existing.access;}
  let instance=null;
  if(key){try{instance=initialize(app,key);}catch{throw Error('APP_CHECK_INIT_FAILED');}require(instance,'APP_CHECK_INIT_FAILED');}
  const access=Object.freeze({required:!!key,async getToken(){
   if(!key)throw Error('APP_CHECK_NOT_CONFIGURED');
   let result;try{result=await token(instance,false);}catch{throw Error('APP_CHECK_TOKEN_UNAVAILABLE');}
   require(safeToken(result?.token),'APP_CHECK_TOKEN_UNAVAILABLE');return result.token;
  }});
  entries.set(app,{key,access});return access;
 };
}
export async function requestHeaders(c,guard){
 const a=c.appCheck;
 // Existing non-enforced review config explicitly uses no keys. Missing metadata is not a fallback.
 require(a&&typeof a.required==='boolean','APP_CHECK_POLICY_MISSING');
 guard();if(!a.required)return {};
 let token;try{token=await a.getToken();}catch{throw Error('APP_CHECK_TOKEN_UNAVAILABLE');}
 guard();require(safeToken(token),'APP_CHECK_TOKEN_UNAVAILABLE');return {'X-Firebase-AppCheck':token};
}
