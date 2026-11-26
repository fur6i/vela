const {test}=require('node:test'),assert=require('node:assert/strict');
const {CredentialMenu}=require('../src/credential-menu.cjs');
test('credential popover isolates IPC, rejects stale choices and keeps the page focus',async()=>{
  const handlers={},packets=[];let clicks=0,focused=false;
  class View{
    constructor(options){this.options=options;this.visible=false;this.webContents={isDestroyed:()=>false,mainFrame:{},setWindowOpenHandler:fn=>this.guard=fn,on(){},loadFile:async()=>{},send:(name,data)=>packets.push({name,data}),close(){},focus:()=>focused=true};}
    setBorderRadius(){}setBackgroundColor(){}setVisible(value){this.visible=value;}getVisible(){return this.visible;}setBounds(box){this.bounds=box;}
  }
  const ipcMain={on:(name,handler)=>handlers[name]=handler,removeListener:name=>delete handlers[name]};
  const win={isDestroyed:()=>false,getContentSize:()=>[1000,700],contentView:{addChildView(){}}};
  const menu=new CredentialMenu({getWindow:()=>win,WebContentsView:View,ipcMain});
  await menu.show([{label:'example.test',enabled:false},{label:'fixture-user',click:()=>clicks++}],{x:990,y:690});
  const view=menu.view,event={sender:view.webContents,senderFrame:view.webContents.mainFrame},generation=menu.generation;
  assert.equal(view.options.webPreferences.sandbox,true);assert.equal(view.options.webPreferences.contextIsolation,true);assert.equal(view.options.webPreferences.nodeIntegration,false);assert.equal(focused,false);assert.deepEqual(view.guard({url:'https://other.test'}),{action:'deny'});
  assert.ok(view.bounds.x+view.bounds.width<=1000&&view.bounds.y+view.bounds.height<=700);assert.ok(!JSON.stringify(packets).includes('password'));
  const choose=handlers['vela:credential-choice'];choose({...event,sender:{}},{generation,index:1});choose(event,{generation:generation-1,index:1});assert.equal(clicks,0);
  choose(event,{generation,index:1});assert.equal(clicks,1);assert.equal(view.getVisible(),false);choose(event,{generation,index:1});assert.equal(clicks,1);
  const details={title:'Save credentials?',origin:'https://example.test',username:'demo',cancel:'Cancel',save:'Save'};
  const decision=menu.confirmSave(details);await menu.loading;
  const prompt=packets.at(-1).data;
  assert.deepEqual(prompt.confirmation,{title:details.title,origin:details.origin,username:details.username});
  choose(event,{generation,index:1});assert.equal(view.getVisible(),true,'an old choice cannot approve saving');
  choose(event,{generation:prompt.generation,index:1});assert.equal(await decision,true);
  const dismissed=menu.confirmSave(details);await menu.loading;menu.hide();
  assert.equal(await dismissed,false);
  menu.destroy();assert.equal(handlers['vela:credential-choice'],undefined);
});
