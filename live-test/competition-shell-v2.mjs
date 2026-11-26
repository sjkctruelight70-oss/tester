// No Firebase operation at startup. Panels use their existing, guarded adapters on explicit action.
import {readRosterXlsx} from './roster-xlsx.mjs';
window.readRosterXlsx=readRosterXlsx;
const lang=document.querySelector('#ui-language');
const choices=['ms','zh','en'];
function translate(){document.documentElement.lang=lang.value;for(const node of document.querySelectorAll('[data-ms][data-zh][data-en]'))node.textContent=node.dataset[lang.value];try{sessionStorage.setItem('review34-language',lang.value)}catch{}}
try{const prior=sessionStorage.getItem('review34-language');if(choices.includes(prior))lang.value=prior}catch{}
lang.addEventListener('change',translate);translate();
const routes=[...document.querySelectorAll('button[data-module][data-dialog]')],status=document.querySelector('#shell-status');
const allow=new Set(['competition-entry-v2.mjs','read-panel.mjs','master23-panel.mjs','sports31-panel.mjs','extension32-panel.mjs','attendance24-panel.mjs','membership27-panel.mjs','library26-panel.mjs','nilam30-panel.mjs','reports35-panel.mjs','library37-panel.mjs']);
const modules=new Map();
for(const b of routes){const name=b.dataset.module;if(!allow.has(name))continue;if(!modules.has(name))modules.set(name,import('./'+name));}
await Promise.allSettled([...modules.values()]);
let ready=0;
for(const b of routes){try{if(!allow.has(b.dataset.module))throw Error('UNKNOWN_ROUTE');await modules.get(b.dataset.module);const dlg=document.getElementById(b.dataset.dialog);if(!dlg||typeof b.onclick!=='function')throw Error('ROUTE_NOT_BOUND');b.disabled=false;ready++;}catch{b.disabled=true;b.querySelector('.route-status').textContent='Tidak tersedia / 接口未加载 / Unavailable';}}
status.textContent=`${ready}/${routes.length} antara muka ujian sedia · ${ready}/${routes.length} 个测试入口已加载 · Not server verified.`;
