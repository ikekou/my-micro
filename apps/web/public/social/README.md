# Social preview

`my-micro.png` is the 1200 × 630 shared preview image for public pages. `my-micro.svg` is its editable source. The keyboard glyphs have the same provenance and rights limitations as those documented in `app/assets/micro-keycaps/README.md`; they are not covered by this repository's MIT license.

Public routes emit Open Graph and Twitter Card metadata in server-rendered HTML. Post pages use the public post's title and description with this common image. Canonical URLs exclude temporary browsing and authorization parameters. Missing posts do not emit social cards.

When replacing the PNG, keep its dimensions and metadata in `app/lib/social-meta.ts` in sync. Social networks may cache previews independently of the site; deployed HTML checks do not guarantee immediate refresh of an existing social post.
