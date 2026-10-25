try{var t=localStorage.getItem('fahad-theme');document.documentElement.dataset.theme=['light','dark'].includes(t)?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.documentElement.classList.add('js');
// Intro: once per browser session. CSS hides it after 6s regardless.
try{if(!sessionStorage.getItem('senku-intro'))document.documentElement.classList.add('intro-on')}catch(e){}
// Without the intro, start the hero entrance as the page parses so it never flashes in finished and then restarts.
if(!document.documentElement.classList.contains('intro-on'))document.documentElement.classList.add('hero-in');

document.addEventListener('DOMContentLoaded', () => {
'use strict';
const root=document.documentElement,reduced=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover:hover) and (pointer:fine)');

// Split headings into letters so they can fall into place. The real text stays in a visually hidden copy for
// screen readers and translation; the letters are aria-hidden.
document.querySelectorAll('[data-split]').forEach(el=>{
 const text=[...el.childNodes].map(n=>n.nodeName==='BR'?' ':n.textContent).join('').replace(/\s+/g,' ').trim(),sr=document.createElement('span'),vis=document.createElement('span');let i=0;
 sr.className='sr-only';sr.textContent=text;vis.className='split';vis.setAttribute('aria-hidden','true');
 [...el.childNodes].forEach(node=>{
  if(node.nodeName==='BR'){vis.appendChild(document.createElement('br'));return}
  node.textContent.split(/(\s+)/).forEach(part=>{
   if(!part)return;if(/^\s+$/.test(part)){vis.appendChild(document.createTextNode(' '));return}
   const word=document.createElement('span');word.className='w';
   [...part].forEach(c=>{const ch=document.createElement('span');ch.className='ch';ch.textContent=c;ch.style.setProperty('--i',i);ch.style.setProperty('--r',((i*37)%13-6)+'deg');i++;word.appendChild(ch)});
   vis.appendChild(word);
  });
 });
 el.textContent='';el.append(sr,vis);el.style.setProperty('--n',i);
});
root.classList.add('split-done');

// Theme: the new theme spreads in a circle from the button that was pressed (View Transitions, where supported).
const preference=matchMedia('(prefers-color-scheme: dark)'),buttons=[...document.querySelectorAll('.theme')];
let manual=false;try{manual=['dark','light'].includes(localStorage.getItem('fahad-theme'))}catch(e){}
function setTheme(theme){root.dataset.theme=theme;buttons.forEach(b=>{b.setAttribute('aria-label','Switch to '+(theme==='dark'?'light':'dark')+' mode');b.title=b.getAttribute('aria-label')});document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#0e0f12':'#f7f4ec'}
setTheme(root.dataset.theme||(preference.matches?'dark':'light'));
buttons.forEach(b=>b.addEventListener('click',()=>{const next=root.dataset.theme==='dark'?'light':'dark';manual=true;try{localStorage.setItem('fahad-theme',next)}catch(e){}root.classList.add('theme-anim');
 if(typeof document.startViewTransition!=='function'||reduced.matches){setTheme(next);return}
 const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,radius=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
 root.classList.add('theme-vt');
 let tr;try{tr=document.startViewTransition(()=>setTheme(next))}catch(e){root.classList.remove('theme-vt');setTheme(next);return}
 tr.ready.then(()=>root.animate({clipPath:['circle(0px at '+x+'px '+y+'px)','circle('+radius+'px at '+x+'px '+y+'px)']},{duration:640,easing:'cubic-bezier(.65,0,.35,1)',pseudoElement:'::view-transition-new(root)'})).catch(()=>{});
 tr.finished.finally(()=>root.classList.remove('theme-vt'))}));
preference.addEventListener('change',e=>{if(!manual)setTheme(e.matches?'dark':'light')});
addEventListener('storage',e=>{if(e.key!=='fahad-theme')return;manual=['dark','light'].includes(e.newValue);setTheme(manual?e.newValue:preference.matches?'dark':'light')});

// Mobile menu: modal, focus-trapped, scroll-locked; closes on Escape, link choice and desktop resize.
const menu=document.getElementById('mobile-menu'),toggle=document.querySelector('.menu-toggle'),close=menu.querySelector('.menu-close');
let timer,scroll=0,target=null;
function finishClose(){clearTimeout(timer);menu.classList.remove('is-open');if(menu.open)menu.close();document.body.classList.remove('menu-open');Object.assign(document.body.style,{position:'',top:'',width:''});window.scrollTo({top:scroll,behavior:'instant'});toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation menu');toggle.focus({preventScroll:true});if(target){const section=document.querySelector(target);history.replaceState(null,'',target);if(section){section.scrollIntoView({behavior:reduced.matches?'instant':'smooth'});section.setAttribute('tabindex','-1');section.focus({preventScroll:true});section.addEventListener('blur',()=>section.removeAttribute('tabindex'),{once:true})}target=null}}
function closeMenu(){if(!menu.open)return;menu.classList.remove('is-open');clearTimeout(timer);if(reduced.matches)finishClose();else timer=setTimeout(finishClose,240)}
function openMenu(){if(menu.open)return;clearTimeout(timer);scroll=window.scrollY;menu.showModal();document.body.classList.add('menu-open');Object.assign(document.body.style,{position:'fixed',top:'-'+scroll+'px',width:'100%'});toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Close navigation menu');requestAnimationFrame(()=>menu.classList.add('is-open'));close.focus({preventScroll:true})}
toggle.addEventListener('click',()=>menu.open?closeMenu():openMenu());close.addEventListener('click',closeMenu);menu.addEventListener('cancel',e=>{e.preventDefault();closeMenu()});
menu.querySelectorAll('nav a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();target=a.getAttribute('href');closeMenu()}));
menu.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const items=[...menu.querySelectorAll('button,a[href]')],first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}});
matchMedia('(min-width:721px)').addEventListener('change',e=>{if(e.matches&&menu.open)finishClose()});

// Avatar falls back to a monogram if the image can't load.
const avatar=document.querySelector('.avatar'),photo=avatar&&avatar.querySelector('img');
if(photo){const fail=()=>avatar.classList.add('no-photo');photo.addEventListener('error',fail);if(photo.complete&&!photo.naturalWidth&&photo.currentSrc)fail()}
document.getElementById('year').textContent=new Date().getFullYear();

// Slogan strips: repeat the text until one half of the track is wider than the screen, so the loop never gaps.
document.querySelectorAll('.marquee-track').forEach(track=>{let n=0;while(track.scrollWidth/2<innerWidth*1.15&&n++<4)track.append(...[...track.children].map(c=>c.cloneNode(true)))});

// Scroll reveals. Parts below the fold at load start hidden and ease in as they reach the viewport; parts that
// arrive together are staggered. When a part has arrived its reveal classes are removed, leaving the base styles.
if('IntersectionObserver' in window&&!reduced.matches){
 const parts=[],mark=(el,kind)=>{if(!el||el.dataset.r)return;el.dataset.r=kind;parts.push(el)};
 document.querySelectorAll('.scene:not(.hero) [data-split]').forEach(el=>mark(el,'title'));
 document.querySelectorAll('.stage').forEach(el=>mark(el,'stage'));
 document.querySelectorAll('.callouts li,.step,.service,.craft-cards li,.contact-links a,.graph-nodes li,.graph-hub').forEach(el=>mark(el,'flip'));
 document.querySelectorAll('.skill-list li').forEach(el=>mark(el,'chip'));
 document.querySelectorAll('.constellation').forEach(el=>mark(el,'draw'));
 document.querySelectorAll('.scene:not(.hero) .label,.reveal,.shot-thumbs,.skill-group>div:first-child,.float-shot,.builds-card,.facts,.project-story,.note,.scene:not(.hero) .marquee').forEach(el=>mark(el,'up'));
 parts.forEach(el=>{if(el.getBoundingClientRect().top>innerHeight)el.classList.add('r-hide')});
 const settle=el=>{el.classList.remove('r-hide','r-in');el.style.removeProperty('--d')};
 const io=new IntersectionObserver(entries=>{entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top||a.boundingClientRect.left-b.boundingClientRect.left).forEach((e,i)=>{
  const el=e.target,d=Math.min(i,7)*70,extra=el.dataset.r==='title'?(+el.style.getPropertyValue('--n')||12)*28:el.dataset.r==='draw'?1200:0;
  io.unobserve(el);el.style.setProperty('--d',d+'ms');el.classList.add('r-in');setTimeout(()=>settle(el),1900+d+extra)})},{rootMargin:'9999px 0px -9% 0px'}); // the tall top margin also reveals anything a fast jump scrolled straight past
 parts.forEach(el=>{if(el.classList.contains('r-hide'))io.observe(el)});
 const revealAll=()=>{io.disconnect();parts.forEach(settle)};
 reduced.addEventListener('change',e=>{if(e.matches)revealAll()});addEventListener('beforeprint',revealAll);
}

// 3D pointer response: product frames tilt toward the pointer, floating screenshots and the hero's outline
// echoes shift with depth. Mouse and trackpad only; never on touch or with reduced motion.
function follow(area,target,xVar,yVar){let raf=0;
 area.addEventListener('pointermove',e=>{if(!fine.matches||reduced.matches||e.pointerType==='touch')return;cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{const r=area.getBoundingClientRect();target.style.setProperty(xVar,(((e.clientX-r.left)/r.width-.5)*2).toFixed(3));target.style.setProperty(yVar,(((e.clientY-r.top)/r.height-.5)*2).toFixed(3))})});
 area.addEventListener('pointerleave',()=>{cancelAnimationFrame(raf);target.style.setProperty(xVar,0);target.style.setProperty(yVar,0)})}
document.querySelectorAll('[data-tilt]').forEach(stage=>follow(stage.closest('.scene')||stage,stage,'--tx','--ty'));
document.querySelectorAll('[data-parallax]').forEach(field=>follow(field.closest('.scene')||field,field,'--px','--py'));
const hero=document.querySelector('.hero');if(hero)follow(hero,hero,'--hx','--hy');

// Stack graph: lines from the hub to each technology, with signals travelling along them.
document.querySelectorAll('[data-graph]').forEach(graph=>{
 const svg=graph.querySelector('.graph-lines'),hub=graph.querySelector('.graph-hub'),nodes=[...graph.querySelectorAll('.graph-nodes li')],ns='http://www.w3.org/2000/svg';
 const draw=()=>{const w=graph.clientWidth,h=graph.clientHeight;if(!w||!h)return;svg.setAttribute('viewBox','0 0 '+w+' '+h);svg.textContent='';const hx=hub.offsetLeft,hy=hub.offsetTop;
  nodes.forEach((node,i)=>{const x=node.offsetLeft,y=node.offsetTop,len=Math.hypot(x-hx,y-hy),line=document.createElementNS(ns,'line');
   [['x1',hx],['y1',hy],['x2',x],['y2',y]].forEach(([k,v])=>line.setAttribute(k,v.toFixed(1)));const dot=line.cloneNode();line.setAttribute('class','link');dot.setAttribute('class','dot');dot.style.setProperty('--len',len.toFixed(1));dot.style.setProperty('--delay',(-i*.57).toFixed(2)+'s');svg.append(line,dot)})};
 draw();if('ResizeObserver' in window)new ResizeObserver(draw).observe(graph);else addEventListener('resize',draw);
});

// Looping motion only runs in scenes near the viewport.
const scenes=[...document.querySelectorAll('.scene')];
if('IntersectionObserver' in window){const live=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('is-live',e.isIntersecting)),{rootMargin:'120px 0px'});scenes.forEach(s=>live.observe(s))}else scenes.forEach(s=>s.classList.add('is-live'));

