# PDF export dependency

`pdf-lib.min.js` is the unmodified browser distribution of **pdf-lib 1.17.1**
(https://github.com/Hopding/pdf-lib), distributed under the MIT license in
`pdf-lib-LICENSE.md`.

It is served locally and loaded only when a user exports a resume. No CDN or
third-party document service receives profile data. To upgrade, replace the
browser distribution and its license together and run the resume export tests.

## Snap Camera Kit

`camera-kit-1.14.0.js` bundles the official `@snap/camera-kit@1.14.0` npm package as browser ESM using esbuild 0.27.0 (`--bundle --format=esm --minify --target=es2020`). Snap's license and third-party notices are in `camera-kit-LICENSE.md`. This optional SDK downloads its rendering runtime and lens assets from Snap. It is loaded only when a caller enables Snap Lenses. Local staging credentials are excluded from Git.
