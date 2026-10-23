# Pulse Grid

A sixteen-step drum machine for the browser, built by Fahad Sani with HTML, CSS, JavaScript ES modules and the Web Audio API. Serve the repository through a static web server and open `demos/pulse-grid/`; there is no build step or third-party runtime dependency.

## Features

- Eight voices (kick, snare, clap, closed and open hat, low tom, rimshot, cowbell) synthesised in real time from oscillators, filtered noise and envelopes. No audio samples are used.
- Steps cycle off, on and accent. Mute, solo and per-track volume; the open hat is choked by the closed hat.
- Four patterns (A–D). Choosing a pattern during playback queues it for the next bar; chain mode plays every non-empty pattern in turn.
- Tempo (60–180 BPM), swing, evenly spread (Euclidean) fills, shift left/right, copy to next pattern, clear and undo.
- A look-ahead scheduler that queues notes on the audio clock, with a playhead and oscilloscope drawn from the same timeline.
- Share links: the whole beat (tempo, swing, mixer and all four patterns) is encoded in the URL fragment and validated on load.
- WAV export: four bars are rendered with `OfflineAudioContext` and saved as a 16-bit stereo file on the visitor's device.
- Responsive layout (phones show eight steps at a time), hamburger menu, light/dark theme, keyboard grid navigation and reduced-motion support.

## Data

Beats live only in the page address. The colour theme is the one value stored in `localStorage`. Nothing is sent to a server.

## Files

- `model.mjs`: pure pattern logic (share-link format, swing timing, Euclidean fills, chain order, WAV encoding).
- `audio.mjs`: synthesised voices and the mixer chain, shared by live playback and offline export.
- `app.js`: interface, scheduler, sharing and export.

## Verification

Run `node --test tests/model.test.mjs` from this directory. In a browser, check playback, queued pattern changes, share-link round trips, WAV export, theme and menu, and the phone layout.
