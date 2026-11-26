'use strict';
const {loginOrigin,credential}=require('./password-vault.cjs');
class CredentialController{
  constructor({vault,authenticate,getWindow,getActive,Menu,confirmSave,translate,onError,enabled=true}){Object.assign(this,{vault,authenticate,getWindow,getActive,Menu,confirmSave,translate,onError,enabled});this.pending=null;this.authenticating=false;this.menu=null;}
  clear(){this.epoch=(this.epoch||0)+1;this.pending=null;this.menu?.closePopup();this.menu=null;}
  valid(event){const wc=this.getActive();return this.enabled&&wc&&!wc.isDestroyed()&&event.sender===wc&&event.senderFrame===wc.mainFrame&&event.senderFrame.url===wc.getURL()&&this.getWindow()?.isVisible();}
  current(pending){const wc=this.getActive();return this.enabled&&this.pending===pending&&Date.now()-pending.time<120000&&wc===pending.wc&&!wc.isDestroyed()&&wc.mainFrame===pending.frame&&wc.getURL()===pending.url&&loginOrigin(wc.getURL())===pending.origin;}
  async authorize(){
    if(!this.enabled||this.authenticating)return false;
    this.authenticating=true;const epoch=this.epoch;
    try{return await this.vault.available()&&Boolean(await this.authenticate())&&this.epoch===epoch&&this.enabled&&!!this.getWindow()&&!this.getWindow().isDestroyed?.();}finally{this.authenticating=false;}
  }
  async fill(pending,id){
    try{
      if(!this.current(pending))return false;
      if(!await this.authorize()){
        if(this.current(pending))this.onError('Compilazione annullata. Verifica l’autenticazione Windows e riprova.');
        return false;
      }
      if(!this.current(pending))return false;
      const item=await this.vault.get(id,pending.origin);if(!item||!this.current(pending))return false;
      pending.wc.focus?.();
      pending.frame.send('vela:credential-fill',{documentId:pending.documentId,request:pending.request,origin:pending.origin,username:item.username,password:item.password});
      this.clear();return true;
    }catch{this.onError();return false;}
  }
  async focus(event,data){
    if(!this.valid(event)||this.authenticating||this.saving||!data||typeof data.url!=='string'||!data.url.startsWith('https:')||data.url!==event.senderFrame.url||!/^[-a-f0-9]{36}$/.test(data.documentId)||!/^[-a-f0-9]{36}$/.test(data.request))return;
    const win=this.getWindow(),wc=event.sender;if(!win.isFocused()&&!wc.isFocused())return;
    try{
      const origin=loginOrigin(data.url);this.clear();
      const pending={wc,frame:event.senderFrame,url:data.url,origin,documentId:data.documentId,request:data.request,time:Date.now(),capture:false};this.pending=pending;
      const items=(await this.vault.list(origin)).slice(0,8),tr=this.translate;
      if(!this.current(pending))return;
      const choices=items.map(item=>({label:(item.username||tr('Senza nome utente')).replace(/[&\r\n\t]/g,' ').slice(0,80),click:()=>void this.fill(pending,item.id)}));
      if(!choices.length)choices.push({label:tr('Nessun account salvato per questo sito'),enabled:false});
      const template=[{label:origin.replace(/^https:\/\//,''),enabled:false},...choices,{type:'separator'},{label:tr('Salva credenziali di questo modulo…'),click:()=>{if(this.current(pending)){pending.capture=true;pending.frame.send('vela:credential-capture',{documentId:pending.documentId,request:pending.request,origin});}}}];
      this.menu=this.Menu.buildFromTemplate(template);const bounds=wc.getOwnerBrowserWindow()?.getContentBounds();
      // WebContentsView bounds are supplied by the integration; coordinates are
      // bounded and cannot place a browser menu outside its owning window.
      const viewBounds=this.getViewBounds?.()||{x:8,y:68};
      const x=Math.round(Math.min(Math.max(Number(data.x)||0,0),Math.max(0,(bounds?.width||800)-220))+viewBounds.x);
      const y=Math.round(Math.min(Math.max(Number(data.y)||0,0),Math.max(0,(bounds?.height||600)-220))+viewBounds.y);
      this.menu.popup({window:win,x,y});
    }catch{this.onError();}
  }
  async captured(event,data){
    const pending=this.pending;
    try{
      if(!pending?.capture||!this.valid(event)||!this.current(pending)||data?.documentId!==pending.documentId||data.request!==pending.request||data.origin!==pending.origin)return false;
      pending.capture=false;
      if(!data.password){this.onError('Inserisci prima la password nel modulo.');return false;}
      return await this.offerSave(credential(data),()=>this.current(pending));
    }catch{this.onError();return false;}
  }
  async submitted(event,data){
    if(!this.valid(event)||this.authenticating||this.saving)return false;
    try{
      const wc=event.sender,item=credential(data);
      if(!data||item.origin!==loginOrigin(event.senderFrame.url)||!this.getWindow().isFocused())return false;
      return await this.offerSave(item,()=>this.getActive()===wc&&!wc.isDestroyed());
    }catch{return false;}
  }
  async offerSave(item,stillActive){
    if(this.saving)return false;
    this.saving=true;
    try{
      const tr=this.translate;
      const accepted=await this.confirmSave({title:tr('Salvare le credenziali?'),origin:item.origin,username:item.username,cancel:tr('Annulla'),save:tr('Salva')});
      if(!accepted||!stillActive())return false;
      if(!await this.authorize()){this.onError('Autenticazione Windows richiesta o annullata.');return false;}
      if(!stillActive())return false;
      await this.vault.merge([item]);this.clear();this.onStatus?.('Credenziali salvate.');return true;
    }finally{item.password='';this.saving=false;}
  }
}
module.exports={CredentialController};
