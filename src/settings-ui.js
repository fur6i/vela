'use strict';
(()=>{
  const tabs=[...document.querySelectorAll('[data-settings-tab]')];
  const body=document.querySelector('.settings-body');
  function selectTab(selected,focus=false){
    for(const tab of tabs){
      const active=tab===selected;
      tab.tabIndex=active?0:-1;
      tab.setAttribute('aria-selected',String(active));
      $(tab.getAttribute('aria-controls')).hidden=!active;
    }
    body.scrollTop=0;
    if(focus)selected.focus();
  }
  for(const tab of tabs){
    tab.onclick=()=>selectTab(tab);
    tab.onkeydown=event=>{
      const keys=['ArrowLeft','ArrowRight','Home','End'];
      if(!keys.includes(event.key))return;
      event.preventDefault();
      const index=tabs.indexOf(tab),delta=event.key==='ArrowLeft'?-1:1;
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+delta+tabs.length)%tabs.length;
      selectTab(tabs[next],true);
    };
  }
  selectTab(tabs[0]);

  const switches={
    'suggestions-setting':'remote-suggestions',
    'settings-adblock':'adblock-enabled',
    'settings-tracking':'privacy-enabled',
    'settings-tracker-exception':'privacy-site',
  };
  for(const [id,action] of Object.entries(switches))$(id).onchange=event=>command(action,event.target.checked);
  $('page-scrollbar-setting').onchange=event=>command('page-scrollbar',event.target.value);
  let listsKey,busy=false;
  const form=$('tracker-list-form'),importButton=$('tracker-list-import'),status=$('tracker-list-status');
  function setBusy(value){
    busy=value;
    const disabled=busy||Boolean(current?.privateMode)||(current?.customTrackers?.lists.length||0)>=12;
    importButton.disabled=disabled;
    form.querySelector('button').disabled=disabled;
  }
  async function addList(action,content){
    if(busy)return;
    setBusy(true);
    try{
      const result=await api.command(action,content);
      if(result.cancelled)return;
      status.textContent=tr('Domini aggiunti: {v0}. Righe ignorate: {v1}.',{v0:result.count,v1:result.skipped});
      if(content){form.reset();$('settings-tracker-editor').open=false;}
    }catch(error){
      status.textContent=String(error.message).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,'');
    }finally{setBusy(false);}
  }
  form.onsubmit=event=>{event.preventDefault();void addList('tracker-list-add',{name:$('tracker-list-name').value,text:$('tracker-list-content').value});};
  importButton.onclick=()=>void addList('tracker-list-import');
  api.subscribe(state=>{
    const settings=state.settings,tab=state.tabs.find(tab=>tab.id===state.activeId);
    const canExcept=Boolean(settings.privacyEnabled&&/^https?:/.test(tab?.url));
    $('settings-tracker-exception').disabled=!canExcept;
    $('settings-tracker-exception').checked=canExcept&&!state.privacy.enabled;
    $('suggestions-setting').checked=!state.privateMode&&settings.remoteSuggestions!==false;
    $('suggestions-setting').disabled=state.privateMode;
    $('settings-adblock').checked=settings.adblockEnabled;
    $('settings-tracking').checked=settings.privacyEnabled;
    $('page-scrollbar-setting').value=settings.pageScrollbar||'edge';
    $('settings-custom-blocked').textContent=state.privateMode?tr('Le liste personali sono disponibili nelle finestre normali.'):tr('Richieste bloccate dalle tue liste: {v0}',{v0:(state.customTrackers?.blocked||0).toLocaleString(localeTag(language))});
    setBusy(busy);
    const lists=state.customTrackers?.lists||[];
    const key=JSON.stringify([language,lists]);
    if(key===listsKey)return;
    listsKey=key;
    $('settings-tracker-lists').replaceChildren(...lists.map(list=>{
      const row=document.createElement('div');row.className='tracker-list-row';
      const label=document.createElement('div'),name=document.createElement('strong'),count=document.createElement('small');
      name.textContent=list.name;count.textContent=tr('{v0} domini',{v0:list.count.toLocaleString(localeTag(language))});label.append(name,count);
      const enabled=document.createElement('input');enabled.type='checkbox';enabled.setAttribute('role','switch');enabled.setAttribute('aria-label',list.name);enabled.checked=list.enabled;
      enabled.onchange=()=>command('tracker-list-toggle',{id:list.id,enabled:enabled.checked});
      const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent=tr('Elimina');
      remove.onclick=()=>command('tracker-list-remove',{id:list.id});
      row.append(label,enabled,remove);return row;
    }));
  });
})();
