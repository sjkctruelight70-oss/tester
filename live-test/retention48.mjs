// Local RTDB JSON backup only. No network, no database mutations, no automatic deletion.
import {digest} from './annual-reference.mjs';
const check=(v,m)=>{if(!v)throw Error(m)};
const own=(o,k)=>Object.hasOwn(o??{},k);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const legacy=['competition_records','pajsk_final_scores','school_data_v11','school_group_meta_v11','school_reports_v11','school_settings'];
export function retentionPreview(snapshot){
 check(obj(snapshot)&&legacy.every(k=>own(snapshot,k)),'INCOMPLETE_LEGACY_EXPORT');
 const m=snapshot.academic_meta?.current;const years=snapshot.academic_years;
 if(!m&&!years)return {activeYear:2026,keepFrom:2020,legacyOnly:true,blocked:true,years:[{year:2026,status:'legacy-uninitialized',overAge:false,eligibleReview:false}]};
 check(obj(m)&&obj(years)&&Number.isInteger(m.activeYear)&&m.activeYear>=2027&&m.activeYear<=2099,'INVALID_YEAR_METADATA');
 const active=years[m.activeYear]?.header;check(active?.schoolYear===m.activeYear&&active.format==='annual-v1'&&active.storageVersion===2&&typeof active.readOnly==='boolean','INVALID_ACTIVE_HEADER');
 const blocked=Boolean(m.pendingSync||m.rolloverLock||active.readOnly);const keepFrom=m.activeYear-6;
 check(own(years,'2026'),'LEGACY_HEADER_MISSING');
 const rows=Object.entries(years).map(([k,y])=>{const year=Number(k);check(/^20\d{2}$/.test(k)&&year>=2026&&year<=m.activeYear&&obj(y)&&y.header?.schoolYear===year&&typeof y.header.readOnly==='boolean','INVALID_YEAR_HEADER');check(year===2026?y.header.format==='legacy-v11'&&y.header.readOnly:y.header.format==='annual-v1'&&y.header.storageVersion===2,'INVALID_YEAR_FORMAT');const overAge=year<keepFrom;return {year,status:year===2026?'legacy-separate-paths':year===m.activeYear?'current':y.header.readOnly?'read-only':'not-frozen',overAge,eligibleReview:year!==2026&&year!==m.activeYear&&overAge&&y.header.readOnly&&!blocked};}).sort((a,b)=>b.year-a.year);
 return {activeYear:m.activeYear,keepFrom,legacyOnly:false,blocked,years:rows};
}
export async function makeBackup(snapshot){const review=retentionPreview(snapshot);return {format:'school-rtdb-full-local-v1',sha256:await digest(snapshot),activeYear:review.activeYear,data:structuredClone(snapshot)};}
export async function verifyBackup(backup,freshSnapshot){check(backup?.format==='school-rtdb-full-local-v1'&&typeof backup.sha256==='string'&&/^[a-f0-9]{64}$/.test(backup.sha256),'INVALID_BACKUP');const preview=retentionPreview(backup.data);check(backup.activeYear===preview.activeYear&&await digest(backup.data)===backup.sha256,'BACKUP_CONTENT_MISMATCH');check(await digest(freshSnapshot)===backup.sha256,'FRESH_EXPORT_DIFFERS');return {verified:true,sha256:backup.sha256,preview,physicalDeletionAllowed:false};}
