# Webfonts

Sweet Sans Pro (Markanna Studios / MVB Fonts) is the primary title face.
The four-weight web subset is committed here and served from our own domain.

| weight | file |
|--------|------|
| 400 | `SweetSansPro-Regular.woff2` |
| 500 | `SweetSansPro-Medium.woff2` |
| 700 | `SweetSansPro-Bold.woff2` |
| 900 | `SweetSansPro-Heavy.woff2` |

Self-hosted fonts require `'self'` in the `font-src` CSP directive in `vercel.json`.
Without it the browser blocks the WOFF2 and silently falls back to Fraunces, which
still looks plausible — so **verify the face actually loaded** rather than trusting
that the page looks right:

```js
[...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight}`)
```
