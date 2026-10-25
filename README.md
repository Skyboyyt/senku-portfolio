# Fahad Sani — Portfolio

A complete, dependency-free portfolio built with semantic HTML, CSS, and JavaScript. Its "Ideas in motion" design is a set of full-width scenes with 3D product frames and scroll-driven motion, taken from the owner's motion edit (October 2026).

## Setup
The ready-to-use website is in this folder. Open index.html in a modern browser. No installation or build is needed. To preview over HTTP, run `python -m http.server 8080` from this folder and visit http://localhost:8080, or use any static web server.

To host elsewhere, upload the contents of this folder and preserve the folder structure. The .openai/hosting.json file is only needed by Sites hosting.

## Files
- index.html: content, semantic page structure, and metadata. Each part of the page is a `<section class="scene">`.
- styles.css: design tokens, scene palettes, layouts, 3D stages, motion, and the reduced-motion rules.
- script.js: theme initialization and switching, accessible menu, heading letter-splitting, scroll reveals, pointer tilt, stack graph, scene counter, galleries, game player, copy email, easter egg, and the intro.
- assets/fonts/: Inter Tight (variable) and JetBrains Mono, self-hosted from Fontsource under the SIL Open Font License 1.1.
- assets/: avatar and real project screenshots.
- demos/pulse-grid/: Pulse Grid, a Web Audio drum machine with shareable links and WAV export. See its README.
- demos/supportflow/: SupportFlow AI, a full-stack multi-tenant customer support app (Next.js, Fastify, PostgreSQL, AI). It has its own README, documentation and test suites, and is live at https://supportflow-omega.vercel.app (web app on Vercel, API on Cloudflare Workers, Postgres on Neon). Its portfolio screenshots are in `assets/supportflow/` and were captured from the running app with a development workspace and a fictional demo business.

## Live demo sites
Each demo is also deployed as its own Vercel project from this repository (Root Directory set to the demo folder), and the portfolio buttons link to these addresses:
- Pulse Grid: https://pulse-grid-rosy.vercel.app/ (`demos/pulse-grid`)
- Studio Desk: https://studio-desk-eosin.vercel.app/ (`demos/studio-desk`)
- Fieldwork: https://fieldwork-olive.vercel.app/ (`demos/fieldwork`)

Links from the demos back to the portfolio point at https://senku-portfolio.vercel.app/.

## Design
- **Scenes:** near-black "ink" scenes alternate with cream "paper" scenes, each on a fine grid with outlined rings. In light mode the ink scenes turn warm paper; cards, product frames and chips stay dark in both themes.
- **Type:** bold uppercase Inter Tight for titles, JetBrains Mono for labels. Orange (`--orange`) and lime (`--lime`) are the accents; in light mode large orange text uses a deeper shade (`--display-accent`) for contrast.
- **Order:** Ideas in motion (hero), About (orbit), Real builds, the eight projects, Services, One experience, The full stack, and Let’s talk. A counter in the corner names the current scene.
- **Owner-approved motifs:** the rotating starburst (hero and contact) and the scrolling slogan strips. AGENTS.md records this.

## Your portrait
The About scene shows your avatar, `assets/avatar.jpg`, in a circle with Apps, Games and Web orbiting it. To change it, replace that file. The image is 361×361, so a larger version (at least 900px wide) will look sharper on high-resolution screens. An FS monogram shows if the image cannot load.

Your original photo is still kept at `assets/ChatGPT Image 30 Sept 2026, 22_24_36.jpg` but is not shown on the page.

## Customize
Edit text, real project status, and links in index.html. Change the color tokens at the top of styles.css (`:root`, `.ink`, `.paper`). Update social links in both the contact section and footer. Replace concept previews with actual screenshots when supplied, add descriptive alt text, and only remove the Concept preview label when using real screenshots.

Headings marked `data-split` are split into letters by script.js, which keeps a hidden copy of the full text for screen readers. Each product frame is a `.stage` (angle set by `--rx` and `--ry`); phones (`.phone`) and floating cards (`.float-card`) sit forward in 3D.

No project stacks, repositories, testimonials, qualifications, or results were invented. Battle of Shinkai details come from its public build repository (github.com/Skyboyyt/battle-of-shinkai). Blacklist details come from its public repository (github.com/Skyboyyt/blacklist); it is presented as a live test build (public test environment, not launched), with no launch or completion date claimed. Only add a résumé download when an actual file is available.

