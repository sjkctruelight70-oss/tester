// Shared read-only PAJSK calculation. Portal receives attendance count, not mark.
export function attendanceScore(present){
 if(!Number.isSafeInteger(present)||present<0)throw Error('INVALID_PRESENT_COUNT');
 return {present,remaining:Math.max(0,12-present),portalCount:Math.min(present,12),mark:Math.round(Math.min(present/12*40,40)*100)/100};
}
