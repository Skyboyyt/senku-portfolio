# Fieldwork — service-business booking concept

A fictional barbershop website by Fahad Sani, built with HTML, CSS and vanilla JavaScript. Open `index.html` through a static web server. No build step or dependencies are required. System fonts are used; there is no external font request. All project photography is served locally.

## Features

- Responsive service menu, team section, locally optimized salon photography and native FAQ disclosures.
- Three-step native-dialog booking flow with service and barber preselection.
- Sample slots based on service duration, barber reservations, lunch break, closed Sundays and opening hours (09:00–18:00).
- Dates limited to the next 30 days; elapsed times cannot be selected.
- Native email validation, a trimmed-name check, safe text rendering and keyboard focus restoration.
- Accessible mobile navigation, dark/light mode, and system-theme support. Only the colour-theme preference uses localStorage.
- No database, email service, payments, analytics or personal-data browser storage. Form data stays in memory and is cleared when the dialog closes. Confirmation never claims a real appointment.

## Scope for a real business

Replace fictional content with approved business details; add server-validated availability and transactional reservations, staff management and any agreed email/payment services. Browser-only sample slots do not prevent real booking conflicts.

## Manual verification

Test desktop and mobile layout; select each service/barber; check Sunday and past-time handling; proceed without a selected time; edit a visit; submit a valid sample; close/reopen to verify personal data clears; use keyboard and Escape.

Photography and source pages are documented in `IMAGES.md`. Responsive WebP variants reduce image payload. Fictional staff names are sample content.
