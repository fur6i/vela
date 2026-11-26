'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const MAX_BYTES=8*1024*1024,MAX_ENTRIES=2000;
function loginOrigin(value){
  if(typeof value!=='string'||value.length>4096)throw Error('Invalid HTTPS origin');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid HTTPS origin');
  return url.origin;
}
function credential(value){
  if(!value||typeof value.username!=='string'||value.username.length>512||typeof value.password!=='string'||!value.password||value.password.length>4096)throw Error('Invalid credential');
  return {origin:loginOrigin(value.origin),username:value.username,password:value.password};
}
// No plaintext index or persistent decrypted cache. The DPAPI-wrapped key is part
// of the authenticated envelope, so a copied vault alone cannot be unlocked.
class PasswordVault{
  constructor(file,storage){this.file=file;this.storage=storage;this.queue=Promise.resolve();}
  async available(){return process.platform==='win32'&&await this.storage.isAsyncEncryptionAvailable();}
  async read(){
    if(!await this.available())throw Error('Windows encryption unavailable');
    if(!fs.existsSync(this.file))return [];
    const stat=fs.lstatSync(this.file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_BYTES)throw Error('Invalid vault');
    let key,plain;
    try{
      const env=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(env.version!==1||typeof env.key!=='string'||env.key.length>32768||typeof env.iv!=='string'||typeof env.tag!=='string'||typeof env.data!=='string')throw Error('Invalid vault');
      const unwrapped=await this.storage.decryptStringAsync(Buffer.from(env.key,'base64'));
      key=Buffer.from(unwrapped.result,'base64');
      const iv=Buffer.from(env.iv,'base64'),tag=Buffer.from(env.tag,'base64');
      if(key.length!==32||iv.length!==12||tag.length!==16)throw Error('Invalid vault');
      const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(Buffer.from('Vela-vault-v1'));decipher.setAuthTag(tag);
      plain=Buffer.concat([decipher.update(Buffer.from(env.data,'base64')),decipher.final()]);
      const entries=JSON.parse(plain.toString('utf8'));
      if(!Array.isArray(entries)||entries.length>MAX_ENTRIES)throw Error('Invalid vault');
      const ids=new Set();
      return entries.map(item=>{if(!/^[a-f0-9-]{36}$/.test(item.id)||ids.has(item.id))throw Error('Invalid vault');ids.add(item.id);return {id:item.id,...credential(item)};});
    }catch{throw Error('Vault could not be decrypted');}finally{key?.fill(0);plain?.fill(0);}
  }
  async write(entries){
    if(!await this.available()||entries.length>MAX_ENTRIES)throw Error('Vault unavailable or full');
    const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),plain=Buffer.from(JSON.stringify(entries));
    let temp;
    try{
      const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('Vela-vault-v1'));
      const data=Buffer.concat([cipher.update(plain),cipher.final()]);
      const wrapped=await this.storage.encryptStringAsync(key.toString('base64'));
      const envelope=JSON.stringify({version:1,key:wrapped.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});
      if(Buffer.byteLength(envelope)>MAX_BYTES)throw Error('Vault full');
      fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
      if(fs.existsSync(this.file)&&fs.lstatSync(this.file).isSymbolicLink())throw Error('Invalid vault path');
      temp=this.file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';fs.writeFileSync(temp,envelope,{flag:'wx',mode:0o600});
      fs.renameSync(temp,this.file);
    }finally{key.fill(0);plain.fill(0);if(temp)fs.rmSync(temp,{force:true});}
  }
  async list(origin){return (await this.read()).filter(item=>!origin||item.origin===loginOrigin(origin)).map(({id,origin,username})=>({id,origin,username}));}
  async get(id,origin){return (await this.read()).find(item=>item.id===id&&item.origin===loginOrigin(origin));}
  mutate(operation){const result=this.queue.then(operation);this.queue=result.catch(()=>{});return result;}
  async merge(values){
    if(!Array.isArray(values)||values.length>MAX_ENTRIES)throw Error('Too many credentials');
    const valid=values.map(credential);return this.mutate(async()=>{const entries=await this.read();let added=0,updated=0;
    for(const item of valid){const existing=entries.find(old=>old.origin===item.origin&&old.username===item.username);if(existing){if(existing.password!==item.password){existing.password=item.password;updated++;}}else{entries.push({id:crypto.randomUUID(),...item});added++;}}
    if(entries.length>MAX_ENTRIES)throw Error('Vault full');await this.write(entries);return {added,updated};});
  }
  remove(id){return this.mutate(async()=>{const entries=await this.read();await this.write(entries.filter(item=>item.id!==id));});}
}
module.exports={PasswordVault,loginOrigin,credential,MAX_BYTES,MAX_ENTRIES};
