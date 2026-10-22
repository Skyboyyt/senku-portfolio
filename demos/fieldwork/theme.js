'use strict';
// Only the colour preference is stored; booking details never use browser storage.
(() => {
 const preference = window.matchMedia('(prefers-color-scheme: dark)');
 let explicit = false;
 let dark = preference.matches;
 try {const saved = localStorage.getItem('fieldwork-theme');if(saved === 'light' || saved === 'dark'){dark = saved === 'dark';explicit = true;}} catch {}
 function paint(value) {
  dark = value;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark ? '#191d19' : '#f3f0e9');
  document.querySelectorAll('.theme-toggle').forEach(button => {
   button.setAttribute('aria-label',`Switch to ${dark ? 'light' : 'dark'} mode`);
   button.setAttribute('aria-pressed',String(dark));
  });
 }
 paint(dark);
 document.addEventListener('DOMContentLoaded',() => {
  paint(dark);
  document.querySelectorAll('.theme-toggle').forEach(button => button.addEventListener('click',() => {
   explicit = true;paint(!dark);
   try {localStorage.setItem('fieldwork-theme',dark ? 'dark' : 'light');} catch {}
  }));
  const menu = document.querySelector('#mobile-menu');
  const open = document.querySelector('#open-menu');
  open.addEventListener('click',() => {menu.showModal();open.setAttribute('aria-expanded','true');});
  document.querySelector('#close-menu').addEventListener('click',() => menu.close());
  menu.addEventListener('close',() => open.setAttribute('aria-expanded','false'));
  menu.querySelectorAll('nav a').forEach(link => link.addEventListener('click',() => menu.close()));
  document.querySelector('#menu-book').addEventListener('click',() => {
   menu.close();document.querySelector('.desktop-book').click();
  });
  menu.addEventListener('click',event => {
   if(event.target !== menu)return;
   const rect=menu.getBoundingClientRect();
   if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)menu.close();
  });
  // Restore focus to a visible control when a booking starts from the mobile drawer.
  document.querySelector('#booking').addEventListener('close',() => {
   if(window.matchMedia('(max-width:850px)').matches && document.activeElement === document.querySelector('.desktop-book'))open.focus();
  });
 });
 preference.addEventListener('change',event => {if(!explicit)paint(event.matches);});
})();
