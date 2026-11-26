const path=require('node:path');
const {compileAuth}=require('../src/windows-auth-build.cjs');
module.exports=()=>compileAuth(path.join(__dirname,'..','.auth-helper'));
if(require.main===module)module.exports().then(()=>console.log('Windows authentication helper compiled.')).catch(error=>{console.error(error.message);process.exitCode=1;});