// Progress bar, scene counter and the active link in the desktop navigation.
const bar=document.querySelector('.progress'),count=document.querySelector('.hud-count'),name=document.querySelector('.hud-name'),links=[...document.querySelectorAll('.desktop-nav a')],total=String(scenes.length).padStart(2,'0');let ticking=false,last=-1;
function onScroll(){ticking=false;const max=document.documentElement.scrollHeight-innerHeight;bar.style.setProperty('--progress',max>0?Math.min(1,scrollY/max):0);
 let idx=0;scenes.forEach((s,i)=>{if(s.getBoundingClientRect().top<innerHeight*.5)idx=i});
 if(idx!==last){last=idx;count.textContent=String(idx+1).padStart(2,'0')+' / '+total;name.textContent=scenes[idx].dataset.scene||''}
 let current=null,best=-Infinity;links.forEach(a=>{const s=document.querySelector(a.getAttribute('href'));if(!s)return;const top=s.getBoundingClientRect().top;if(top<innerHeight*.4&&top>best){best=top;current=a}});
 links.forEach(a=>{const on=a===current;a.classList.toggle('active',on);on?a.setAttribute('aria-current','location'):a.removeAttribute('aria-current')})}
addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(onScroll)}},{passive:true});addEventListener('resize',onScroll);onScroll();
});

