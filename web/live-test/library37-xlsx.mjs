// Extracted intact from Phase33 roster reader; no offline fixture or network.
export async function readBookXlsx(file){
 if(file.size>15e6)throw Error("FILE_TOO_LARGE");const u=new Uint8Array(await file.arrayBuffer()), d=new DataView(u.buffer);let end=-1;
 for(let i=u.length-22;i>=Math.max(0,u.length-65557);i--)if(d.getUint32(i,true)===0x06054b50&&i+22+d.getUint16(i+20,true)===u.length){end=i;break;}
 if(end<0)throw Error('只支持正常的 .xlsx 文件');
 const entries=new Map(), dec=new TextDecoder();let off=d.getUint32(end+16,true), count=d.getUint16(end+10,true);
 for(let i=0;i<count;i++){if(d.getUint32(off,true)!==0x02014b50)throw Error('Excel ZIP 结构异常');let n=d.getUint16(off+28,true),x=d.getUint16(off+30,true),c=d.getUint16(off+32,true),name=dec.decode(u.slice(off+46,off+46+n));entries.set(name,{method:d.getUint16(off+10,true),size:d.getUint32(off+20,true),raw:d.getUint32(off+24,true),offset:d.getUint32(off+42,true)});off+=46+n+x+c;}
 async function xml(name){const e=entries.get(name);if(!e)throw Error('Excel 缺少 '+name);if(e.raw>30e6)throw Error('Excel 文件过大');const p=e.offset;if(d.getUint32(p,true)!==0x04034b50)throw Error('ZIP entry 错误');const start=p+30+d.getUint16(p+26,true)+d.getUint16(p+28,true);let bytes=u.slice(start,start+e.size);if(e.method===8){bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());}else if(e.method!==0)throw Error('Excel 压缩格式不支持');const doc=new DOMParser().parseFromString(dec.decode(bytes),'application/xml');if(doc.querySelector('parsererror'))throw Error('XML 解析失败');return doc;}
 const els=(x,n)=>Array.from(x.getElementsByTagNameNS('*',n)), val=(x,n)=>els(x,n)[0]?.textContent||'';
 const strings=entries.has('xl/sharedStrings.xml')?els(await xml('xl/sharedStrings.xml'),'si').map(x=>els(x,'t').map(t=>t.textContent).join('')):[];
 const wb=await xml('xl/workbook.xml'), rel=await xml('xl/_rels/workbook.xml.rels'), links=new Map(els(rel,'Relationship').map(e=>[e.getAttribute('Id'),e.getAttribute('Target')]));
 const result=[],badSheets=[];
 const aliases={id:['编号','系统编号','KOD BAR','BARCODE','ID'],title:['书名','TAJUK','TITLE'],category:['类别','KATEGORI','CATEGORY'],author:['作者','PENGARANG','AUTHOR'],publisher:['出版社','PENERBIT','PUBLISHER'],isbn:['ISBN'],year:['出版年','年份','TAHUN','YEAR'],price:['价格','价钱','HARGA','PRICE'],pages:['页数','HALAMAN','PAGES'],language:['语言','BAHASA','LANGUAGE'],shelf:['书架','RAK','SHELF'],accessLevel:['借阅权限','AKSES','ACCESS']};
 const styles=entries.has('xl/styles.xml')?await xml('xl/styles.xml'):null;
 const formats=new Map(styles?els(styles,'numFmt').map(n=>[n.getAttribute('numFmtId'),n.getAttribute('formatCode')]):[]);
 const xfs=styles&&els(styles,'cellXfs')[0]?els(els(styles,'cellXfs')[0],'xf'):[];
 for(const sheet of els(wb,'sheet')){
 const name=sheet.getAttribute('name'),id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sheet.getAttribute('r:id'),target=links.get(id);if(!target)throw Error('Excel 缺少工作表路径：'+name);
 const path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');const doc=await xml(path);let headers=null,anyContent=false;
 for(const row of els(doc,'row')){
 const cells=new Map(els(row,'c').map(cell=>{const col=cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0],type=cell.getAttribute('t'),numeric=!type||type==='n';let v=val(cell,'v');if(type==='s')v=strings[Number(v)]||'';if(type==='inlineStr')v=els(cell,'t').map(t=>t.textContent).join('');if(numeric&&/^\d+\.0+$/.test(v))v=v.replace(/\.0+$/,'');return [col,{value:String(v).trim(),numeric,formula:els(cell,'f').length>0,format:formats.get(xfs[Number(cell.getAttribute('s')||0)]?.getAttribute('numFmtId'))??''}];}));
 if([...cells.values()].some(c=>c.value))anyContent=true;
 if(!headers){const found={};for(const [field,choices] of Object.entries(aliases)){const cols=[...cells].filter(([,c])=>choices.includes(c.value.normalize('NFKC').toUpperCase())).map(([col])=>col);if(cols.length>1)throw Error('重复列标题：'+name+' / '+field);if(cols.length)found[field]=cols[0];}if(found.id&&found.title)headers=found;continue;}
 const obj={};for(const [k,col] of Object.entries(headers)){const c=cells.get(col);if(c?.formula)throw Error('Formula tidak dibenarkan: '+name+' / '+row.getAttribute('r'));obj[k]=c?.value||'';}
 if(!Object.values(obj).some(Boolean))continue;
 for(const k of ['id','isbn']){const c=cells.get(headers[k]);if(c?.numeric&&obj[k]){if(!/^\d{1,15}$/.test(obj[k]))throw Error('Kod nombor tidak selamat: '+name+' / '+row.getAttribute('r'));if(/^0{2,100}$/.test(c.format))obj[k]=obj[k].padStart(c.format.length,'0');}}
 const {id,...input}=obj;input.category ||= '故事书';const a=input.accessLevel||'';if(!a||['public','公开','Semua','所有可借'].includes(a))input.accessLevel='public';else if(['teacher_only','教师专属','限教师','只限老师','Guru'].includes(a))input.accessLevel='teacher_only';else throw Error('Akses tidak sah: '+name+' / '+row.getAttribute('r'));
 result.push({id,input,row:name+' / '+row.getAttribute('r')});if(result.length>1000)throw Error('Maksimum 1000 buku setiap fail');

 }
 if(!headers&&anyContent)badSheets.push(name);
 }
 if(badSheets.length)throw Error('以下非空工作表缺少编号或书名 标题：'+badSheets.join(', ')+'。请检查或移除非名单工作表。');
 if(!result.length)throw Error('没有找到包含编号及书名 的有效名单');return result;
}
