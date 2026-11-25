// Extracted from original V9.7; unchanged rate tables and calculation.
export const POINT_SYSTEM = {
    PENGLIBATAN: { "ANTARABANGSA": {1:20, 2:15, 3:10}, "KEBANGSAAN": {1:17, 2:12, 3:8}, "NEGERI": {1:14, 2:10, 3:6}, "ZON/DAERAH": {1:11, 2:8, 3:4}, "SEKOLAH": {1:8, 2:7, 3:6} },
    PENCAPAIAN: { "ANTARABANGSA": {"JOHAN":20, "EMAS":20, "NAIB JOHAN":19, "PERAK":19, "KETIGA":18, "GANGSA":18}, "KEBANGSAAN": {"JOHAN":17, "EMAS":17, "NAIB JOHAN":16, "PERAK":16, "KETIGA":15, "GANGSA":15}, "NEGERI": {"JOHAN":14, "EMAS":14, "NAIB JOHAN":13, "PERAK":13, "KETIGA":12, "GANGSA":12}, "ZON/DAERAH": {"JOHAN":11, "EMAS":11, "NAIB JOHAN":10, "PERAK":10, "KETIGA":9, "GANGSA":9}, "SEKOLAH": {"JOHAN":8, "EMAS":8, "NAIB JOHAN":7, "PERAK":7, "KETIGA":6, "GANGSA":6, "KEEMPAT":5, "KELIMA":4} }
};
export const INCENTIVE_RATES = {
    PHYSICAL_INDIVIDUAL: { "ANTARABANGSA":[120,100,80,60], "KEBANGSAAN":[100,80,60,40], "NEGERI":[50,40,30,20], "ZON/DAERAH":[25,20,15,10] },
    ONLINE_INDIVIDUAL: { "ANTARABANGSA":[35,30,25,20], "KEBANGSAAN":[30,25,20,15], "NEGERI":[25,20,15,10] },
    GROUP: { "ANTARABANGSA":[80,60,40,30], "KEBANGSAAN":[50,40,30,20], "NEGERI":[25,20,15,10], "ZON/DAERAH":[20,15,10,5] },
    MEDAL_SYSTEM: { "ANTARABANGSA":25, "KEBANGSAAN":20, "NEGERI":15, "ZON/DAERAH":10 }
};

export function getLegacyIncentiveAmount(r) {
    const rk = String(r.rank).toUpperCase(), lvl = String(r.level).toUpperCase(); if (rk.includes("PENYERTAAN")) return 0;
    let idx = 3; if (rk.includes("JOHAN") || rk.includes("EMAS") || rk.includes("PERTAMA")) idx = 0; else if (rk.includes("NAIB") || rk.includes("PERAK") || rk.includes("KEDUA")) idx = 1; else if (rk.includes("KETIGA") || rk.includes("GANGSA")) idx = 2;
    if (r.isMedalSystem) return (idx === 0) ? INCENTIVE_RATES.MEDAL_SYSTEM[lvl] || 0 : 0;
    if (r.isGroup) return (INCENTIVE_RATES.GROUP[lvl] || [])[idx] || 0;
    if (r.isOnline) return (INCENTIVE_RATES.ONLINE_INDIVIDUAL[lvl] || [])[idx] || 0;
    return (INCENTIVE_RATES.PHYSICAL_INDIVIDUAL[lvl] || [])[idx] || 0;
}

// 2027+ policy. Original monetary tables remain unchanged.
export const LEVEL_ORDER = Object.freeze(['SEKOLAH','ZON/DAERAH','NEGERI','KEBANGSAAN','ANTARABANGSA']);
export function levelPriority(level) { return LEVEL_ORDER.indexOf(level); }
export function getIncentiveAmount(r) {
    const rk=String(r.rank??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase(), lvl=String(r.level??'').trim().toUpperCase();
    if (rk==='PENYERTAAN') return 0;
    const rankIndex = new Map([['JOHAN',0],['EMAS',0],['PERTAMA',0],['NAIB JOHAN',1],['PERAK',1],['KEDUA',1],['KETIGA',2],['GANGSA',2]]);
    const idx=rankIndex.get(rk)??3;
    if (r.isMedalSystem) return idx===0?(INCENTIVE_RATES.MEDAL_SYSTEM[lvl]??0):0;
    return (INCENTIVE_RATES[r.isGroup?'GROUP':r.isOnline?'ONLINE_INDIVIDUAL':'PHYSICAL_INDIVIDUAL'][lvl]??[])[idx]??0;
}
