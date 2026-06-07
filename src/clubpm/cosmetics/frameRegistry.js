// Name frames — registry of cssSlug → display name.
// Adding a new frame:
//   1. Append `.frame-<slug> > .member-name-card { ... }` to public/search-theme.css
//   2. Insert a Cosmetic row (category=NAME_FRAME, cssSlug=<slug>)
//   3. (Optional) add an entry below for the display label

const FRAMES = {
  laurel:   "Laurel",
  comet:    "Comet",
  stardust: "Stardust",
};

export default FRAMES;
