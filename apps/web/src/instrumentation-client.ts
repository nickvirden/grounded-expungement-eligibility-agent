// Next runs this file in the browser before any application module, which is
// the only point guaranteed to precede styled-components' evaluation.
//
// styled-components resolves its nonce once, when it first inserts a style tag,
// from `meta[property=csp-nonce]` and then from `__webpack_nonce__`, and caches
// the result. It creates its master sheet while its own module evaluates, and
// which application chunk evaluates it first varies with load order. When
// `notFound()` is thrown after an await, Next serves an error shell with an
// empty <head> and renders the layout in the browser, so the meta tag is not in
// the DOM yet and the cache would hold no nonce, blocking every style under the
// nonce-only `style-src`. A nonced script's `.nonce` property stays readable
// even though browsers hide the attribute.

// webpack's runtime nonce global; styled-components reads it as a fallback.
declare let __webpack_nonce__: string | undefined;

// Webpack folds the `typeof` check to "string" at build time; the dev bundler
// (Turbopack) does not define the global at all, and assigning it there would
// throw. Dev's `style-src` allows inline styles, so skipping it is harmless.
if (typeof __webpack_nonce__ !== 'undefined' && !__webpack_nonce__) {
  __webpack_nonce__ = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
}