## Previews
All product frames show real screenshots. Battle of Shinkai uses the live WebGL test build (`assets/shinkai/`: combat, world map, lobby). Blacklist uses an earlier demo build running on fictional sample data (`assets/blacklist/`), labeled "Earlier demo screenshot"; replace them with screenshots of the live test site. The phone screens for Studio Desk, Fieldwork and Pulse Grid, and the Fieldwork desktop screen, were captured from the demos in this repository (`assets/studio-desk/`, `assets/fieldwork/`, `assets/pulse-grid/`). The AxoRonin visual is still typographic and labeled Concept preview; replace it with real screenshots when available.

## Featured game: Battle of Shinkai
- The project is the first project scene and is announced by the "New" pill in the hero.
- "Play Battle of Shinkai" links to https://skyboyyt.github.io/battle-of-shinkai/. On desktop (wide screen, mouse), it opens the game in an in-page player dialog; the iframe is created on open and removed on close, so the game and its audio stop. Phones, tablets, and visitors without JavaScript go straight to the full game tab.
- The player has an "Open full tab" link, which is recommended for wallet sign-in.

## Motion
One set of easing curves (`--ease-out`, `--ease-in`, `--ease-in-out`, `--ease-soft`, `--ease-back`) is used throughout.

- **Intro:** the first visit in a browser tab plays a short SENKU / SKYBOY decode (about 3 seconds), then the screen breaks into orange, cream and black tiles that clear away diagonally. Click or press any key to skip. It does not replay until the tab is closed (sessionStorage) and is skipped when JavaScript is off. A CSS failsafe hides it after 6 seconds if the script never runs.
- **Hero:** the letters of "Ideas. In motion." fall into place, outline echoes fan out behind "Ideas." and follow the pointer, and the starburst spins in.
- **3D product frames:** each frame swings from a steep angle to its resting pose as it reaches the middle of the screen, then eases past it (scroll-driven animations, where supported; otherwise it swings in once). With a mouse or trackpad the frame also tilts toward the pointer, and phones and callout cards move with extra depth.
- **Real builds:** four real screenshots float at different angles and depths around the title, drift as you scroll, and shift with the pointer. Each links to its project.
- **Scroll reveals:** titles drop in letter by letter, callouts and cards flip up, skill chips pop in, Learnspace progress bars fill, and Blacklist's constellation draws itself. Only content below the fold at load is hidden, and anything scrolled straight past is revealed at once.
- **Ambient loops:** slogan strips, the starbursts, the About orbit, outlined rings, and signals travelling along the stack graph. They pause in scenes that are off screen.
- **Interactions:** circular theme switch from the button you pressed (View Transitions), a full-screen mobile menu whose links flip into place, crossfading screenshot switchers, a fading game player, and smooth "Behind the project" panels where the browser can animate to auto height.
- **Accessibility:** with reduced motion turned on, every animation is skipped and everything shows in its resting state. Pointer tilt never runs on touch. Without JavaScript nothing is hidden.

## Behavior
Device theme is the initial default. Manual choices are stored under fahad-theme in localStorage and applied before the stylesheet loads. Clear that key to return to the device preference. Storage errors are handled. The modal mobile menu contains focus, locks scrolling, closes on Escape, link selection, and desktop resize, and restores focus. The two-line menu icon animates into a close icon.

Content stays visible without JavaScript and a no-JavaScript mobile navigation is provided. Email, WhatsApp, GitHub, and X are real links; there is no simulated form.

## Extra touches
- Progress bar along the bottom of the screen, a scene counter in the corner (hidden on phones), and the current section highlighted in the desktop navigation.
- "Copy email" button in the contact scene, with a status toast. It only appears when the Clipboard API is available.
- Easter egg: type `senku` anywhere on the page.

All HTML, CSS, and JavaScript are in separate files. script.js is loaded before styles.css to apply your saved theme before painting; the page interactions start after the HTML is ready.

## Behind the project
Each project has a native details/summary section. Click the label, or focus it and press Enter or Space, to expand or collapse it. These sections work without JavaScript. Edit their copy in index.html and their styles under .project-story in styles.css. Only confirmed project information is included; add challenges or lessons when you have real details to share.

## Services, sharing and 404
- **Services** ("What I can help with") lists four kinds of work, each linked to a real project as proof. Keep every card tied to work that exists.
- **Link previews:** Open Graph and Twitter tags give a proper title and description when the site is shared on WhatsApp, X or elsewhere. A preview image (`og:image`) needs the site's full public address, so add it once the final domain is fixed.
- **Structured data:** a schema.org `Person` block helps search engines connect the names Fahad Sani, Senku and Skyboy.
- **404.html** is a styled "page not found" screen in the same design. Vercel and most static hosts serve it automatically.
