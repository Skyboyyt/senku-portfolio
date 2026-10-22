# Fahad Sani — Portfolio

A client-focused portfolio for Fahad Sani (Skyboy / Senku), built with semantic HTML, CSS, and JavaScript. Deploy the repository root as a static website; no package installation or build step is required.

## Design and content

Charcoal, warm white, and lime connect the interface to the existing green avatar. The page introduces Fahad, presents three real projects, explains services and the working process, and offers email and WhatsApp contact links. Blacklist leads the work section as evidence of full-stack development. Project details use native disclosures to keep the overview scannable. Existing screenshots, project statuses, public contact information, and external project links are preserved. AxoRonin's illustrative visual stays labeled “Concept preview”; Blacklist's screenshots stay labeled as earlier demo images. No testimonials, client results, or metrics are invented.

## Files

- `index.html`: content, metadata, structured data, project galleries, and navigation.
- `styles.css`: responsive layout, themes, motion, and reduced-motion/print styles.
- `script.js`: theme preference, native mobile dialog, reveal observer, progress indicator, galleries, email copy, and subtle pointer tilt.
- `assets/`: existing avatar and project screenshots.
- `404.html`: existing not-found page.

## Behavior and accessibility

The page opens in dark mode unless a visitor has saved a light/dark choice under `fahad-theme`. Storage is optional and errors are handled. JavaScript adds scroll reveals only after an observer is available; content remains readable without it. Reduced-motion preferences disable movement and smooth scrolling. Touch devices skip pointer tilt. Native dialog behavior contains focus and supports Escape; navigation closes the menu and focuses the target section. Screenshot buttons update the main image, descriptive alternative text, and pressed state. Copy email is available when the Clipboard API is supported. Contact links work without JavaScript.

Motion uses CSS and native JavaScript. No animation framework, game engine, or extra runtime is downloaded. Google Fonts supplies DM Sans and Manrope, with local fallbacks. The game opens in its own tab rather than downloading a WebGL build into the portfolio page.

## Local verification

`node --check script.js` verifies syntax. Serve the root using any static HTTP server to inspect layouts. Verify themes, mobile menu (open, link, Escape), screenshot selections, disclosure expansion, links, and narrow widths. Check that all local asset and fragment references resolve. The site has no backend or submission form.
