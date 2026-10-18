try{var t=localStorage.getItem('fahad-theme');document.documentElement.dataset.theme=['light','dark'].includes(t)?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.documentElement.classList.add('js');
// Intro: once per browser session, never with reduced motion. CSS hides it after 6s regardless.
try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&!sessionStorage.getItem('senku-intro'))document.documentElement.classList.add('intro-on')}catch(e){}
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

document.addEventListener('DOMContentLoaded', () => {
'use strict';
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),toast=document.querySelector('.toast');let toastTimer;
function say(text){toast.textContent=text;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2600)}

// Scroll progress bar and active section in the desktop navigation.
const bar=document.querySelector('.progress'),links=[...document.querySelectorAll('.desktop-nav a')];let ticking=false;
function onScroll(){ticking=false;const max=document.documentElement.scrollHeight-innerHeight;bar.style.setProperty('--progress',max>0?Math.min(1,scrollY/max):0);let current=null;links.forEach(a=>{const s=document.querySelector(a.getAttribute('href'));if(s&&s.getBoundingClientRect().top<innerHeight*.4)current=a});links.forEach(a=>{const on=a===current;a.classList.toggle('active',on);on?a.setAttribute('aria-current','location'):a.removeAttribute('aria-current')})}
addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(onScroll)}},{passive:true});addEventListener('resize',onScroll);onScroll();

// Rotating phrase in the hero heading. Screen readers keep the original phrase.
const rot=document.querySelector('.rotator');
if(rot&&!reduced.matches){const words=rot.dataset.words.split('|');let i=0;rot.parentElement.setAttribute('aria-label',rot.parentElement.textContent);rot.setAttribute('aria-hidden','true');setInterval(()=>{if(document.hidden||reduced.matches)return;rot.classList.add('out');setTimeout(()=>{i=(i+1)%words.length;rot.textContent=words[i];rot.classList.remove('out')},350)},2800)}

// Project screenshot galleries (Battle of Shinkai, Blacklist).
document.querySelectorAll('.shots').forEach(g=>{const main=g.querySelector('.shot-main'),thumbs=[...g.querySelectorAll('.shot-thumb')];
thumbs.forEach(t=>t.addEventListener('click',()=>{if(t.getAttribute('aria-pressed')==='true')return;thumbs.forEach(o=>o.setAttribute('aria-pressed',String(o===t)));const swap=()=>{main.src=t.dataset.src;main.alt=t.dataset.alt;main.classList.remove('swap')};if(reduced.matches)swap();else{main.classList.add('swap');setTimeout(swap,200)}}))});

// Play the game in a dialog on larger screens; phones go straight to the full game tab.
const modal=document.getElementById('game-modal'),frame=modal.querySelector('.game-frame'),play=document.querySelector('.play-game'),large=matchMedia('(min-width:900px) and (pointer:fine)');let opener=null;
play.addEventListener('click',e=>{if(!large.matches||typeof modal.showModal!=='function')return;e.preventDefault();opener=play;const f=document.createElement('iframe');f.src=frame.dataset.src;f.title='Battle of Shinkai game';f.allow='fullscreen; autoplay; gamepad';f.allowFullscreen=true;frame.appendChild(f);modal.showModal();document.body.classList.add('menu-open');modal.querySelector('.game-close').focus()});
function closeGame(){if(modal.open)modal.close()}
modal.querySelector('.game-close').addEventListener('click',closeGame);
modal.addEventListener('click',e=>{if(e.target===modal)closeGame()});
modal.addEventListener('close',()=>{const f=frame.querySelector('iframe');if(f)f.remove();document.body.classList.remove('menu-open');if(opener)opener.focus({preventScroll:true})});

// Copy email to the clipboard.
const copy=document.querySelector('.copy-email');
if(copy&&navigator.clipboard){copy.hidden=false;copy.addEventListener('click',()=>navigator.clipboard.writeText(copy.dataset.copy).then(()=>{copy.textContent='Copied!';say('Email copied to your clipboard.');setTimeout(()=>copy.textContent='Copy email',2000)},()=>say('Could not copy. The email is '+copy.dataset.copy)))}

// Easter egg: type "senku" anywhere.
let typed='';
addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,[contenteditable]'))return;typed=(typed+e.key.toLowerCase()).slice(-5);if(typed!=='senku')return;typed='';say('Ten billion percent excited to build with you. ✦');if(!reduced.matches)confetti()});
function confetti(){const c=document.createElement('canvas'),x=c.getContext('2d'),dpr=devicePixelRatio||1;c.className='confetti';c.width=innerWidth*dpr;c.height=innerHeight*dpr;x.scale(dpr,dpr);document.body.appendChild(c);const colors=['#88abfb','#295ac3','#e8615a','#4ade80','#f5c451'],bits=Array.from({length:140},()=>({x:innerWidth/2,y:innerHeight*.6,vx:(Math.random()-.5)*14,vy:-Math.random()*16-6,s:Math.random()*6+4,r:Math.random()*6,vr:(Math.random()-.5)*.3,c:colors[Math.random()*colors.length|0]}));let n=0;(function step(){x.clearRect(0,0,innerWidth,innerHeight);bits.forEach(b=>{b.vy+=.45;b.x+=b.vx;b.y+=b.vy;b.r+=b.vr;x.save();x.translate(b.x,b.y);x.rotate(b.r);x.fillStyle=b.c;x.fillRect(-b.s/2,-b.s/4,b.s,b.s/2);x.restore()});if(++n<150)requestAnimationFrame(step);else c.remove()})()}
});

// Intro animation: SENKU / SKYBOY decodes from random glyphs, then the page is revealed.
document.addEventListener('DOMContentLoaded', () => {
'use strict';
const root=document.documentElement,intro=document.querySelector('.intro');
const heroIn=()=>root.classList.add('hero-in');
if(!intro||!root.classList.contains('intro-on')){heroIn();return}
const glyphs='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*<>/';
let done=false,timers=[];
function decode(el,delay){const word=el.dataset.word,steps=word.length*4;let n=0;timers.push(setTimeout(()=>{const t=setInterval(()=>{n++;el.textContent=[...word].map((c,i)=>n/4>i?c:glyphs[Math.random()*glyphs.length|0]).join('');if(n>=steps){clearInterval(t);el.textContent=word;el.classList.add('set')}},45);timers.push(t)},delay))}
function finish(){if(done)return;done=true;timers.forEach(t=>{clearTimeout(t);clearInterval(t)});try{sessionStorage.setItem('senku-intro','1')}catch(e){}intro.classList.add('intro-out');heroIn();setTimeout(()=>{root.classList.remove('intro-on');intro.remove()},900);removeEventListener('keydown',finish)}
intro.querySelectorAll('.intro-word').forEach((el,i)=>decode(el,250+i*650));
intro.addEventListener('click',finish);addEventListener('keydown',finish);
timers.push(setTimeout(finish,3400));
});
