// Starter content builders for each Section Library entry. Each returns a
// TipTap JSON `section` node inserted via editor.chain().insertContent(...).
const emptyPara = () => ({ type: 'paragraph' });
const col = (text) => ({ type: 'column', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] });

export const SECTION_PRESETS = [
  { id: 'hero', label: 'Hero / cover', icon: 'fa-image',
    build: () => ({ type: 'section', attrs: { layout: 'single', padding: 'xl', width: 'fullBleed' },
      content: [{ type: 'hero', attrs: { heading: 'Your headline', subheading: 'A short supporting line', align: 'center', overlay: false, bgImage: '' } }] }) },
  { id: 'text', label: 'Rich text', icon: 'fa-align-left',
    build: () => ({ type: 'section', attrs: { layout: 'single' }, content: [emptyPara()] }) },
  { id: 'mediaText', label: 'Media + text', icon: 'fa-image',
    build: () => ({ type: 'section', attrs: { layout: 'mediaText' }, content: [col(''), col('Describe it here.')] }) },
  { id: 'image', label: 'Image', icon: 'fa-image',
    build: () => ({ type: 'section', attrs: { layout: 'single', padding: 'm' },
      content: [{ type: 'image', attrs: { src: null, alt: '', align: 'center', width: null, widthUnit: 'px', caption: '' } }] }) },
  { id: 'cols2', label: 'Two columns', icon: 'fa-table-columns',
    build: () => ({ type: 'section', attrs: { layout: 'cols2' }, content: [col('Column one'), col('Column two')] }) },
  { id: 'cols3', label: 'Three columns', icon: 'fa-table-columns',
    build: () => ({ type: 'section', attrs: { layout: 'cols3' }, content: [col('One'), col('Two'), col('Three')] }) },
  { id: 'stats', label: 'Stat band', icon: 'fa-chart-simple',
    build: () => ({ type: 'section', attrs: { layout: 'single' },
      content: [{ type: 'statBand', attrs: { stats: [{ label: 'HOURS', value: '0' }, { label: 'TASKS', value: '0' }, { label: 'MEMBERS', value: '0' }] } }] }) },
  { id: 'quote', label: 'Quote', icon: 'fa-quote-right',
    build: () => ({ type: 'section', attrs: { layout: 'single', padding: 'l' },
      content: [{ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A memorable quote.' }] }] }] }) },
  { id: 'cta', label: 'Call to action', icon: 'fa-bullhorn',
    build: () => ({ type: 'section', attrs: { layout: 'single', padding: 'l' },
      content: [{ type: 'ctaButton', attrs: { label: 'Get involved', href: '', style: 'solid', align: 'center' } }] }) },
  { id: 'gallery', label: 'Image gallery', icon: 'fa-images',
    build: () => ({ type: 'section', attrs: { layout: 'single' }, content: [{ type: 'gallery', attrs: { images: [] } }] }) },
  { id: 'callout', label: 'Callout', icon: 'fa-circle-info',
    build: () => ({ type: 'section', attrs: { layout: 'single' }, content: [{ type: 'callout', attrs: { variant: 'info' }, content: [emptyPara()] }] }) },
  { id: 'divider', label: 'Divider', icon: 'fa-minus',
    build: () => ({ type: 'section', attrs: { layout: 'single', padding: 's' }, content: [{ type: 'horizontalRule' }] }) },
];
