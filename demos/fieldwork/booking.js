'use strict';
const services = [
 { id: 'cut', name: 'The signature cut', minutes: 45, price: 35 },
 { id: 'beard', name: 'The beard ritual', minutes: 30, price: 25 },
 { id: 'full', name: 'The full works', minutes: 75, price: 55 }
];
const dialog = document.querySelector('#booking');
const form = document.querySelector('#booking-form');
const dateInput = document.querySelector('#visit-date');
let returnFocus;
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const localDate = s => {const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d);};
const fmtTime = minutes => `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
const service = () => services.find(s => s.id === form.elements.service.value);
const barber = () => form.elements.barber.value;
const prettyDate = key => localDate(key).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
function bounds(){const today=new Date();const max=new Date(today);max.setDate(max.getDate()+30);dateInput.min=dateKey(today);dateInput.max=dateKey(max);}
function showStep(step){
 document.querySelector('#visit-step').hidden=step!==0;
 document.querySelector('#details-step').hidden=step!==1;
 document.querySelector('#success-step').hidden=step!==2;
 form.hidden=step===2;
 document.querySelectorAll('.steps li').forEach((li,i)=>{li.removeAttribute('aria-current');if(i===step)li.setAttribute('aria-current','step');});
 document.querySelector('#booking-title').textContent=['Take a seat.','Make it yours.','All set.'][step];
 dialog.scrollTop=0;
 document.querySelector('#booking-title').focus({preventScroll:true});
}
function renderTimes(){
 const area=document.querySelector('#time-options'); area.replaceChildren();
 const message=document.querySelector('#time-message');message.textContent='';
 document.querySelector('#visit-error').textContent='';
 bounds();
 if(!dateInput.value || !dateInput.checkValidity()){message.textContent='Choose a day within the next 30 days.';return;}
 const date=localDate(dateInput.value);
 if(date.getDay()===0){message.textContent='Sundays are for slowing down. Choose Monday–Saturday.';return;}
 const duration=service().minutes;
 // Sample reservations; never presented as a real shop's availability.
 const busy=barber()==='jamie'?[[660,720],[840,900]]:[[615,675],[900,960]];
 const now=new Date();
 let available=0;
 for(let t=540;t+duration<=1080;t+=30){
  const past=dateInput.value===dateKey(now) && t<=now.getHours()*60+now.getMinutes();
  const overlaps=busy.some(([start,end])=>t<end && t+duration>start) || (t<810 && t+duration>780);
  const disabled=past||overlaps;
  const label=document.createElement('label');const input=document.createElement('input');
  input.type='radio';input.name='time';input.value=fmtTime(t);input.disabled=disabled;
  const span=document.createElement('span');span.textContent=fmtTime(t);if(disabled)input.setAttribute('aria-label',`${fmtTime(t)}, unavailable`);
  label.append(input,span);area.append(label);if(!disabled)available++;
 }
 message.textContent=available?'Times are illustrative. Crossed-out slots are unavailable.':'No sample times left for this day. Try another day.';
}
function fillSummary(target){
 const root=document.querySelector(target);root.replaceChildren();
 const title=document.createElement('strong');title.textContent=service().name;
 const info=document.createElement('div');info.textContent=`${service().minutes} minutes · $${service().price} · with ${barber()==='jamie'?'Jamie':'Alex'}`;
 const day=document.createElement('div');day.textContent=prettyDate(dateInput.value);
 const time=document.createElement('div');time.textContent=`${form.elements.time.value} · shop local time`;
 root.append(title,info,day,time);
}
function validVisit(){
 bounds();
 if(!dateInput.value || !dateInput.checkValidity() || localDate(dateInput.value).getDay()===0)return false;
 const chosen=form.querySelector('input[name="time"]:checked');
 if(!chosen || chosen.disabled)return false;
 if(dateInput.value===dateKey(new Date())){
  const [h,m]=chosen.value.split(':').map(Number);const now=new Date();if(h*60+m<=now.getHours()*60+now.getMinutes())return false;
 }
 return true;
}
document.querySelector('#service-options').innerHTML=services.map((s,i)=>`<label><input type="radio" name="service" value="${s.id}" ${i===0?'checked':''}><span><strong>${s.name}<small>${s.minutes} minutes</small></strong><span>$${s.price}</span></span></label>`).join('');
document.querySelectorAll('[data-book]').forEach(button=>button.addEventListener('click',()=>{
 returnFocus=button;form.reset();
 if(button.dataset.service)form.elements.service.value=button.dataset.service;
 if(button.dataset.barber)form.elements.barber.value=button.dataset.barber;
 bounds();const next=new Date();next.setDate(next.getDate()+1);if(next.getDay()===0)next.setDate(next.getDate()+1);
 dateInput.value=dateKey(next);renderTimes();
 document.querySelector('#details-error').textContent='';
 dialog.showModal();showStep(0);
}));
form.addEventListener('change',e=>{if(['service','barber','date'].includes(e.target.name))renderTimes();});
document.querySelector('#next-step').addEventListener('click',()=>{
 if(!validVisit()){document.querySelector('#visit-error').textContent='Choose an available day and time to continue.';return;}
 fillSummary('#visit-summary');showStep(1);document.querySelector('#client-name').focus();
});
document.querySelector('#back-step').addEventListener('click',()=>showStep(0));
form.addEventListener('submit',e=>{
 e.preventDefault();
 if(!validVisit()){showStep(0);renderTimes();document.querySelector('#visit-error').textContent='That time has passed. Choose a new time.';return;}
 const name=document.querySelector('#client-name');const email=document.querySelector('#client-email');
 if(!name.value.trim()){document.querySelector('#details-error').textContent='Add a first name to preview your booking.';name.focus();return;}
 if(!email.checkValidity()){email.reportValidity();return;}
 fillSummary('#success-summary');
 document.querySelector('#success-message').textContent=`Here's your sample visit, ${name.value.trim()}. We would send the details to ${email.value} in a live booking system.`;
 showStep(2);
});
function closeBooking(){dialog.close();}
document.querySelector('#close-booking').addEventListener('click',closeBooking);
document.querySelector('#finish-booking').addEventListener('click',closeBooking);
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeBooking();}});
dialog.addEventListener('close',()=>{form.reset();dateInput.value='';document.querySelector('#success-message').textContent='';document.querySelector('#visit-summary').replaceChildren();document.querySelector('#success-summary').replaceChildren();document.querySelector('#time-options').replaceChildren();if(returnFocus && returnFocus.offsetParent !== null)returnFocus.focus();else document.querySelector('#open-menu')?.focus();});
