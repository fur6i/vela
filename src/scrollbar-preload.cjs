'use strict';
const {ipcRenderer}=require('electron');
if(process.isMainFrame){
  let frame,timer,level=0;
  ipcRenderer.on('vela:scrollbar-edge',(_event,visible)=>{
    const root=document.documentElement;
    if(!root)return;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    const start=level,target=visible===true?100:0;
    const paint=value=>{level=value;root.style.setProperty('--vela-edge-visibility',value+'%','important');};
    if(start===target||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches){paint(target);return;}
    const began=performance.now();
    const duration=200;
    const step=now=>{
      const progress=Math.max(0,Math.min(1,(now-began)/duration));
      paint(start+(target-start)*(1-(1-progress)**3));
      if(progress<1)frame=requestAnimationFrame(step);
    };
    frame=requestAnimationFrame(step);
    // Occluded views can stop receiving animation frames.
    timer=setTimeout(()=>{cancelAnimationFrame(frame);paint(target);},duration+30);
  });
}
