# Audio Converter — web app

The browser companion to the [macOS Audio Converter](../README.md). Open the deployed
link, drag audio files or a folder in, pick a format, and the converted files save
straight to your machine. Nothing is uploaded — every conversion runs locally in your
browser using [Mediabunny](https://mediabunny.dev) and
[WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), with a WASM
encoder covering MP3 since no browser ships one natively.

This app is a work in progress. See the
[Phase 1: Browser app](https://github.com/ankit4479/audio-converter/milestone/1)
milestone for what's built and what's left.

## Develop

```sh
npm install
npm run dev
```

## Scripts

| Command             | Does                                               |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Local dev server with hot reload                   |
| `npm run build`     | Typecheck, then produce a static bundle in `dist/` |
| `npm run preview`   | Serve the production build locally                 |
| `npm run test`      | Run the unit test suite (Vitest)                   |
| `npm run lint`      | ESLint                                             |
| `npm run format`    | Prettier, writes in place                          |
| `npm run typecheck` | TypeScript, no emit                                |

## Third-party conversion libraries

Every conversion runs in your browser, so the codecs ship with the app:

| Library                                                                                                             | Used for                                                  | License    |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------- |
| [Mediabunny](https://mediabunny.dev)                                                                                | Audio decode and encode over WebCodecs                    | MIT        |
| [`@jsquash/*`](https://github.com/jamsinclair/jSquash)                                                              | WASM image encoders where a browser has no canvas encoder | Apache-2.0 |
| [libheif](https://github.com/strukturag/libheif) via [libheif-js](https://github.com/catdad-experiments/libheif-js) | HEIC and HEIF decode                                      | LGPL-3.0   |

libheif is used unmodified and loaded as its own chunk (`webapp/src/modules/image/heic.ts`
imports it dynamically), never fused into our own code, so it can be replaced with
another build of the library. Its license text is served with the deployed app at
`/licenses/libheif.txt` (`webapp/public/licenses/libheif.txt`, copied verbatim from
`node_modules/libheif-js/LICENSE`), since `node_modules` is not part of what a visitor
receives and the notice has to travel with the code that ships. The rest of this repo
is MIT.

## Why cross-origin isolation

The dev server and production deploy both send `Cross-Origin-Opener-Policy: same-origin`
and `Cross-Origin-Embedder-Policy: require-corp`. Those two headers turn on
`crossOriginIsolated`, which is required for `SharedArrayBuffer` and therefore for
multi-threaded WASM encoding. Without them the app still works, just single-threaded.
