# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`package.json` holds the version. Bump it with `npm version patch|minor|major`,
which also creates the git commit and tag. Add the release section here first,
so the tagged commit already carries its notes.

## [Unreleased]

## [1.2.0] - 2026-08-26

### Added

- Settings now has separately confirmed actions to clear content information
  while retaining the provider setup, or to clear everything including saved
  provider credentials.

## [1.1.0] - 2026-08-26

### Added

- Project versioning: `package.json` is the single source of truth, the version is
  reported by `/health` and `/api/status`, injected into the web bundle at build
  time, and shown at the bottom of Settings. A TV serving a stale cached bundle is
  called out there as an app/server version mismatch.
- A wall clock on the home screen.

### Changed

- The interface is now resolution independent: every dimension derives from one
  root font size that tracks the viewport, so 853x480, 1280x720 and 1920x1080 all
  render the same proportional layout.
- The viewport meta tag matches the VIDAA web-app guide
  (`width=device-width, height=device-height`).
- A 5% overscan safe area is applied to screens, dialogs, the player overlay and
  the channel browse bar.
- Typography raised to a floor of roughly 18px at 1080p, with a clearer hierarchy.
- Focus is far more obvious: accent ring, offset halo and a lit surface. An active
  list item no longer outranks the focused one.
- Percentage-height panels replaced with flex and grid tracks, so no screen scrolls
  the page and only lists scroll.
- Settings scrolls the form rather than the screen, which keeps the action row
  inside the safe area at 720p and below.
- Cheaper painting: no large-blur shadows, and transitions reduced to a single
  90ms focus transform.

### Removed

- The `max-width: 1100px` and `min-width: 3000px` breakpoints, which existed only
  to patch specific resolutions.

## [1.0.0] - 2026-08-24

### Added

- Xtream Codes provider integration for live channels, movies and series, with a
  demo mode that needs no provider.
- XMLTV electronic programme guide with channel matching, now/next and refresh.
- HLS and MPEG-TS playback with resume, a seekable progress bar and remote media
  keys.
- A channel browse bar in the player showing now and next per channel.
- Favorites and recently watched, stored on the server.
- Explicit D-pad focus navigation covering every screen, including search fields.
- English and Portuguese translations, with a language choice on first run.
- Docker image and hosted deployment for the VIDAA web-app model.

[Unreleased]: https://github.com/arthurgca/vidaa-iptv/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/arthurgca/vidaa-iptv/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/arthurgca/vidaa-iptv/releases/tag/v1.0.0
