// Run only after npm run check and npm run smoke pass. Does not push or publish.
const fs=require('node:fs'),path=require('node:path');const {directories,rootFiles,audit}=require('./audit-release.cjs');
const source=path.resolve(__dirname,'..'),target=path.resolve('E:\\vela-github-ready');
if(process.platform!=='win32'||target.toLowerCase()!=='e:\\vela-github-ready'||source.toLowerCase()===target.toLowerCase())throw Error('Unexpected export target.');
const before=audit(source); // Fail before touching the destination if source contents are unsafe.
if(fs.existsSync(target)){if(fs.lstatSync(target).isSymbolicLink())throw Error('Export target must not be a reparse point.');fs.rmSync(target,{recursive:true,force:true});}
fs.mkdirSync(target);
for(const relative of [...directories,...rootFiles])fs.cpSync(path.join(source,relative),path.join(target,relative),{recursive:true,errorOnExist:true,force:false,dereference:false});
const after=audit(target);if(before.contentHash!==after.contentHash||before.total!==after.total||before.bytes!==after.bytes)throw Error('Copied source verification failed.');
console.log(JSON.stringify({target,files:after.total,bytes:after.bytes,scan:'PASS',contentHash:after.contentHash,root:[...directories.map(value=>value+'/'),...rootFiles]},null,2));
