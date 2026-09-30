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

## Your portrait
Your supplied original photo is included here:
`assets/ChatGPT Image 30 Sept 2026, 22_24_36.jpg`

The site references `assets/ChatGPT Image 30 Sept 2026, 22_24_36.jpg` relative to index.html. Spaces work in the quoted URL. The photo replaces the monogram automatically. It uses object-fit: cover and object-position: center 35%, preserving proportions. Adjust .portrait in styles.css if your photo needs another focal point. The portrait also displays without JavaScript. A monogram fallback is retained if the image cannot load.

## Customize
Edit text, real project status, and links in index.html. Change the shared color tokens at the top of styles.css for both themes. Update social links in both the contact section and footer. Replace concept previews with actual screenshots when supplied, add descriptive alt text, and only remove the Concept preview label when using real screenshots.

No project stacks, repositories, testimonials, qualifications, or results were invented. Battle of Shinkai has no confirmed playable features or supported devices in the brief; desktop/mobile support is labeled as a development goal. Blacklist describes management and marketing work without claiming platform development or an unknown completion date. Only add a résumé download when an actual file is available.

## Behavior
Device theme is the initial default. Manual choices are stored under fahad-theme in localStorage and applied before the stylesheet loads. Clear that key to return to the device preference. Storage errors are handled. The modal mobile menu contains focus, locks scrolling, closes on Escape, backdrop click, link selection, and desktop resize, and restores focus. The two-line menu icon animates into a close icon.

Reduced-motion preferences disable movement and smooth scrolling. Touch devices do not run the pointer spotlight. Content stays visible without JavaScript and a no-JavaScript mobile navigation is provided. Email, WhatsApp, GitHub, and X are real links; there is no simulated form.

## Previews
No screenshots were supplied, and the AxoRonin website could not be retrieved during creation. The three large typographic visuals are labeled Concept preview, not screenshots or gameplay footage.


All HTML, CSS, and JavaScript are in separate files. script.js is loaded before styles.css to apply your saved theme before painting; the page interactions start after the HTML is ready.

## Behind the project
Each project has a native details/summary section. Click the label, or focus it and press Enter or Space, to expand or collapse it. These sections work without JavaScript. Edit their copy in index.html and their styles under .project-story in styles.css. Only confirmed project information is included; add challenges or lessons when you have real details to share.