document.addEventListener('DOMContentLoaded', () => {
'use strict';
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),toast=document.querySelector('.toast');let toastTimer;
function say(text){toast.textContent=text;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2600)}

// Screenshot galleries (Battle of Shinkai, SupportFlow, Blacklist): crossfade once the new image has decoded.
document.querySelectorAll('.shots').forEach(g=>{const main=g.querySelector('.shot-main'),thumbs=[...g.querySelectorAll('.shot-thumb')];
thumbs.forEach(t=>t.addEventListener('click',()=>{if(t.getAttribute('aria-pressed')==='true')return;thumbs.forEach(o=>o.setAttribute('aria-pressed',String(o===t)));const swap=()=>{main.src=t.dataset.src;main.alt=t.dataset.alt;const shown=()=>main.classList.remove('swap');typeof main.decode==='function'?main.decode().then(shown,shown):shown()};if(reduced.matches)swap();else{main.classList.add('swap');setTimeout(swap,220)}}))});

// Play the game in a dialog on larger screens; phones go straight to the full game tab.
const modal=document.getElementById('game-modal'),frame=modal.querySelector('.game-frame'),play=document.querySelector('.play-game'),large=matchMedia('(min-width:900px) and (pointer:fine)');let opener=null;
play.addEventListener('click',e=>{if(!large.matches||typeof modal.showModal!=='function')return;e.preventDefault();opener=play;const f=document.createElement('iframe');f.src=frame.dataset.src;f.title='Battle of Shinkai game';f.allow='fullscreen; autoplay; gamepad';frame.appendChild(f);modal.showModal();document.body.classList.add('menu-open');modal.querySelector('.game-close').focus()});
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
function confetti(){const c=document.createElement('canvas'),x=c.getContext('2d'),dpr=devicePixelRatio||1;c.className='confetti';c.width=innerWidth*dpr;c.height=innerHeight*dpr;x.scale(dpr,dpr);document.body.appendChild(c);const colors=['#ff6a3d','#c8f04e','#f3efe4','#ff9a76','#9bc31c'],bits=Array.from({length:140},()=>({x:innerWidth/2,y:innerHeight*.6,vx:(Math.random()-.5)*14,vy:-Math.random()*16-6,s:Math.random()*6+4,r:Math.random()*6,vr:(Math.random()-.5)*.3,c:colors[Math.random()*colors.length|0]}));let n=0;(function step(){x.clearRect(0,0,innerWidth,innerHeight);bits.forEach(b=>{b.vy+=.45;b.x+=b.vx;b.y+=b.vy;b.r+=b.vr;x.save();x.translate(b.x,b.y);x.rotate(b.r);x.fillStyle=b.c;x.fillRect(-b.s/2,-b.s/4,b.s,b.s/2);x.restore()});if(++n<150)requestAnimationFrame(step);else c.remove()})()}
});

