'use strict';
// This file runs only in the local CSP-protected UI; websites never see it.
(()=>{
  let generation=0,lockTimer;
  const status=(id,text)=>{$(id).textContent=text;};
  const error=()=>tr('Autenticazione annullata o operazione non riuscita. Verifica la password Windows e il file di importazione.');
  function lock(){generation++;clearTimeout(lockTimer);$('vault-list').replaceChildren();$('vault-form').reset();$('vault-form').hidden=true;status('vault-status',tr('Vault bloccato.'));}
  function show(entries){
    $('vault-list').replaceChildren();$('vault-form').hidden=false;
    for(const item of entries){
      const row=document.createElement('div');row.className='vault-row';const label=document.createElement('span');label.textContent=item.origin+' · '+(item.username||tr('Senza nome utente'));
      const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent=tr('Elimina');
      remove.onclick=async()=>{const currentGeneration=generation;remove.disabled=true;try{const list=await api.command('vault-delete',item.id);if(currentGeneration===generation)show(list);}catch{if(currentGeneration===generation)status('vault-status',error());}finally{remove.disabled=false;}};
      row.append(label,remove);$('vault-list').append(row);
    }
    status('vault-status',entries.length?tr('Seleziona un campo di accesso su un sito HTTPS per compilare con Windows.'):tr('Nessuna credenziale salvata.'));
    clearTimeout(lockTimer);lockTimer=setTimeout(lock,60000);
  }
  $('settings-passwords').onclick=()=>setPanel('passwords');$('settings-arc').onclick=()=>setPanel('arc');$('vault-lock').onclick=lock;
  $('vault-unlock').onclick=async()=>{const token=++generation;const button=$('vault-unlock');button.disabled=true;try{const entries=await api.command('vault-list');if(generation===token&&panel==='passwords')show(entries);}catch{if(generation===token)status('vault-status',error());}finally{button.disabled=false;}};
  $('vault-form').onsubmit=async event=>{event.preventDefault();const token=generation,button=event.submitter;button.disabled=true;
    const value={origin:$('vault-origin').value,username:$('vault-username').value,password:$('vault-password').value};$('vault-password').value='';
    try{const entries=await api.command('vault-save',value);if(token===generation){$('vault-form').reset();show(entries);}}catch{if(token===generation)status('vault-status',error());}finally{value.password='';button.disabled=false;}
  };
  $('arc-import').onclick=async()=>{const button=$('arc-import');button.disabled=true;try{const result=await api.command('arc-import');status('arc-status',result.cancelled?tr('Importazione annullata.'):tr('Schede importate: {links}. Schede ricollocate: {moved}. Credenziali aggiunte: {passwords}, aggiornate: {updated}, escluse: {skipped}.',result));}catch{status('arc-status',error());}finally{button.disabled=false;}};
  // Blur can be the native Windows authentication prompt. A pending operation
  // still checks its panel generation before rendering any returned metadata.
  addEventListener('pagehide',lock);window.VelaVaultUI=Object.freeze({lock});
  api.shortcut(name=>{if(name==='vault-lock')lock();});
  api.subscribe(state=>{for(const id of ['settings-passwords','settings-arc','vault-unlock','arc-import'])$(id).disabled=state.privateMode;});
})();
