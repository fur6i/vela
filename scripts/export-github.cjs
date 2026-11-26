// Run only after npm run check and npm run smoke pass. Does not push or publish.
const fs=require('node:fs'),path=require('node:path');const {directories,rootFiles,audit}=require('./audit-release.cjs');
const source=fs.realpathSync(path.join(__dirname,'..'));
const {version}=require('../package.json');
if(!/^\d+\.\d+\.\d+(?:-[a-z0-9]+(?:\.[a-z0-9]+)*)?$/.test(version))throw Error('Invalid export version.');
const target=path.join(path.dirname(source),`vela-github-ready-v${version}`);
if(fs.existsSync(target))throw Error('Export destination already exists. Use a fresh destination.');
const before=audit(source); // Fail before touching the destination if source contents are unsafe.
fs.mkdirSync(target);
for(const relative of [...directories,...rootFiles])fs.cpSync(path.join(source,relative),path.join(target,relative),{recursive:true,errorOnExist:true,force:false,dereference:false});
const after=audit(target);if(before.contentHash!==after.contentHash||before.total!==after.total||before.bytes!==after.bytes)throw Error('Copied source verification failed.');
console.log(JSON.stringify({target,files:after.total,bytes:after.bytes,scan:'PASS',contentHash:after.contentHash,root:[...directories.map(value=>value+'/'),...rootFiles]},null,2));
