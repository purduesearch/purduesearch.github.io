// Body-rendered JSON-LD (Google parses JSON-LD anywhere in the DOM;
// React 19 head-hoisting does not cover inline scripts).
export default function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
