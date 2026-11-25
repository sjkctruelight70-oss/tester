const check=(ok,code)=>{if(!ok)throw Error(code)};
export function validateReportProfile(p){
 check(p&&typeof p.name==='string'&&p.name.trim()&&p.name.length<=300&&typeof p.address==='string'&&p.address.trim()&&p.address.length<=500,'INVALID_SCHOOL_PROFILE');
 const logo=p.logo??'';
 check(typeof logo==='string'&&logo.length<=180022,'INVALID_SCHOOL_LOGO');
 if(logo){
  check(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(logo),'INVALID_SCHOOL_LOGO');
  const s=logo.slice(22);let bytes;try{bytes=Uint8Array.from(atob(s),c=>c.charCodeAt(0))}catch{throw Error('INVALID_SCHOOL_LOGO')}
  check(bytes.length>=45&&bytes.length<=135000&&[137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82].every((n,i)=>bytes[i]===n),'INVALID_SCHOOL_LOGO');
  const v=new DataView(bytes.buffer);check(v.getUint32(16)>0&&v.getUint32(16)<=512&&v.getUint32(20)>0&&v.getUint32(20)<=512,'INVALID_SCHOOL_LOGO_SIZE');
 }
 return Object.freeze({name:p.name.trim(),address:p.address.trim(),logo});
}
