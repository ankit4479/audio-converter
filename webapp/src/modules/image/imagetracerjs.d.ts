/**
 * Types for imagetracerjs (E2.4, issue #34), which ships none.
 *
 * Only `imagedataToSVG` is declared, because it is the only member this app uses and the
 * only one that is worker-safe: the library's other entry points (`imageToSVG`,
 * `appendSVGString`, `imageToCanvas`) reach for `document` to create elements and append
 * results, which a Worker has none of. Declaring just this one keeps that boundary
 * visible in the types rather than only in a comment.
 *
 * Same pattern as libheif-js.d.ts and intake/file-system-access.d.ts.
 */
declare module 'imagetracerjs' {
  /** The subset of imagetracerjs's options this app sets. The library accepts many
   *  more; these are the ones the settings schema exposes plus the two it pins. */
  export interface TracerOptions {
    /** Palette size the image is reduced to before paths are fitted. */
    numberofcolors?: number
    /** Paths shorter than this are dropped, which is what removes speckle. */
    pathomit?: number
    /** Straight-line simplification tolerance. */
    ltres?: number
    /** Curve simplification tolerance. */
    qtres?: number
    /** Pre-blur radius. Pinned to 0 here: blurring loses the crisp edges that are the
     *  reason to vectorize flat artwork at all. */
    blurradius?: number
  }

  /**
   * Traces raw pixels to an SVG string. Takes an ImageData-shaped object rather than a
   * real ImageData, which is why a plain `{ width, height, data }` is accepted.
   */
  export function imagedataToSVG(
    imageData: { width: number; height: number; data: Uint8ClampedArray },
    options?: TracerOptions,
  ): string
}
