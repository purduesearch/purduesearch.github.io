import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";

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
    BlogImageNode,
    BlogEmbedNode,
    BlogGalleryNode,
    BlogTocNode,
    BlogCalloutNode,
    TableKit.configure({ table: { resizable: true } }),
  ];
}
