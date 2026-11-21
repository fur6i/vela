const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
module.exports=async({app,win,createTab,state,sidebarSurface,dockSurface,diagnostics})=>{
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Performance fixture</title><h1>Local application</h1>'+('<p>Retained application content</p>'.repeat(400))+'<script>window.retainedData=new Uint8Array(16*1024*1024).fill(42)</script>');});
  const timer=setTimeout(()=>app.exit(1),60000);
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));win.showInactive();
    const samples=[];
    async function sample(scenario){
      await wait(2500);app.getAppMetrics();await wait(3000);const metrics=app.getAppMetrics();
      const uiNodes=await Promise.all([win.webContents,sidebarSurface.webContents,dockSurface.webContents].map(wc=>wc.getURL()?wc.executeJavaScript('document.getElementsByTagName("*").length'):0));
      samples.push({scenario,workingSetMiB:+(metrics.reduce((sum,p)=>sum+p.memory.workingSetSize,0)/1024).toFixed(1),privateMiB:+(metrics.reduce((sum,p)=>sum+(p.memory.privateBytes||0),0)/1024).toFixed(1),cpuPercent:+metrics.reduce((sum,p)=>sum+p.cpu.percentCPUUsage,0).toFixed(3),processes:metrics.length,liveTabs:state().liveTabs,uiNodes,uiStatePackets:diagnostics.uiStatePackets||0});
    }
    await sample('Home, no website tabs');
    for(let index=0;index<8;index++){const tab=createTab(`http://127.0.0.1:${server.address().port}/page-${index}`);await new Promise(resolve=>tab.view.webContents.once('did-finish-load',resolve));}
    for(let index=0;index<20;index++)createTab(`http://127.0.0.1:${server.address().port}/dormant-${index}`,{lazy:true,background:true});
    await sample('8 loaded applications (16 MiB retained data each), 20 dormant tabs');
    const report={version:app.getVersion(),electron:process.versions.electron,chromium:process.versions.chrome,notes:'Local synthetic workload; identical retained pages, no automatic suspension. Working sets include shared pages; private bytes reported separately. CPU measured over 3 seconds.',samples};
    const name=process.argv.includes('--baseline')?'performance-before.json':'performance-after.json';
    fs.writeFileSync(path.join(app.isPackaged?app.getPath('temp'):path.join(__dirname,'..'),name),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
    clearTimeout(timer);server.close();app.exit(0);
  }catch(error){console.error(error);clearTimeout(timer);server.close();app.exit(1);}
};
