/**
 * Types for the libheif-js build we actually use (E2.2, issue #32).
 *
 * The package ships a `.d.ts` for its raw Emscripten surface (hundreds of `_heif_*`
 * numeric-pointer functions) but none for the pre-bundled ESM entry, which exposes the
 * small hand-written `HeifDecoder` wrapper instead. Rather than let the import fall to
 * `any`, this declares just what modules/image/heic.ts calls, so a libheif upgrade
 * that changes those members is a compile error.
 *
 * The default export is Emscripten's MODULARIZE *factory*, not the module: it has to
 * be called, and it resolves once the inlined WASM has been compiled. Getting that
 * wrong is silent - `libheif.HeifDecoder` is simply `undefined` on the un-called
 * factory - which is why it is spelled out in the type rather than left to `any`.
 *
 * Same pattern as intake/file-system-access.d.ts: a local declaration for a surface
 * the toolchain doesn't type for us.
 */
declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  /** One image inside a HEIF container. A live photo or burst holds several. */
  export interface HeifImage {
    /** Width after the container's own rotation/mirror transforms are applied. */
    get_width(): number
    get_height(): number
    /**
     * Renders into the given ImageData. Reports failure by invoking the callback with
     * nothing rather than throwing, which is why the caller checks the argument.
     */
    display(
      target: ImageData,
      callback: (result: ImageData | null | undefined) => void,
    ): void
    /**
     * Releases this image's WASM-side handle. Not optional housekeeping: the handle
     * lives in the Emscripten heap, which no JS garbage collector can reach, so an
     * unfreed one is leaked for the lifetime of the worker.
     *
     * `is_primary()` exists on the same wrapper but is deliberately not declared: in
     * the bundled build its body calls a bare `heif_image_handle_is_primary_image`
     * identifier that isn't in scope there, so it throws ReferenceError rather than
     * answering.
     */
    free(): void
  }

  /** Reused rather than constructed per file - see heic.ts's `decoder`. */
  export interface HeifDecoder {
    /**
     * Every top-level image in the container. Returns an empty array (after logging)
     * on unparseable bytes rather than throwing. Frees the previous call's container
     * context, which invalidates any HeifImage a previous call handed out.
     */
    decode(data: Uint8Array): HeifImage[]
  }

  export interface LibheifModule {
    HeifDecoder: new () => HeifDecoder
  }

  const createLibheif: () => Promise<LibheifModule>
  export default createLibheif
}
