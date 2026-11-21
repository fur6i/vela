const {t}=require('./i18n.js');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const zlib=require('node:zlib');
const MAX_CRX=50*1024*1024;
function extensionId(value){
  if(typeof value!=='string'||value.length>4096)return null;value=value.trim();if(/^[a-p]{32}$/.test(value))return value;
  try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
    const prefix=url.hostname==='chromewebstore.google.com'?'/detail/':url.hostname==='chrome.google.com'?'/webstore/detail/':null;
    if(!prefix||!url.pathname.startsWith(prefix))return null;const parts=url.pathname.slice(prefix.length).split('/').filter(Boolean);return parts.length>=1&&parts.length<=2&&/^[a-p]{32}$/.test(parts.at(-1))?parts.at(-1):null;
  }catch{return null;}
}
function fields(buffer,language='it'){const tr=(key,vars)=>t(language,key,vars);
  let offset=0;const result=[];const integer=()=>{let value=0,scale=1;for(let count=0;count<8;count++){if(offset>=buffer.length)throw Error(tr("Protobuf troncato."));const byte=buffer[offset++];value+=(byte&127)*scale;if(!Number.isSafeInteger(value))throw Error(tr("Protobuf non valido."));if(!(byte&128))return value;scale*=128;}throw Error(tr("Protobuf troppo grande."));};
  while(offset<buffer.length){if(result.length>256)throw Error(tr("Header troppo complesso."));const tag=integer(),type=tag%8,id=Math.floor(tag/8);if(!id)throw Error(tr("Campo non valido."));let data;if(type===2){const size=integer();if(size>buffer.length-offset)throw Error(tr("Campo troncato."));data=buffer.subarray(offset,offset+size);offset+=size;}else if(type===0){integer();continue;}else if(type===1||type===5){offset+=type===1?8:4;if(offset>buffer.length)throw Error(tr("Campo troncato."));continue;}else throw Error(tr("Tipo protobuf non consentito."));result.push({id,data});}return result;
}
function keyId(key){return [...crypto.createHash('sha256').update(key).digest().subarray(0,16)].map(byte=>String.fromCharCode(97+(byte>>4),97+(byte&15))).join('');}
function crxPayload(buffer,expectedId,language='it'){const tr=(key,vars)=>t(language,key,vars);
  if(!Buffer.isBuffer(buffer)||buffer.length<16||buffer.length>MAX_CRX||buffer.toString('ascii',0,4)!=='Cr24')throw Error(tr("Pacchetto CRX non valido."));
  const version=buffer.readUInt32LE(4);let offset,proofs,signed,key;
  if(version===2){const keySize=buffer.readUInt32LE(8),sigSize=buffer.readUInt32LE(12);offset=16+keySize+sigSize;if(!keySize||!sigSize||offset>buffer.length||offset>1024*1024)throw Error(tr("Header CRX2 non valido."));key=buffer.subarray(16,16+keySize);proofs=[{key,signature:buffer.subarray(16+keySize,offset),algorithm:'sha1'}];signed=buffer.subarray(offset);}
  else if(version===3){const size=buffer.readUInt32LE(8);offset=12+size;if(!size||size>1024*1024||offset>=buffer.length)throw Error(tr("Header CRX3 non valido."));const header=fields(buffer.subarray(12,offset),language),headers=header.filter(field=>field.id===10000);if(headers.length!==1)throw Error(tr("Dati firmati mancanti."));const data=headers[0].data,ids=fields(data,language).filter(field=>field.id===1);if(ids.length!==1||ids[0].data.length!==16)throw Error(tr("ID firmato non valido."));const id=[...ids[0].data].map(byte=>String.fromCharCode(97+(byte>>4),97+(byte&15))).join('');if(expectedId&&id!==expectedId)throw Error(tr("ID CRX differente dallo Store."));const length=Buffer.alloc(4);length.writeUInt32LE(data.length);signed=Buffer.concat([Buffer.from('CRX3 SignedData\0'),length,data,buffer.subarray(offset)]);
    proofs=header.filter(field=>field.id===2||field.id===3).map(field=>{const proof=fields(field.data,language),keys=proof.filter(p=>p.id===1),signatures=proof.filter(p=>p.id===2);if(keys.length!==1||signatures.length!==1)throw Error(tr("Prova CRX non valida."));return {key:keys[0].data,signature:signatures[0].data,algorithm:'sha256',type:field.id===2?'rsa':'ec'};}).filter(proof=>keyId(proof.key)===id);
  }else throw Error(tr("Versione CRX non supportata."));
  let valid=false;
  for(const proof of proofs){try{if(expectedId&&keyId(proof.key)!==expectedId)continue;const publicKey=crypto.createPublicKey({key:proof.key,format:'der',type:'spki'});if(proof.type&&publicKey.asymmetricKeyType!==proof.type)continue;if(crypto.verify(proof.algorithm,signed,publicKey,proof.signature)){key=proof.key;valid=true;break;}}catch{}}
  if(!valid||buffer.readUInt32LE(offset)!==0x04034b50)throw Error(tr("Firma CRX o archivio ZIP non valido."));
  return {zip:buffer.subarray(offset),offset,version,id:keyId(key),key:key.toString('base64')};
}
function safeEntry(name,language='it'){const tr=(key,vars)=>t(language,key,vars);
  if(!name||name.length>512||name.includes('..')||/[\\:\x00-\x1f\x7f\uFFFD]/.test(name)||name.startsWith('/')||name.includes('//'))throw Error(tr("Percorso ZIP non consentito."));
  for(const part of name.replace(/\/$/,'').split('/'))if(!part||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))throw Error(tr("Nome ZIP non consentito."));return name;
}
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;});
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer)crc=(crc>>>8)^crcTable[(crc^byte)&255];return (crc^0xffffffff)>>>0;}
async function extractZip(zip,directory,language='it'){const tr=(key,vars)=>t(language,key,vars);
  let end=-1;for(let offset=zip.length-22;offset>=Math.max(0,zip.length-65557);offset--)if(zip.readUInt32LE(offset)===0x06054b50&&offset+22+zip.readUInt16LE(offset+20)===zip.length){end=offset;break;}
  if(end<0)throw Error(tr("Directory ZIP mancante."));const count=zip.readUInt16LE(end+10),size=zip.readUInt32LE(end+12),start=zip.readUInt32LE(end+16);
  if(zip.readUInt16LE(end+4)||zip.readUInt16LE(end+6)||zip.readUInt16LE(end+8)!==count||count<1||count>10000||start+size!==end)throw Error(tr("ZIP multiparte/ZIP64 non consentito."));
  const entries=[],names=new Set();let cursor=start,total=0;
  for(let index=0;index<count;index++){
    if(cursor+46>end||zip.readUInt32LE(cursor)!==0x02014b50)throw Error(tr("Entry ZIP non valida."));
    const flags=zip.readUInt16LE(cursor+8),method=zip.readUInt16LE(cursor+10),crc=zip.readUInt32LE(cursor+16),compressed=zip.readUInt32LE(cursor+20),length=zip.readUInt32LE(cursor+24),n=zip.readUInt16LE(cursor+28),extra=zip.readUInt16LE(cursor+30),comment=zip.readUInt16LE(cursor+32),mode=zip.readUInt32LE(cursor+38)>>>16,local=zip.readUInt32LE(cursor+42);
    if(cursor+46+n+extra+comment>end||zip.readUInt16LE(cursor+34)||flags&1||![0,8].includes(method)||(mode&0xf000)&&![0x8000,0x4000].includes(mode&0xf000))throw Error(tr("Entry cifrata, speciale o non supportata."));
    const raw=zip.subarray(cursor+46,cursor+46+n),name=safeEntry(raw.toString('utf8'),language),lower=name.toLowerCase();if(names.has(lower))throw Error(tr("Entry duplicate."));names.add(lower);total+=length;
    if(length>50*1024*1024||total>200*1024*1024||compressed===0xffffffff||local+30>start||zip.readUInt32LE(local)!==0x04034b50)throw Error(tr("Limiti ZIP superati."));
    const localN=zip.readUInt16LE(local+26),localExtra=zip.readUInt16LE(local+28),data=local+30+localN+localExtra;
    if(zip.readUInt16LE(local+6)!==flags||zip.readUInt16LE(local+8)!==method||!zip.subarray(local+30,local+30+localN).equals(raw)||data+compressed>start)throw Error(tr("Header ZIP incoerenti."));
    entries.push({name,method,length,crc,compressed,data});cursor+=46+n+extra+comment;
  }
  if(cursor!==end)throw Error(tr("Directory ZIP incoerente."));
  for(const entry of entries){const target=path.resolve(directory,...entry.name.split('/'));if(!target.startsWith(path.resolve(directory)+path.sep))throw Error('Zip Slip.');if(entry.name.endsWith('/')){await fs.promises.mkdir(target,{recursive:true});continue;}
    const input=zip.subarray(entry.data,entry.data+entry.compressed),output=entry.method===0?input:await new Promise((resolve,reject)=>zlib.inflateRaw(input,{maxOutputLength:Math.max(1,entry.length)},(error,data)=>error?reject(error):resolve(data)));
    if(output.length!==entry.length||crc32(output)!==entry.crc)throw Error(tr("Integrità ZIP fallita."));await fs.promises.mkdir(path.dirname(target),{recursive:true});await fs.promises.writeFile(target,output,{flag:'wx'});
  }
}
function manifestInfo(manifest,language='it'){const tr=(key,vars)=>t(language,key,vars);if(!manifest||![2,3].includes(manifest.manifest_version)||typeof manifest.name!=='string'||!manifest.name.trim()||manifest.name.length>256||/[\x00-\x1f\x7f]/.test(manifest.name)||typeof manifest.version!=='string'||!/^[0-9]+(?:\.[0-9]+){0,3}$/.test(manifest.version))throw Error(tr("Manifest non valido."));
  const permissions=[];for(const field of ['permissions','host_permissions','optional_permissions','optional_host_permissions']){if(manifest[field]!==undefined&&(!Array.isArray(manifest[field])||manifest[field].length>1000||manifest[field].some(value=>typeof value!=='string'||value.length>2048)))throw Error(tr("Permessi non validi."));permissions.push(...(manifest[field]||[]));}
  if(manifest.content_scripts!==undefined&&(!Array.isArray(manifest.content_scripts)||manifest.content_scripts.length>1000))throw Error(tr("Content script non valido."));
  for(const script of manifest.content_scripts||[]){if(!script||!Array.isArray(script.matches)||script.matches.length>1000||script.matches.some(value=>typeof value!=='string'||value.length>2048))throw Error(tr("Content script non valido."));permissions.push(...script.matches);}
  if(permissions.join(', ').length>24000||permissions.some(value=>/[\x00-\x1f\x7f]/.test(value)))throw Error(tr("Riepilogo permessi troppo grande o non valido."));
  return {name:manifest.name,permissions:[...new Set(permissions)].join(', ')};
}
module.exports={extensionId,crxPayload,safeEntry,extractZip,crc32,keyId,manifestInfo,MAX_CRX};
