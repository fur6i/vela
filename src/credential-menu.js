'use strict';
const choices=document.getElementById('choices');let generation;
window.credentialChoices.subscribe(data=>{
  generation=data.generation;document.documentElement.style.colorScheme=data.dark?'dark':'light';
  if(/^#[a-f0-9]{6}$/i.test(data.color||''))document.documentElement.style.setProperty('--menu-color',data.color);else document.documentElement.style.removeProperty('--menu-color');
  choices.replaceChildren();
  const confirmation=data.confirmation;
  choices.classList.toggle('save-confirmation',Boolean(confirmation));
  choices.setAttribute('role',confirmation?'dialog':'menu');
  if(confirmation){
    choices.setAttribute('aria-label',confirmation.title);
    for(const [tag,value] of [['h2',confirmation.title],['strong',confirmation.origin],['p',confirmation.username]]){
      if(!value)continue;
      const row=document.createElement(tag);
      row.textContent=value;
      row.dir=tag==='strong'?'ltr':'auto';
      choices.append(row);
    }
  }else choices.removeAttribute('aria-label');
  const actions=confirmation?document.createElement('div'):choices;
  if(confirmation){actions.className='save-actions';choices.append(actions);}
  data.items.forEach((item,index)=>{
    if(item.separator){choices.append(document.createElement('hr'));return;}
    const node=document.createElement(item.enabled?'button':'div');node.textContent=item.label;
    if(item.enabled){node.type='button';if(!confirmation)node.setAttribute('role','menuitem');node.onclick=event=>{if(event.isTrusted)window.credentialChoices.choose(data.generation,index);};}
    else node.className='heading';actions.append(node);
  });
  if(confirmation)actions.querySelector('button')?.focus();
});
addEventListener('keydown',event=>{
  if(event.key==='Escape')window.credentialChoices.choose(generation,-1);
  const buttons=[...choices.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
});
