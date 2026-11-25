// Shared defaults scoped to the exact annual group; no legacy writes.
const check=(v,m)=>{if(!v)throw Error(m)};
const safe=v=>typeof v==='string'&&/^[A-Za-z0-9_~-]{1,180}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const fields=['teacher','place','officer'];
const text=v=>typeof v==='string'&&v.length<=300;
const revision=v=>Number.isSafeInteger(v)&&v>=1&&v<=2147483647;
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export function decodeDefaults(v){if(v===null||v===undefined)return {revision:0,teacher:'',place:'',officer:''};check(Object.keys(v).length===4&&revision(v.revision)&&fields.every(k=>text(v[k])),'INVALID_REPORT_DEFAULTS');return {revision:v.revision,...Object.fromEntries(fields.map(k=>[k,v[k]]))};}
export function createReportDefaults({read,verify,commit}){
 async function context(year,gid,write=false){await verify();check(Number.isInteger(year)&&year>=2027&&year<=2099&&safe(gid),'INVALID_GROUP');const m=await read('academic_meta/current');check(m?.activeYear===year&&revision(m.epoch)&&revision(m.masterRevision)&&!m.rolloverLock&&(!write||!m.pendingSync),'YEAR_NOT_READY');const base=`academic_years/${year}`;const [h,g]=await Promise.all([read(base+'/header'),read(base+'/groups/'+gid)]);check(h?.schoolYear===year&&h.format==='annual-v1'&&h.storageVersion===2&&h.readOnly===false&&g?.id===gid&&g.schoolYear===year&&g.active===true,'GROUP_NOT_READY');return {m,g,path:base+'/report_defaults/'+gid};}
 async function guard(c,year,gid,write=false){const n=await context(year,gid,write);check(stable(n)===stable(c),'GROUP_CHANGED_RELOAD');}
 return {async load(year,gid){const c=await context(year,gid);const d=decodeDefaults(await read(c.path));await guard(c,year,gid);return d;},async save(year,gid,expected,f){check(Number.isInteger(expected)&&expected>=0&&expected<2147483647&&fields.every(k=>text(f?.[k])),'INVALID_DEFAULTS_INPUT');const c=await context(year,gid,true);const d=decodeDefaults(await read(c.path));check(d.revision===expected,'DEFAULTS_CHANGED_RELOAD');const next={revision:expected+1,...Object.fromEntries(fields.map(k=>[k,f[k].trim()]))};if(expected>0&&fields.every(k=>d[k]===next[k])){await guard(c,year,gid,true);return d;}await guard(c,year,gid,true);await commit(c.path,next);await verify();const actual=decodeDefaults(await read(c.path));check(stable(actual)===stable(next),'WRITE_RESULT_UNKNOWN_RELOAD');await guard(c,year,gid,true);return actual;}};
}
