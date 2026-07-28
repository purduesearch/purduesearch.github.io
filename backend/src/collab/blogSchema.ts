import { Node, Mark } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";

// Schema-only mirrors of the custom nodes defined for the React editor in
// src/components/clubpm/blog/Blog{Image,Embed,Gallery,Toc,Callout}.jsx.
// No NodeView/rendering is needed here — this schema exists purely so
// @hocuspocus/transformer can convert the shared Yjs doc to/from TipTap JSON
// (used to derive the contentJson snapshot on store). Node `name` and
// `addAttributes()` must stay in sync with the client definitions.

const BlogImageNode = Node.create({
  name: "image",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      align: { default: "center" },
      width: { default: null },
      widthUnit: { default: "px" },
      caption: { default: "" },
      naturalWidth: { default: null },
      naturalHeight: { default: null },
    };
  },
});

const BlogEmbedNode = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      url: { default: "" },
      html: { default: "" },
      provider: { default: "link" },
    };
  },
});

const BlogGalleryNode = Node.create({
  name: "gallery",
  group: "block",
  atom: true,
  addAttributes() {
    // images: { src, alt, caption }[] — rendered as a carousel.
    return { images: { default: [] } };
  },
});

const BlogTocNode = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
});

const BlogCalloutNode = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  addAttributes() {
    return { variant: { default: "info" } };
  },
});

const SectionNode = Node.create({
  name: "section",
  group: "block",
  content: "(column | block)+",
  addAttributes() {
    return {
      layout: { default: "single" },
      background: { default: { kind: "none", value: "" } },
      padding: { default: "m" },
      width: { default: "contained" },
      theme: { default: "inherit" },
    };
  },
});

const ColumnNode = Node.create({
  name: "column",
  group: "block",
  content: "block+",
  addAttributes() {
    // 12-column grid span; null = equal share. Mirrors BlogColumn.jsx.
    return { span: { default: null } };
  },
});

const HeroNode = Node.create({
  name: "hero", group: "block", atom: true,
  addAttributes() {
    return { heading: { default: "" }, subheading: { default: "" }, bgImage: { default: "" }, align: { default: "center" }, overlay: { default: false } };
  },
});

const StatBandNode = Node.create({
  name: "statBand", group: "block", atom: true,
  addAttributes() { return { stats: { default: [] } }; },
});

const CtaNode = Node.create({
  name: "ctaButton", group: "block", atom: true,
  addAttributes() {
    return { label: { default: "Learn more" }, href: { default: "" }, style: { default: "solid" }, align: { default: "center" } };
  },
});

// Schema-only mirrors of the review marks defined for the React editor in
// src/components/clubpm/blog/suggestionMarks.js. @hocuspocus/transformer needs
// every mark present in the Y.Doc to exist here, or converting the shared doc
// to TipTap JSON fails and the derived contentJson snapshot breaks.
// Mark `name` and attributes must stay in sync with the client definitions.
const reviewMarkMirror = (name: string) => Mark.create({
  name,
  inclusive: false,
  excludes: "",
  addAttributes() {
    return { threadId: { default: null } };
  },
});

const CommentMarkMirror  = reviewMarkMirror("commentMark");
const SuggestInsertMirror = reviewMarkMirror("suggestInsert");
const SuggestDeleteMirror = reviewMarkMirror("suggestDelete");

// Mirrors blogExtensions() in BlogEditor.jsx (schema-relevant subset only —
// CharacterCount/Placeholder/SearchAndReplace add no nodes/marks so they're
// omitted here).
export function blogCollabExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextStyle.configure({ mergeNestedSpanStyles: true }),
    Highlight.configure({ multicolor: true }),
    BlogImageNode,
    BlogEmbedNode,
    BlogGalleryNode,
    BlogTocNode,
    BlogCalloutNode,
    SectionNode, ColumnNode, HeroNode, StatBandNode, CtaNode,
    TableKit.configure({ table: { resizable: true } }),
    CommentMarkMirror, SuggestInsertMirror, SuggestDeleteMirror,
  ];
}
