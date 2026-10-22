// Apply a saved choice before painting; storage is optional.
try { document.documentElement.dataset.theme = localStorage.getItem('fahad-theme') || 'dark'; } catch { document.documentElement.dataset.theme = 'dark'; }
document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const theme = document.querySelector('.theme');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  function syncTheme() {
    const dark = root.dataset.theme !== 'light';
    theme.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
    themeColor.content = dark ? '#141615' : '#f6f6ef';
  }
  syncTheme();
  theme.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('fahad-theme', root.dataset.theme); } catch {}
    syncTheme();
  });
  const menu = document.querySelector('#mobile-menu');
  const toggle = document.querySelector('.menu-toggle');
  function closeMenu() { menu.close(); }
  toggle.addEventListener('click', () => {
    menu.showModal();
    document.body.classList.add('menu-open');
    toggle.setAttribute('aria-expanded', 'true');
  });
  document.querySelector('.menu-close').addEventListener('click', closeMenu);
  menu.addEventListener('close', () => {
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
  });
  menu.addEventListener('click', e => {
    if (e.target === menu) {
      const r = menu.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeMenu();
    }
  });
  menu.querySelectorAll('nav a').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    closeMenu();
    const section = document.querySelector(a.hash);
    history.replaceState(null, '', a.hash);
    section.scrollIntoView({behavior: reduced.matches ? 'instant' : 'smooth'});
    section.setAttribute('tabindex', '-1');
    section.focus({preventScroll: true});
    section.addEventListener('blur', () => section.removeAttribute('tabindex'), {once: true});
  }));
  matchMedia('(min-width:761px)').addEventListener('change', e => { if(e.matches && menu.open) closeMenu(); });
  document.querySelector('#year').textContent = new Date().getFullYear();
  // Progressive enhancement: only hide content once an observer is ready.
  const items = [...document.querySelectorAll('.reveal')];
  if ('IntersectionObserver' in window && !reduced.matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); }
    }), {threshold: 0.06});
    items.forEach(el => { if(el.getBoundingClientRect().top > innerHeight) el.classList.add('ready'); observer.observe(el); });
    reduced.addEventListener('change', e => { if(e.matches) { items.forEach(el => el.classList.add('visible')); observer.disconnect(); } });
  }
  addEventListener('beforeprint', () => items.forEach(el => el.classList.add('visible')));
  const bar = document.querySelector('.progress');
  const links = [...document.querySelectorAll('.desktop-nav a')];
  let pending = false;
  function updateScroll() {
    pending = false;
    const max = root.scrollHeight - innerHeight;
    bar.style.setProperty('--progress', max > 0 ? Math.min(1, scrollY / max) : 0);
    let current;
    links.forEach(a => { if(document.querySelector(a.hash).getBoundingClientRect().top < innerHeight * .4) current = a; });
    links.forEach(a => { a.classList.toggle('active', a === current); if(a === current) a.setAttribute('aria-current','location'); else a.removeAttribute('aria-current'); });
  }
  addEventListener('scroll', () => { if(!pending) { pending = true; requestAnimationFrame(updateScroll); } }, {passive:true});
  addEventListener('resize', updateScroll);
  updateScroll();
  document.querySelectorAll('.shots').forEach(gallery => {
    const main = gallery.querySelector('.shot-main');
    const thumbs = [...gallery.querySelectorAll('.shot-thumb')];
    // Swap immediately; rapid selections never leave a stale image or delayed timer.
    thumbs.forEach(button => button.addEventListener('click', () => {
      main.src = button.dataset.src;
      main.alt = button.dataset.alt;
      thumbs.forEach(t => t.setAttribute('aria-pressed', String(t === button)));
    }));
  });
  const copy = document.querySelector('.copy-email');
  const toast = document.querySelector('.toast');
  let toastTimer;
  if(navigator.clipboard) {
    copy.hidden = false;
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText('fahadsani440@gmail.com'); toast.textContent = 'Email copied. Let’s build something.'; }
      catch { toast.textContent = 'Email: fahadsani440@gmail.com'; }
      clearTimeout(toastTimer);
      toast.classList.add('show');
      toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
    });
  }
});
// Gentle pointer-responsive depth only on devices with a precise pointer.
document.addEventListener('DOMContentLoaded', () => {
  const card = document.querySelector('.hero-showcase');
  const pointer = matchMedia('(hover:hover) and (pointer:fine)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame;
  card.addEventListener('pointermove', e => {
    if (!pointer.matches || reduced.matches) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--tilt-x', `${-(e.clientY-r.top-r.height/2)/r.height*4}deg`);
      card.style.setProperty('--tilt-y', `${(e.clientX-r.left-r.width/2)/r.width*4}deg`);
    });
  });
  function reset() { cancelAnimationFrame(frame); card.style.removeProperty('--tilt-x'); card.style.removeProperty('--tilt-y'); }
  card.addEventListener('pointerleave', reset);
  reduced.addEventListener('change', reset);
});
