# vendor/three

The one third-party library the site ships: **three.js r187** (`three@0.187.0`),
MIT licence — see `LICENSE` in this folder, which must stay beside the bundle.

| File | What it is |
|---|---|
| `three-hkeeli.min.js` | three.js, tree-shaken to the names the courtyard uses, minified. Loaded only by `js/courtyard/scene/*` and only on devices that get the 3D courtyard (see `js/courtyard/scene/quality.js`). Never loaded by the still-image view. |
| `entry.js` | The export list the bundle is built from. Generated — not served (`.assetsignore`). |
| `LICENSE` | three.js's MIT licence. |

Also bundled, from three.js's own addons (same licence): `RoundedBoxGeometry`
and `mergeGeometries` (BufferGeometryUtils).

## Rebuilding

Only needed when the courtyard starts using a three.js class it didn't use
before (the browser reports *"does not provide an export named …"*), or to
move to a newer three.js:

```bash
# in any scratch folder outside the repo
npm init -y
npm install three@0.187.0 esbuild@0.25.10
# from the repo root
node tools/build-three.mjs <that scratch folder>
```

The script reads every import from this bundle in `js/courtyard/`, writes
`entry.js`, and has esbuild tree-shake and minify against it. The site itself
still has no build step: the result is committed.

Size at r187: ~580 KB minified, ~150 KB gzipped (less with Brotli, which
Cloudflare serves).