// Intro: SENKU / SKYBOY decodes from random glyphs, then the screen breaks into tiles that clear away.
document.addEventListener('DOMContentLoaded', () => {
'use strict';
const root=document.documentElement,intro=document.querySelector('.intro'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const heroIn=()=>root.classList.add('hero-in');
if(!intro||!root.classList.contains('intro-on')){heroIn();return}
const tiles=intro.querySelector('.intro-tiles'),size=innerWidth<720?84:120,cols=Math.ceil(innerWidth/size),rows=Math.ceil(innerHeight/size),palette=['#0e0f12','#0e0f12','#f3efe4','#0e0f12','#ff6a3d'],frag=document.createDocumentFragment();
tiles.style.setProperty('--cols',cols);tiles.style.setProperty('--rows',rows);
for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const tile=document.createElement('i');tile.className='intro-tile';tile.style.setProperty('--i',c+r);tile.style.setProperty('--c',palette[(c*7+r*3)%palette.length]);frag.appendChild(tile)}
tiles.appendChild(frag);tiles.classList.add('has-tiles');
const glyphs='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*<>/';
let done=false,timers=[];
function decode(el,delay){const word=el.dataset.word,steps=word.length*4;let n=0;timers.push(setTimeout(()=>{const t=setInterval(()=>{n++;el.textContent=[...word].map((c,i)=>n/4>i?c:glyphs[Math.random()*glyphs.length|0]).join('');if(n>=steps){clearInterval(t);el.textContent=word;el.classList.add('set')}},45);timers.push(t)},delay))}
function finish(){if(done)return;done=true;timers.forEach(t=>{clearTimeout(t);clearInterval(t)});try{sessionStorage.setItem('senku-intro','1')}catch(e){}removeEventListener('keydown',finish);
 const remove=()=>{root.classList.remove('intro-on');intro.remove()};
 if(reduced){remove();heroIn();return}
 intro.classList.add('intro-out');setTimeout(heroIn,260);setTimeout(remove,700+(cols+rows)*24)}
if(reduced)intro.querySelectorAll('.intro-word').forEach(el=>el.classList.add('set'));else intro.querySelectorAll('.intro-word').forEach((el,i)=>decode(el,250+i*650));
intro.addEventListener('click',finish);addEventListener('keydown',finish);
timers.push(setTimeout(finish,3400));
});
