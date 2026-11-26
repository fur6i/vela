'use strict';
const path=require('node:path');
// A small trusted view above the page, rather than page DOM or a modal menu.
// The website keeps keyboard focus while these suggestions are visible.
class CredentialMenu{
  constructor({getWindow,WebContentsView,ipcMain,appearance=()=>({})}){
    Object.assign(this,{getWindow,WebContentsView,ipcMain,appearance});this.generation=0;this.template=[];
    this.handler=(event,value)=>{
      if(event.sender!==this.view?.webContents||event.senderFrame!==event.sender.mainFrame||!value||value.generation!==this.generation||!Number.isInteger(value.index))return;
      if(value.index===-1){this.hide();return;}
      const item=this.template[value.index];if(!item?.click||item.enabled===false||!this.view.getVisible())return;
      if(this.confirmation){item.click();this.hide();return;}
      this.hide();item.click();
    };
    ipcMain.on('vela:credential-choice',this.handler);
  }
  buildFromTemplate(template){return {popup:options=>this.show(template,options),closePopup:()=>{if(!this.confirmation)this.hide();}};}
  confirmSave({title,origin,username,cancel,save,tabId}){
    this.hide();
    return new Promise(resolve=>{
      const timer=setTimeout(()=>this.hide(),60000);
      timer.unref();
      this.confirmation={title,origin,username,tabId,resolve,timer};
      void this.show([{label:cancel,click:()=>resolve(false)},{label:save,click:()=>resolve(true)}],{x:0,y:0}).catch(()=>this.hide());
    });
  }
  layoutConfirmation(){
    const win=this.getWindow();
    if(!this.confirmation||!this.view?.getVisible()||!win||win.isDestroyed())return;
    const [width,height]=win.getContentSize(),w=Math.min(340,width-16);
    this.view.setBounds({x:width-w-12,y:70,width:w,height:Math.min(152,height-78)});
  }
  async show(template,{x,y}){
    const win=this.getWindow();if(!win||win.isDestroyed()){this.hide();return;}
    this.template=template;const generation=++this.generation;
    if(!this.view){
      this.view=new this.WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false,webSecurity:true,preload:path.join(__dirname,'credential-menu-preload.cjs')}});
      this.view.setBorderRadius(14);this.view.setBackgroundColor('#00000000');
      const wc=this.view.webContents;wc.setWindowOpenHandler(()=>({action:'deny'}));wc.on('will-navigate',event=>event.preventDefault());wc.on('will-frame-navigate',event=>event.preventDefault());wc.on('will-attach-webview',event=>event.preventDefault());
      this.loading=wc.loadFile(path.join(__dirname,'credential-menu.html'));
    }
    try{
      await this.loading;if(generation!==this.generation||win.isDestroyed()||this.view.webContents.isDestroyed())return;
      const [width,height]=win.getContentSize(),w=Math.min(360,width-16),h=Math.min(390,template.reduce((sum,item)=>sum+(item.type==='separator'?9:36),16));
      this.view.setBounds({x:Math.max(8,Math.min(x,width-w-8)),y:Math.max(68,Math.min(y,height-h-8)),width:w,height:h});
      const confirmation=this.confirmation&&{title:this.confirmation.title,origin:this.confirmation.origin,username:this.confirmation.username};
      this.view.webContents.send('vela:credential-choices',{generation,...this.appearance(),confirmation,items:template.map(item=>({label:item.label||'',separator:item.type==='separator',enabled:Boolean(item.click)&&item.enabled!==false}))});
      win.contentView.addChildView(this.view);this.view.setVisible(true);
      if(confirmation){this.layoutConfirmation();this.view.webContents.focus();}
    }catch{this.hide();}
  }
  hide(){
    this.generation++;this.template=[];
    if(this.confirmation){clearTimeout(this.confirmation.timer);this.confirmation.resolve(false);this.confirmation=null;}
    if(this.view&&!this.view.webContents.isDestroyed()){this.view.setVisible(false);this.view.webContents.send('vela:credential-choices',{generation:this.generation,items:[]});}
  }
  destroy(){this.hide();this.ipcMain.removeListener('vela:credential-choice',this.handler);if(this.view&&!this.view.webContents.isDestroyed())this.view.webContents.close();this.view=null;}
}
module.exports={CredentialMenu};
