try{var t=localStorage.getItem('fahad-theme');document.documentElement.dataset.theme=['light','dark'].includes(t)?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.documentElement.classList.add('js');
document.addEventListener('DOMContentLoaded', () => {
'use strict';
(() => {
 const root=document.documentElement, preference=matchMedia('(prefers-color-scheme: dark)'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let manual=false;try{manual=['dark','light'].includes(localStorage.getItem('fahad-theme'))}catch(e){}
 const buttons=[...document.querySelectorAll('.theme')];
 function setTheme(theme){root.dataset.theme=theme;buttons.forEach(b=>{b.setAttribute('aria-label','Switch to '+(theme==='dark'?'light':'dark')+' mode');b.title=b.getAttribute('aria-label')});document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#101112':'#f5f3ee'}
 setTheme(root.dataset.theme||(preference.matches?'dark':'light'));
 buttons.forEach(b=>b.addEventListener('click',()=>{const next=root.dataset.theme==='dark'?'light':'dark';manual=true;try{localStorage.setItem('fahad-theme',next)}catch(e){}setTheme(next)}));
 preference.addEventListener('change',e=>{if(!manual)setTheme(e.matches?'dark':'light')});
 window.addEventListener('storage',e=>{if(e.key!=='fahad-theme')return;manual=['dark','light'].includes(e.newValue);setTheme(manual?e.newValue:preference.matches?'dark':'light')});
 const menu=document.getElementById('mobile-menu'),toggle=document.querySelector('.menu-toggle'),close=menu.querySelector('.menu-close');
 let timer,scroll=0,target=null;
 function finishClose(){clearTimeout(timer);menu.classList.remove('is-open');if(menu.open)menu.close();document.body.classList.remove('menu-open');Object.assign(document.body.style,{position:'',top:'',width:''});window.scrollTo({top:scroll,behavior:'instant'});toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation menu');toggle.focus({preventScroll:true});if(target){const section=document.querySelector(target);history.replaceState(null,'',target);if(section){section.scrollIntoView({behavior:reduced.matches?'instant':'smooth'});section.setAttribute('tabindex','-1');section.focus({preventScroll:true});section.addEventListener('blur',()=>section.removeAttribute('tabindex'),{once:true})}target=null}}
 function closeMenu(){if(!menu.open)return;menu.classList.remove('is-open');clearTimeout(timer);if(reduced.matches)finishClose();else timer=setTimeout(finishClose,220)}
 function openMenu(){if(menu.open)return;clearTimeout(timer);scroll=window.scrollY;menu.showModal();document.body.classList.add('menu-open');Object.assign(document.body.style,{position:'fixed',top:'-'+scroll+'px',width:'100%'});toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Close navigation menu');requestAnimationFrame(()=>menu.classList.add('is-open'));close.focus({preventScroll:true})}
 toggle.addEventListener('click',()=>menu.open?closeMenu():openMenu());close.addEventListener('click',closeMenu);menu.addEventListener('cancel',e=>{e.preventDefault();closeMenu()});
 menu.addEventListener('click',e=>{if(e.target!==menu)return;const r=menu.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeMenu()});
 menu.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();target=a.getAttribute('href');closeMenu()}));
 menu.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const items=[...menu.querySelectorAll('button,a[href]')],first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}});
 matchMedia('(min-width:721px)').addEventListener('change',e=>{if(e.matches&&menu.open)finishClose()});
 const photo=document.querySelector('.portrait');photo.addEventListener('load',()=>photo.parentElement.classList.add('has-photo'));photo.addEventListener('error',()=>photo.parentElement.classList.remove('has-photo'));photo.src=photo.dataset.src;
 document.getElementById('year').textContent=new Date().getFullYear();
 if('IntersectionObserver' in window&&!reduced.matches){const items=[...document.querySelectorAll('.reveal')],observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target)}}),{threshold:.08});items.forEach(el=>{if(el.getBoundingClientRect().top>innerHeight)el.classList.add('ready');observer.observe(el)});reduced.addEventListener('change',e=>{if(e.matches){items.forEach(el=>el.classList.add('visible'));observer.disconnect()}});window.addEventListener('beforeprint',()=>items.forEach(el=>el.classList.add('visible')))}
 const fine=matchMedia('(hover:hover) and (pointer:fine)'),hero=document.querySelector('.hero'),spot=document.querySelector('.spotlight');let frame=0;
 hero.addEventListener('pointermove',e=>{if(!fine.matches||reduced.matches)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const r=hero.getBoundingClientRect();spot.style.setProperty('--x',(e.clientX-r.left)+'px');spot.style.setProperty('--y',(e.clientY-r.top)+'px');spot.classList.add('active')})});hero.addEventListener('pointerleave',()=>{cancelAnimationFrame(frame);spot.classList.remove('active')});
})();
});
