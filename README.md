# Fahad Sani — Portfolio

A complete, dependency-free portfolio built with semantic HTML, CSS, and JavaScript.

## Setup
The ready-to-use website is in this folder. Open index.html in a modern browser. No installation or build is needed. To preview over HTTP, run `python -m http.server 8080` from this folder and visit http://localhost:8080, or use any static web server.

To host elsewhere, upload the contents of this folder and preserve the folder structure. The .openai/hosting.json file is only needed by Sites hosting.

## Files
- index.html: content, semantic page structure, and metadata.
- styles.css: responsive layouts, light/dark theme tokens, and motion.
- script.js: theme initialization, accessible menu, theme persistence, portrait fallback, spotlight, reveals, current year.
- assets/: portrait and any future project screenshots.
- demos/pulse-grid/: Pulse Grid, a Web Audio drum machine with shareable links and WAV export. See its README.
- demos/supportflow/: SupportFlow AI, a full-stack multi-tenant customer support app (Next.js, Fastify, PostgreSQL, AI). It has its own README, documentation and test suites, and is not deployed yet. Its portfolio screenshots are in `assets/supportflow/` and were captured from the running app with a development workspace and a fictional demo business.

## Live demo sites
Each demo is also deployed as its own Vercel project from this repository (Root Directory set to the demo folder), and the portfolio buttons link to these addresses:
- Pulse Grid: https://pulse-grid-rosy.vercel.app/ (`demos/pulse-grid`)
- Studio Desk: https://studio-desk-eosin.vercel.app/ (`demos/studio-desk`)
- Fieldwork: https://fieldwork-olive.vercel.app/ (`demos/fieldwork`)

Links from the demos back to the portfolio point at https://senku-portfolio.vercel.app/.

## Your portrait
The hero picture is your avatar: `assets/avatar.jpg` (a hooded figure in a glowing green neon mask). To change it, replace that file or update the `.portrait` image in index.html. It uses object-fit: cover, so a square image is cropped slightly at the sides to fit the arched frame; adjust object-position on .portrait in styles.css to change the focal point. The image is 361×361, so a larger version (at least 900px wide) will look sharper on high-resolution screens. A monogram fallback shows if the image cannot load.

Your original photo is still kept at `assets/ChatGPT Image 30 Sept 2026, 22_24_36.jpg` but is no longer shown on the page.

## Customize
Edit text, real project status, and links in index.html. Change the shared color tokens at the top of styles.css for both themes. Update social links in both the contact section and footer. Replace concept previews with actual screenshots when supplied, add descriptive alt text, and only remove the Concept preview label when using real screenshots.

No project stacks, repositories, testimonials, qualifications, or results were invented. Battle of Shinkai details come from its public build repository (github.com/Skyboyyt/battle-of-shinkai). Blacklist details come from its public repository (github.com/Skyboyyt/blacklist); it is presented as a live test build (public test environment, not launched), with no launch or completion date claimed. Only add a résumé download when an actual file is available.

## Behavior
Device theme is the initial default. Manual choices are stored under fahad-theme in localStorage and applied before the stylesheet loads. Clear that key to return to the device preference. Storage errors are handled. The modal mobile menu contains focus, locks scrolling, closes on Escape, backdrop click, link selection, and desktop resize, and restores focus. The two-line menu icon animates into a close icon.

Reduced-motion preferences disable movement and smooth scrolling. Touch devices do not run the pointer spotlight. Content stays visible without JavaScript and a no-JavaScript mobile navigation is provided. Email, WhatsApp, GitHub, and X are real links; there is no simulated form.

## Previews
Battle of Shinkai uses real screenshots of the live WebGL test build, stored in `assets/shinkai/` (combat, world map, lobby). Visitors can switch between them with the thumbnail buttons. Blacklist uses real screenshots of an earlier demo build running on fictional sample data, stored in `assets/blacklist/` (research, wallet check, risk ranking); they are labeled "Earlier demo screenshot" and should be replaced with screenshots of the live test site. The AxoRonin visual is still typographic and labeled Concept preview; replace it with real screenshots when available.

## Featured game: Battle of Shinkai
- The project is featured first in the Work section and announced by the "New" pill in the hero.
- "Play Battle of Shinkai" links to https://skyboyyt.github.io/battle-of-shinkai/. On desktop (wide screen, mouse), it opens the game in an in-page player dialog; the iframe is created on open and removed on close, so the game and its audio stop. Phones, tablets, and visitors without JavaScript go straight to the full game tab.
- The player has an "Open full tab" link, which is recommended for wallet sign-in.

## Extra touches
- Scroll progress bar under the header, and the current section is highlighted in the desktop navigation.
- The hero heading rotates through a few phrases (screen readers hear the original sentence; disabled with reduced motion).
- "Copy email" button in the contact section, with a status toast. It only appears when the Clipboard API is available.
- Easter egg: type `senku` anywhere on the page.


All HTML, CSS, and JavaScript are in separate files. script.js is loaded before styles.css to apply your saved theme before painting; the page interactions start after the HTML is ready.

## Behind the project
Each project has a native details/summary section. Click the label, or focus it and press Enter or Space, to expand or collapse it. These sections work without JavaScript. Edit their copy in index.html and their styles under .project-story in styles.css. Only confirmed project information is included; add challenges or lessons when you have real details to share.

## Intro animation

The first visit in a browser tab plays a short SENKU / SKYBOY intro (about 3 seconds). Click or press any key to skip it. It does not replay until the tab is closed (sessionStorage), and it is skipped when JavaScript is off. Visitors who prefer reduced motion (for example, Windows with "Animation effects" turned off) see a still version of the same screen, with no scramble or flicker. A CSS failsafe hides it after 6 seconds if the script never runs.

## Services, sharing and 404

- **Services** ("What I can help with") lists four kinds of work, each linked to a real project as proof. Keep every card tied to work that exists.
- **Link previews:** Open Graph and Twitter tags give a proper title and description when the site is shared on WhatsApp, X or elsewhere. A preview image (`og:image`) needs the site's full public address, so add it once the final domain is fixed.
- **Structured data:** a schema.org `Person` block helps search engines connect the names Fahad Sani, Senku and Skyboy.
- **404.html** is a styled "page not found" screen. Vercel and most static hosts serve it automatically.
