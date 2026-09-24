import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Breadcrumb from '../../components/Breadcrumb';
import SEOHead from '../../components/SEOHead';
import JsonLd from '../../components/JsonLd';
import { breadcrumbs } from '../../seo/schema';

// Top-edge masks (--tornA/B/C), paper grain (--grain), tape texture (--tape), and the
// ink-stamp mask (--stampink) are inline SVG data URIs, extracted verbatim from the design
// handoff file (`Field notebook redesign critique/design_handoff_field_notebook/Software
// Redesign Directions.dc.html`). Do not hand-edit these; regenerate from that source file
// if the artwork changes. They are applied as CSS custom properties on the page root and
// referenced via var(--x) throughout, exactly as the design file does. --tornRightBottom
// extends that treatment with a turbulence-displaced mask for the other exposed edges.
const PAPER_VARS = {
    "--paper": "#eee7d8",
    "--paper2": "#e2d8c3",
    "--ink": "#221d16",
    "--ink2": "#564b3f",
    "--mars": "#b83225",
    "--rule": "rgba(34,28,20,.18)",
    "--grid": "rgba(34,28,20,.05)",
    "--sitebg": "#181310",
    "--stampink": "url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22240%22%20height=%2296%22%3E%3Cfilter%20id=%22s%22%20x=%220%22%20y=%220%22%20width=%22100%25%22%20height=%22100%25%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.85%22%20numOctaves=%222%22%20seed=%229%22/%3E%3CfeColorMatrix%20type=%22matrix%22%20values=%220%200%200%200%201%200%200%200%200%201%200%200%200%200%201%20.9%20.9%20.9%200%20-.28%22/%3E%3C/filter%3E%3Crect%20width=%22240%22%20height=%2296%22%20filter=%22url(%23s)%22/%3E%3C/svg%3E')",
    "--tornA": "url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221200%22%20height=%2236%22%20viewBox=%220%200%201200%2036%22%20preserveAspectRatio=%22none%22%3E%3Cdefs%3E%3Cfilter%20id=%22a%22%20x=%22-2%25%22%20y=%22-100%25%22%20width=%22104%25%22%20height=%22340%25%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.55%200.85%22%20numOctaves=%223%22%20seed=%2211%22%20result=%22n%22/%3E%3CfeDisplacementMap%20in=%22SourceGraphic%22%20in2=%22n%22%20scale=%224%22%20xChannelSelector=%22R%22%20yChannelSelector=%22G%22/%3E%3C/filter%3E%3Cfilter%20id=%22b%22%20x=%22-2%25%22%20y=%22-100%25%22%20width=%22104%25%22%20height=%22340%25%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.9%201.2%22%20numOctaves=%222%22%20seed=%224%22%20result=%22n%22/%3E%3CfeDisplacementMap%20in=%22SourceGraphic%22%20in2=%22n%22%20scale=%225%22%20xChannelSelector=%22R%22%20yChannelSelector=%22G%22%20result=%22d%22/%3E%3CfeGaussianBlur%20in=%22d%22%20stdDeviation=%221.1%22/%3E%3C/filter%3E%3Cpath%20id=%22p%22%20fill=%22white%22%20d=%22M0,36%20L0,9.9%20L20.1,10.4%20L47.9,10.5%20L79.4,10.6%20L114.6,7.3%20L141.2,7.7%20L173.3,7.8%20L190.0,7.5%20L218.5,7.2%20L255.9,6.1%20L273.8,5.1%20L311.6,5.4%20L326.7,5.4%20L353.1,5.0%20L371.7,5.0%20L403.9,5.1%20L432.1,5.5%20L476.8,5.0%20L495.9,5.0%20L514.0,5.0%20L535.4,5.0%20L572.8,5.1%20L606.0,5.0%20L625.6,5.4%20L646.8,5.4%20L680.2,5.7%20L721.5,5.0%20L756.1,5.0%20L795.0,6.6%20L829.6,6.5%20L854.7,12.2%20L889.0,11.6%20L922.6,9.4%20L952.3,10.8%20L968.2,17.2%20L1003.4,17.9%20L1029.2,17.7%20L1056.3,16.4%20L1093.6,20.2%20L1120.9,20.6%20L1153.6,16.3%20L1182.5,15.5%20L1200.0,16.8%20L1200,36%20Z%22/%3E%3Cg%20id=%22f%22%20fill=%22white%22%3E%3Crect%20x=%22166%22%20y=%221.9%22%20width=%221.6%22%20height=%2210.1%22/%3E%3Crect%20x=%221040%22%20y=%222.6%22%20width=%221.4%22%20height=%2212.9%22/%3E%3Crect%20x=%22464%22%20y=%224.6%22%20width=%221.4%22%20height=%2212.6%22/%3E%3Crect%20x=%22137%22%20y=%223.0%22%20width=%221.3%22%20height=%227.8%22/%3E%3Crect%20x=%22820%22%20y=%223.6%22%20width=%221.2%22%20height=%2210.5%22/%3E%3Crect%20x=%22697%22%20y=%222.3%22%20width=%221.7%22%20height=%227.2%22/%3E%3C/g%3E%3C/defs%3E%3Cuse%20href=%22%23p%22%20filter=%22url(%23b)%22%20opacity=%220.45%22%20transform=%22translate(0,-2.4)%22/%3E%3Cuse%20href=%22%23p%22%20filter=%22url(%23a)%22/%3E%3Cuse%20href=%22%23f%22%20filter=%22url(%23a)%22%20opacity=%220.5%22/%3E%3C/svg%3E')",
    "--tornB": "url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221200%22%20height=%2236%22%20viewBox=%220%200%201200%2036%22%20preserveAspectRatio=%22none%22%3E%3Cdefs%3E%3Cfilter%20id=%22a%22%20x=%22-2%25%22%20y=%22-100%25%22%20width=%22104%25%22%20height=%22340%25%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.62%200.95%22%20numOctaves=%223%22%20seed=%2223%22%20result=%22n%22/%3E%3CfeDisplacementMap%20in=%22SourceGraphic%22%20in2=%22n%22%20scale=%223.4%22%20xChannelSelector=%22R%22%20yChannelSelector=%22G%22/%3E%3C/filter%3E%3Cfilter%20id=%22b%22%20x=%22-2%25%22%20y=%22-100%25%22%20width=%22104%25%22%20height=%22340%25%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%221.0%201.3%22%20numOctaves=%222%22%20seed=%229%22%20result=%22n%22/%3E%3CfeDisplacementMap%20in=%22SourceGraphic%22%20in2=%22n%22%20scale=%224.4%22%20xChannelSelector=%22R%22%20yChannelSelector=%22G%22%20result=%22d%22/%3E%3CfeGaussianBlur%20in=%22d%22%20stdDeviation=%221%22/%3E%3C/filter%3E%3Cpath%20id=%22p%22%20fill=%22white%22%20d=%22M0,36%20L0,10.4%20L37.6,9.3%20L75.9,7.8%20L95.0,8.8%20L137.8,9.6%20L178.4,8.7%20L212.8,8.6%20L240.5,10.2%20L258.5,9.9%20L297.2,10.1%20L318.6,10.3%20L348.5,9.4%20L387.9,11.0%20L404.9,9.3%20L445.1,9.7%20L489.4,8.3%20L519.8,7.7%20L556.2,8.0%20L581.7,8.0%20L597.4,8.2%20L635.1,8.2%20L670.5,7.8%20L702.4,7.2%20L720.4,6.0%20L745.2,5.0%20L760.1,5.8%20L776.2,5.0%20L817.8,5.0%20L862.6,5.5%20L883.2,6.5%20L922.2,5.3%20L967.6,13.7%20L995.7,14.7%20L1027.9,16.1%20L1051.5,13.9%20L1067.7,15.0%20L1098.2,16.7%20L1143.4,20.3%20L1170.6,19.3%20L1188.9,18.9%20L1200.0,18.6%20L1200,36%20Z%22/%3E%3Cg%20id=%22f%22%20fill=%22white%22%3E%3Crect%20x=%22749%22%20y=%224.5%22%20width=%221.5%22%20height=%227.9%22/%3E%3Crect%20x=%22413%22%20y=%223.4%22%20width=%221.6%22%20height=%2211.1%22/%3E%3Crect%20x=%22932%22%20y=%223.7%22%20width=%221.3%22%20height=%228.9%22/%3E%3Crect%20x=%22736%22%20y=%222.8%22%20width=%221.5%22%20height=%2210.3%22/%3E%3Crect%20x=%22353%22%20y=%221.8%22%20width=%221.6%22%20height=%229.8%22/%3E%3C/g%3E%3C/defs%3E%3Cuse%20href=%22%23p%22%20filter=%22url(%23b)%22%20opacity=%220.4%22%20transform=%22translate(0,-2.4)%22/%3E%3Cuse%20href=%22%23p%22%20filter=%22url(%23a)%22/%3E%3Cuse%20href=%22%23f%22%20filter=%22url(%23a)%22%20opacity=%220.5%22/%3E%3C/svg%3E')",
    "--tornC": "url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221200%22%20height=%2236%22%20viewBox=%220%200%201200%2036%22%20preserveAspectRatio=%22none%22%3E%3Cdefs%3E%3Cfilter%20id=%22a%22%20x=%22-2%25%22%20y=%22-100%25%22%20width=%22104%25%22%20height=%22340%25%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.48%200.78%22%20numOctaves=%223%22%20seed=%2231%22%20result=%22n%22/%3E%3CfeDisplacementMap%20in=%22SourceGraphic%22%20in2=%22n%22%20scale=%224.6%22%20xChannelSelector=%22R%22%20yChannelSelector=%22G%22/%3E%3C/filter%3E%3Cfilter%20id=%22b%22%20x=%22-2%25%22%20y=%22-100%25%22%20width=%22104%25%22%20height=%22340%25%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.85%201.15%22%20numOctaves=%222%22%20seed=%2215%22%20result=%22n%22/%3E%3CfeDisplacementMap%20in=%22SourceGraphic%22%20in2=%22n%22%20scale=%225.6%22%20xChannelSelector=%22R%22%20yChannelSelector=%22G%22%20result=%22d%22/%3E%3CfeGaussianBlur%20in=%22d%22%20stdDeviation=%221.3%22/%3E%3C/filter%3E%3Cpath%20id=%22p%22%20fill=%22white%22%20d=%22M0,36%20L0,10.9%20L33.3,5.7%20L63.4,7.3%20L79.4,8.7%20L113.3,9.6%20L149.5,10.7%20L170.8,10.5%20L195.6,10.8%20L234.1,7.3%20L279.3,7.3%20L319.5,6.9%20L351.3,7.0%20L380.1,8.3%20L397.0,8.7%20L443.0,8.1%20L471.2,8.1%20L491.5,14.4%20L512.2,13.4%20L545.4,13.7%20L568.7,14.2%20L583.0,14.7%20L604.4,9.5%20L632.8,8.7%20L659.0,8.7%20L685.2,7.6%20L702.0,7.8%20L744.4,14.1%20L782.5,9.5%20L814.1,7.9%20L829.0,6.4%20L867.6,7.9%20L902.0,7.8%20L945.5,11.0%20L990.2,11.6%20L1026.9,10.3%20L1042.9,10.6%20L1074.4,10.7%20L1098.0,11.3%20L1131.2,9.3%20L1155.4,9.7%20L1196.2,6.2%20L1200.0,5.0%20L1200,36%20Z%22/%3E%3Cg%20id=%22f%22%20fill=%22white%22%3E%3Crect%20x=%22999%22%20y=%221.8%22%20width=%221.3%22%20height=%2210.4%22/%3E%3Crect%20x=%22891%22%20y=%222.1%22%20width=%221.6%22%20height=%2211.9%22/%3E%3Crect%20x=%22167%22%20y=%223.6%22%20width=%221.6%22%20height=%2213.0%22/%3E%3Crect%20x=%22879%22%20y=%224.4%22%20width=%221.6%22%20height=%2212.2%22/%3E%3Crect%20x=%22489%22%20y=%222.1%22%20width=%221.2%22%20height=%229.0%22/%3E%3Crect%20x=%22506%22%20y=%224.6%22%20width=%221.5%22%20height=%227.5%22/%3E%3Crect%20x=%22100%22%20y=%221.6%22%20width=%221.4%22%20height=%2210.1%22/%3E%3C/g%3E%3C/defs%3E%3Cuse%20href=%22%23p%22%20filter=%22url(%23b)%22%20opacity=%220.5%22%20transform=%22translate(0,-2.4)%22/%3E%3Cuse%20href=%22%23p%22%20filter=%22url(%23a)%22/%3E%3Cuse%20href=%22%23f%22%20filter=%22url(%23a)%22%20opacity=%220.5%22/%3E%3C/svg%3E')",
    "--tornRightBottom": "url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221200%22%20height=%22900%22%20viewBox=%220%200%201200%20900%22%20preserveAspectRatio=%22none%22%3E%3Cdefs%3E%3Cfilter%20id=%22t%22%20x=%22-4%25%22%20y=%22-5%25%22%20width=%22108%25%22%20height=%22110%25%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.018%200.032%22%20numOctaves=%224%22%20seed=%2253%22%20result=%22n%22/%3E%3CfeDisplacementMap%20in=%22SourceGraphic%22%20in2=%22n%22%20scale=%2218%22%20xChannelSelector=%22R%22%20yChannelSelector=%22G%22/%3E%3C/filter%3E%3C/defs%3E%3Crect%20x=%22-32%22%20y=%2210%22%20width=%221224%22%20height=%22882%22%20fill=%22white%22%20filter=%22url(%23t)%22/%3E%3C/svg%3E')",
    "--grain": "url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22180%22%20height=%22180%22%3E%3Cfilter%20id=%22n%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.85%22%20numOctaves=%222%22%20stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect%20width=%22180%22%20height=%22180%22%20filter=%22url(%23n)%22/%3E%3C/svg%3E')",
    "--tape": "url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22120%22%20height=%2240%22%20viewBox=%220%200%20120%2040%22%20preserveAspectRatio=%22none%22%3E%3Cdefs%3E%3Cfilter%20id=%22t%22%20x=%22-10%25%22%20y=%22-25%25%22%20width=%22120%25%22%20height=%22150%25%22%3E%3CfeTurbulence%20type=%22fractalNoise%22%20baseFrequency=%220.5%200.09%22%20numOctaves=%222%22%20seed=%226%22%20result=%22n%22/%3E%3CfeDisplacementMap%20in=%22SourceGraphic%22%20in2=%22n%22%20scale=%225%22%20xChannelSelector=%22R%22%20yChannelSelector=%22G%22/%3E%3C/filter%3E%3C/defs%3E%3Crect%20x=%224%22%20y=%224%22%20width=%22112%22%20height=%2232%22%20fill=%22white%22%20filter=%22url(%23t)%22/%3E%3C/svg%3E')",
};

// Scoped to this page only (rendered via a plain <style> tag, not a shared stylesheet) —
// see src/AGENTS.md on the three-stylesheet split; this keyframe has nowhere reusable to
// live and every visitor to the rest of the site would otherwise pay for it.
const NOTEBOOK_STYLE = `
@keyframes visor-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

/* The notebook reads as a stack of separate sheets. Keep the bound left edge
   straight; the top mask plus this right/bottom outline supply the torn edges. */
.field-notebook-page [data-page] + [data-page] {
  margin-top: clamp(26px, 3.2vw, 44px) !important;
}
.field-notebook-page [data-stick] {
  filter: drop-shadow(0 14px 22px rgba(10, 6, 4, .38));
  perspective: none !important;
}
.field-notebook-page [data-leaf] {
  backface-visibility: visible !important;
  mask-image: var(--tornRightBottom);
  mask-position: left top;
  mask-repeat: no-repeat;
  mask-size: 100% 100%;
  transform: none !important;
  will-change: auto !important;
  -webkit-mask-image: var(--tornRightBottom);
  -webkit-mask-position: left top;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%;
}
.field-notebook-page [data-shadow],
.field-notebook-page [data-curl],
.field-notebook-page [data-under] {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .field-notebook-marquee { animation: none !important; }
}
`;

const FieldNotebook = () => {
  useEffect(() => {
    if (window.AOS) window.AOS.init({ once: true });
  }, []);

  return (
    <div className="field-notebook-page">
      <SEOHead
        title="VISOR Field Notebook — NASA SUITS"
        description="A working record of Purdue SEARCH's VISOR team: the 2026-27 research log, test & evaluation plan, prior NASA SUITS work, and sponsor requirements."
        canonical="/software"
      />
      <JsonLd data={breadcrumbs([
        { name: 'Home', path: '/' },
        { name: 'Software', path: '/software' },
      ])} />
      <Navbar solid />
      <Breadcrumb />
      <style>{NOTEBOOK_STYLE}</style>

      <div
        style={{
          position: 'relative',
          fontFamily: "'Zilla Slab',Georgia,serif",
          ...PAPER_VARS,
        }}
      >
      <div style={{ position: "relative", background: "var(--sitebg)", padding: "clamp(18px,2.4vw,40px) 0 0" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 clamp(10px,2.2vw,32px)" }}>
          <div data-page="" data-screen-label="PG 01" style={{ position: "relative" }}>
            <div data-stick="" style={{ position: "relative", perspective: "2400px", perspectiveOrigin: "50% 0%" }}>
              <div data-leaf="" style={{ position: "relative", transformOrigin: "50% 0%", backfaceVisibility: "hidden", willChange: "transform" }}>
                <div data-shadow="" style={{ position: "absolute", left: "8px", right: "8px", top: "26px", bottom: "0", boxShadow: "0 12px 30px rgba(10,6,4,.42)", pointerEvents: "none" }} />
                <div data-paper="" style={{ position: "relative", boxSizing: "border-box", transform: "rotate(-.25deg)", backgroundColor: "var(--paper)", backgroundImage: "radial-gradient(120% 70% at 18% 3%,rgba(255,255,255,.55),rgba(255,255,255,0) 58%),radial-gradient(85% 55% at 88% 88%,rgba(138,112,74,.07),rgba(138,112,74,0) 72%),repeating-linear-gradient(0deg,var(--grid) 0px,var(--grid) 1px,transparent 1px,transparent 27px),repeating-linear-gradient(90deg,var(--grid) 0px,var(--grid) 1px,transparent 1px,transparent 27px)", maskImage: "var(--tornA),linear-gradient(black,black)", maskSize: "100% 34px,100% calc(100% - 32px)", maskPosition: "left top,left 32px", maskRepeat: "no-repeat", WebkitMaskImage: "var(--tornA),linear-gradient(black,black)", WebkitMaskSize: "100% 34px,100% calc(100% - 32px)", WebkitMaskPosition: "left top,left 32px", WebkitMaskRepeat: "no-repeat", padding: "clamp(46px,4vw,62px) clamp(16px,3.2vw,54px) clamp(30px,3.4vw,54px) clamp(42px,5.4vw,88px)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: "0", pointerEvents: "none", backgroundImage: "var(--grain)", backgroundSize: "180px 180px", opacity: ".05", mixBlendMode: "multiply" }} />
                  <div style={{ position: "absolute", left: "0", right: "0", top: "0", height: "10px", pointerEvents: "none", background: "linear-gradient(to bottom,rgba(58,40,20,.24),rgba(58,40,20,.06) 45%,rgba(58,40,20,0))" }} />
                  <div style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "clamp(42px,5.4vw,88px)", pointerEvents: "none" }}>
                    <div style={{ position: "absolute", right: "10px", top: "0", bottom: "0", width: "1px", background: "var(--mars)", opacity: ".42" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", top: "108px", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", top: "50%", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)", transform: "translateY(-50%)" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", bottom: "108px", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap", borderBottom: "1px solid var(--rule)", paddingBottom: "9px", marginBottom: "27px" }}>
                    <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink2)" }}>
                      VISOR — Field Notebook
                    </span>
                    <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".04em", color: "var(--ink2)" }}>
                      PG. 01 / 05
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(330px,100%),1fr))", gap: "27px 40px", alignItems: "start" }}>
                    <div style={{ minWidth: "0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "13px" }}>
                        <span style={{ display: "inline-block", borderStyle: "solid", borderColor: "var(--mars)", borderWidth: "2px 1.5px 2.5px 1.5px", borderRadius: "1.5px", color: "var(--mars)", fontFamily: "'Special Elite','Courier New',monospace", textTransform: "uppercase", transform: "rotate(-3.4deg)", opacity: ".94", maskImage: "var(--stampink)", WebkitMaskImage: "var(--stampink)", maskSize: "240px 96px", WebkitMaskSize: "240px 96px", maskPosition: "0 0", WebkitMaskPosition: "0 0", filter: "blur(.18px)", fontSize: "12.5px", letterSpacing: ".13em", padding: "5px 11px 4px" }}>
                          Field Notebook
                        </span>
                        <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--ink2)" }}>
                          Vol. 2026–27
                        </span>
                      </div>
                      <h1 style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "800", fontSize: "clamp(52px,7vw,98px)", letterSpacing: "-.008em", color: "var(--ink)", margin: "0", lineHeight: ".9" }}>
                        VISOR
                      </h1>
                      <span style={{ position: "relative", display: "inline-block", fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", letterSpacing: ".02em", color: "var(--mars)", marginTop: "13px", borderBottom: "1px solid rgba(184,50,37,.6)", paddingBottom: "3px" }}>
                        rev 2026–27 — research & development cycle
                      </span>
                      <p style={{ fontSize: "17px", lineHeight: "29px", color: "var(--ink2)", margin: "20px 0 0", maxWidth: "50ch" }}>
                        Purdue SEARCH · NASA SUITS — a working record of the VISOR team’s 2026–27 research and development, and what it takes to get to Houston.
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 40px", marginTop: "27px", alignItems: "baseline", paddingTop: "16px", borderTop: "1px solid var(--rule)" }}>
                        <div>
                          <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "30px", color: "var(--ink)" }}>
                            30+
                          </span>
                          <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--ink2)", marginLeft: "8px" }}>
                            members
                          </span>
                        </div>
                        <div>
                          <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "30px", color: "var(--ink)" }}>
                            2×
                          </span>
                          <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--ink2)", marginLeft: "8px" }}>
                            innovation award, 3 seasons
                          </span>
                        </div>
                        <div>
                          <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "25px", color: "var(--ink)" }}>
                            2026–27
                          </span>
                          <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--ink2)", marginLeft: "8px" }}>
                            cycle
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ position: "relative", minWidth: "0", transform: "rotate(1.4deg)", marginTop: "8px" }}>
                      <div style={{ aspectRatio: "4/3", backgroundImage: "repeating-linear-gradient(45deg,var(--paper2),var(--paper2) 10px,#d6caaf 10px,#d6caaf 20px)", border: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(20,12,6,.14)" }}>
                        <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--ink2)", textTransform: "uppercase", letterSpacing: ".02em", textAlign: "center", padding: "0 12px" }}>
                          photo placeholder — working session
                        </span>
                      </div>
                      <span style={{ position: "absolute", top: "-11px", left: "18px", width: "64px", height: "22px", background: "linear-gradient(104deg,rgba(255,253,246,.52),rgba(236,230,215,.32) 45%,rgba(255,255,255,.46))", maskImage: "var(--tape)", maskSize: "100% 100%", WebkitMaskImage: "var(--tape)", WebkitMaskSize: "100% 100%", transform: "rotate(-7deg)", filter: "drop-shadow(0 1px 1.5px rgba(30,18,8,.22))" }} />
                      <span style={{ position: "absolute", top: "-9px", right: "22px", width: "58px", height: "20px", background: "linear-gradient(80deg,rgba(255,255,250,.46),rgba(238,232,218,.3) 55%,rgba(255,255,255,.42))", maskImage: "var(--tape)", maskSize: "100% 100%", WebkitMaskImage: "var(--tape)", WebkitMaskSize: "100% 100%", transform: "rotate(5deg)", filter: "drop-shadow(0 1px 1.5px rgba(30,18,8,.2))" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", flexWrap: "wrap", marginTop: "9px" }}>
                        <p style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", lineHeight: "1.55", color: "var(--ink2)", margin: "0", maxWidth: "34ch" }}>
                          fig — VISOR members reviewing system design
                        </p>
                        <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", color: "var(--mars)", border: "1px solid var(--mars)", padding: "2px 6px", whiteSpace: "nowrap" }}>
                          IMG–000A
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: "27px", paddingTop: "20px", borderTop: "1px solid var(--rule)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: "20px 40px", alignItems: "start" }}>
                    <div style={{ minWidth: "0" }}>
                      <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".05em", color: "var(--mars)", marginBottom: "22px" }}>
                        TEAM LEADS — EQUAL RESPONSIBILITY
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(190px,100%),1fr))", gap: "18px" }}>
                        <div style={{ border: "1px solid var(--ink)", position: "relative", padding: "20px 16px 18px" }}>
                          <span style={{ position: "absolute", top: "-9px", left: "12px", background: "var(--paper)", padding: "0 6px", fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "9.5px", letterSpacing: ".05em", color: "var(--mars)" }}>
                            TEAM LEAD
                          </span>
                          <div style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "21px", color: "var(--ink)" }}>
                            Jason White
                          </div>
                        </div>
                        <div style={{ border: "1px solid var(--ink)", position: "relative", padding: "20px 16px 18px" }}>
                          <span style={{ position: "absolute", top: "-9px", left: "12px", background: "var(--paper)", padding: "0 6px", fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "9.5px", letterSpacing: ".05em", color: "var(--mars)" }}>
                            TEAM LEAD
                          </span>
                          <div style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "21px", color: "var(--ink)" }}>
                            Azeem Ehtisham
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ minWidth: "0" }}>
                      <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".05em", color: "var(--ink2)", marginBottom: "22px" }}>
                        STUDENT PARTICIPATION — ALL DISCIPLINES
                      </div>
                      <p style={{ fontSize: "16px", lineHeight: "28px", color: "var(--ink2)", margin: "0", maxWidth: "42ch" }}>
                        Purdue students: VISOR is looking for builders, researchers, and communicators. 
                        <Link to="/contact" style={{ color: "var(--mars)", fontWeight: "700", textDecoration: "none", borderBottom: "1px solid var(--mars)" }}>
                          Get in touch.
                        </Link>
                      </p>
                    </div>
                  </div>
                  <div data-curl="" style={{ position: "absolute", inset: "0", zIndex: "3", pointerEvents: "none", opacity: "0", background: "linear-gradient(to bottom,rgba(255,255,255,.5) 0%,rgba(255,255,255,0) 9%,rgba(28,17,9,0) 42%,rgba(28,17,9,.5) 100%)", left: "4px", top: "-24px" }} />
                  <div data-under="" style={{ position: "absolute", inset: "0", zIndex: "2", pointerEvents: "none", opacity: "0", background: "linear-gradient(to bottom,rgba(16,9,5,.6) 0%,rgba(16,9,5,.18) 42%,rgba(16,9,5,0) 78%)" }} />
                </div>
              </div>
            </div>
          </div>
          <div data-page="" data-screen-label="PG 02" style={{ position: "relative", marginTop: "-16px" }}>
            <div data-stick="" style={{ position: "relative", perspective: "2400px", perspectiveOrigin: "50% 0%" }}>
              <div data-leaf="" style={{ position: "relative", transformOrigin: "50% 0%", backfaceVisibility: "hidden", willChange: "transform" }}>
                <div data-shadow="" style={{ position: "absolute", left: "8px", right: "8px", top: "26px", bottom: "0", boxShadow: "0 12px 30px rgba(10,6,4,.42)", pointerEvents: "none" }} />
                <div data-paper="" style={{ position: "relative", boxSizing: "border-box", transform: "rotate(.18deg)", backgroundColor: "var(--paper)", backgroundImage: "radial-gradient(110% 60% at 78% 6%,rgba(255,255,255,.5),rgba(255,255,255,0) 60%),radial-gradient(90% 60% at 12% 92%,rgba(138,112,74,.06),rgba(138,112,74,0) 70%),repeating-linear-gradient(0deg,var(--grid) 0px,var(--grid) 1px,transparent 1px,transparent 27px),repeating-linear-gradient(90deg,var(--grid) 0px,var(--grid) 1px,transparent 1px,transparent 27px)", maskImage: "var(--tornB),linear-gradient(black,black)", maskSize: "100% 34px,100% calc(100% - 32px)", maskPosition: "left top,left 32px", maskRepeat: "no-repeat", WebkitMaskImage: "var(--tornB),linear-gradient(black,black)", WebkitMaskSize: "100% 34px,100% calc(100% - 32px)", WebkitMaskPosition: "left top,left 32px", WebkitMaskRepeat: "no-repeat", padding: "clamp(46px,4vw,62px) clamp(16px,3.2vw,54px) clamp(30px,3.4vw,54px) clamp(42px,5.4vw,88px)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: "0", pointerEvents: "none", backgroundImage: "var(--grain)", backgroundSize: "180px 180px", opacity: ".045", mixBlendMode: "multiply" }} />
                  <div style={{ position: "absolute", left: "0", right: "0", top: "0", height: "10px", pointerEvents: "none", background: "linear-gradient(to bottom,rgba(58,40,20,.24),rgba(58,40,20,.06) 45%,rgba(58,40,20,0))" }} />
                  <div style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "clamp(42px,5.4vw,88px)", pointerEvents: "none" }}>
                    <div style={{ position: "absolute", right: "10px", top: "0", bottom: "0", width: "1px", background: "var(--mars)", opacity: ".42" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", top: "108px", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", top: "50%", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)", transform: "translateY(-50%)" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", bottom: "108px", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)" }} />
                    <div style={{ position: "absolute", right: "16px", top: "33%", width: "7px", height: "1px", background: "var(--ink2)", opacity: ".5" }} />
                    <div style={{ position: "absolute", right: "16px", top: "66%", width: "11px", height: "1px", background: "var(--ink2)", opacity: ".5" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap", borderBottom: "1px solid var(--rule)", paddingBottom: "9px", marginBottom: "27px" }}>
                    <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink2)" }}>
                      VISOR — Field Notebook
                    </span>
                    <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".04em", color: "var(--ink2)" }}>
                      PG. 02 / 05
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "5px" }}>
                    <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "15px", color: "var(--mars)" }}>
                      01
                    </span>
                    <h2 style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "clamp(23px,2.2vw,31px)", color: "var(--ink)", margin: "0", textTransform: "uppercase", letterSpacing: ".02em" }}>
                      Research Log
                    </h2>
                  </div>
                  <p style={{ fontSize: "16px", lineHeight: "28px", color: "var(--ink2)", margin: "0 0 27px", maxWidth: "64ch" }}>
                    The 2026–27 work recorded below represents research directions and prototype development, not a finalized system architecture.
                  </p>
                  <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "16px", marginBottom: "27px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", alignItems: "baseline", marginBottom: "8px" }}>
                      <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "12px", color: "var(--mars)" }}>
                        R–01
                      </span>
                      <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "20px", color: "var(--ink)" }}>
                        XR headset development
                      </span>
                      <span style={{ border: "1px solid var(--ink)", fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "9.5px", letterSpacing: ".04em", padding: "2px 7px", color: "var(--ink2)" }}>
                        ACTIVE
                      </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 28px", fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", lineHeight: "15px", color: "var(--ink2)", marginBottom: "9px" }}>
                      <div>
                        PROTOTYPE ID 
                        <span style={{ color: "var(--ink)" }}>
                          HMD–01
                        </span>
                      </div>
                      <div>
                        PLATFORM 
                        <span style={{ color: "var(--ink)" }}>
                          HoloLens 2
                        </span>
                      </div>
                    </div>
                    <p style={{ fontSize: "15px", lineHeight: "26px", color: "var(--ink2)", margin: "0", maxWidth: "64ch" }}>
                      Developing the mission interface on Microsoft HoloLens 2, with a custom headset platform as a longer-term research direction.
                    </p>
                  </div>
                  <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "16px", marginBottom: "27px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 340px", minWidth: "0" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", alignItems: "baseline", marginBottom: "8px" }}>
                        <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "12px", color: "var(--mars)" }}>
                          R–02
                        </span>
                        <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "20px", color: "var(--ink)" }}>
                          LiDAR sensing + robotic-arm assistance
                        </span>
                        <span style={{ border: "1px solid var(--mars)", color: "var(--mars)", fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "9.5px", letterSpacing: ".04em", padding: "2px 7px", transform: "rotate(-2deg)", display: "inline-block" }}>
                          EXPLORATORY
                        </span>
                      </div>
                      <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", lineHeight: "15px", color: "var(--ink2)", marginBottom: "9px" }}>
                        PROTOTYPE ID 
                        <span style={{ color: "var(--ink)" }}>
                          NAV–02
                        </span>
                      </div>
                      <p style={{ fontSize: "15px", lineHeight: "26px", color: "var(--ink2)", margin: "0", maxWidth: "60ch" }}>
                        Spatial sensing for unfamiliar terrain, studied alongside whether a robotic arm can extend navigation and interaction when attention and mobility are constrained — treated as one investigation, not two separate features.
                      </p>
                    </div>
                    <div style={{ width: "168px", flexShrink: "0", position: "relative", paddingTop: "6px", marginLeft: "40px" }}>
                      <div style={{ border: "1px dashed var(--ink2)", padding: "10px", fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", lineHeight: "1.55", color: "var(--ink2)", textAlign: "center" }}>
                        terrain scan — concept
                      </div>
                      <span style={{ display: "inline-block", marginTop: "8px", color: "var(--mars)", fontFamily: "'Caveat Brush',cursive", fontSize: "17px", lineHeight: "1.1", transform: "rotate(-2.4deg)" }}>
                        check clearance
                      </span>
                      <svg width="40" height="28" viewBox="0 0 40 28" aria-hidden="true" style={{ position: "absolute", left: "-38px", top: "24px" }}>
                        <line x1="0" y1="4" x2="30" y2="16" stroke="#b83225" strokeWidth="1.5" strokeDasharray="4 3" />
                        <polygon points="30,10 38,16 30,22" fill="#b83225" />
                      </svg>
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--rule)", paddingTop: "16px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", alignItems: "baseline", marginBottom: "8px" }}>
                      <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "12px", color: "var(--mars)" }}>
                        R–03
                      </span>
                      <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "20px", color: "var(--ink)" }}>
                        Machine learning task support
                      </span>
                      <span style={{ border: "1px solid var(--ink)", fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "9.5px", letterSpacing: ".04em", padding: "2px 7px", color: "var(--ink2)" }}>
                        PROTOTYPE
                      </span>
                    </div>
                    <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", lineHeight: "15px", color: "var(--ink2)", marginBottom: "9px" }}>
                      PROTOTYPE ID 
                      <span style={{ color: "var(--ink)" }}>
                        ML–03
                      </span>
                    </div>
                    <p style={{ fontSize: "15px", lineHeight: "26px", color: "var(--ink2)", margin: "0", maxWidth: "62ch" }}>
                      Prototyping assistance that helps an operator act on the right information at the right moment, without adding another interface to manage.
                    </p>
                  </div>
                  <div data-curl="" style={{ position: "absolute", inset: "0", zIndex: "3", pointerEvents: "none", opacity: "0", background: "linear-gradient(to bottom,rgba(255,255,255,.5) 0%,rgba(255,255,255,0) 9%,rgba(28,17,9,0) 42%,rgba(28,17,9,.5) 100%)" }} />
                  <div data-under="" style={{ position: "absolute", inset: "0", zIndex: "2", pointerEvents: "none", opacity: "0", background: "linear-gradient(to bottom,rgba(16,9,5,.6) 0%,rgba(16,9,5,.18) 42%,rgba(16,9,5,0) 78%)" }} />
                </div>
              </div>
            </div>
          </div>
          <div data-page="" data-screen-label="PG 03" style={{ position: "relative", marginTop: "-16px" }}>
            <div data-stick="" style={{ position: "relative", perspective: "2400px", perspectiveOrigin: "50% 0%" }}>
              <div data-leaf="" style={{ position: "relative", transformOrigin: "50% 0%", backfaceVisibility: "hidden", willChange: "transform" }}>
                <div data-shadow="" style={{ position: "absolute", left: "8px", right: "8px", top: "26px", bottom: "0", boxShadow: "0 12px 30px rgba(10,6,4,.42)", pointerEvents: "none" }} />
                <div data-paper="" style={{ position: "relative", boxSizing: "border-box", transform: "rotate(-.12deg)", backgroundColor: "var(--paper)", backgroundImage: "radial-gradient(120% 65% at 30% 5%,rgba(255,255,255,.48),rgba(255,255,255,0) 62%),radial-gradient(80% 50% at 92% 70%,rgba(138,112,74,.07),rgba(138,112,74,0) 72%),repeating-linear-gradient(0deg,var(--grid) 0px,var(--grid) 1px,transparent 1px,transparent 27px),repeating-linear-gradient(90deg,var(--grid) 0px,var(--grid) 1px,transparent 1px,transparent 27px)", maskImage: "var(--tornC),linear-gradient(black,black)", maskSize: "100% 34px,100% calc(100% - 32px)", maskPosition: "left top,left 32px", maskRepeat: "no-repeat", WebkitMaskImage: "var(--tornC),linear-gradient(black,black)", WebkitMaskSize: "100% 34px,100% calc(100% - 32px)", WebkitMaskPosition: "left top,left 32px", WebkitMaskRepeat: "no-repeat", padding: "clamp(46px,4vw,62px) clamp(16px,3.2vw,54px) clamp(30px,3.4vw,54px) clamp(42px,5.4vw,88px)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: "0", pointerEvents: "none", backgroundImage: "var(--grain)", backgroundSize: "180px 180px", opacity: ".05", mixBlendMode: "multiply" }} />
                  <div style={{ position: "absolute", left: "0", right: "0", top: "0", height: "10px", pointerEvents: "none", background: "linear-gradient(to bottom,rgba(58,40,20,.24),rgba(58,40,20,.06) 45%,rgba(58,40,20,0))" }} />
                  <div style={{ position: "absolute", right: "0", bottom: "0", width: "46px", height: "46px", pointerEvents: "none", background: "linear-gradient(135deg,rgba(30,18,8,.16),rgba(30,18,8,0) 55%),linear-gradient(315deg,var(--paper2) 0%,var(--paper) 70%)", clipPath: "polygon(100% 0,100% 100%,0 100%)", boxShadow: "-1px -1px 2px rgba(30,18,8,.14) inset" }} />
                  <div style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "clamp(42px,5.4vw,88px)", pointerEvents: "none" }}>
                    <div style={{ position: "absolute", right: "10px", top: "0", bottom: "0", width: "1px", background: "var(--mars)", opacity: ".42" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", top: "108px", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", top: "50%", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)", transform: "translateY(-50%)" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", bottom: "108px", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap", borderBottom: "1px solid var(--rule)", paddingBottom: "9px", marginBottom: "27px" }}>
                    <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink2)" }}>
                      VISOR — Field Notebook
                    </span>
                    <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".04em", color: "var(--ink2)" }}>
                      PG. 03 / 05
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap", marginBottom: "5px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                      <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "15px", color: "var(--mars)" }}>
                        02
                      </span>
                      <h2 style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "clamp(23px,2.2vw,31px)", color: "var(--ink)", margin: "0", textTransform: "uppercase", letterSpacing: ".02em" }}>
                        Test & Evaluation Record
                      </h2>
                    </div>
                    <span style={{ display: "inline-block", borderStyle: "solid", borderColor: "var(--mars)", borderWidth: "2px 1.5px 2.5px 1.5px", borderRadius: "1.5px", color: "var(--mars)", fontFamily: "'Special Elite','Courier New',monospace", textTransform: "uppercase", transform: "rotate(2.7deg)", opacity: ".94", maskImage: "var(--stampink)", WebkitMaskImage: "var(--stampink)", maskSize: "240px 96px", WebkitMaskSize: "240px 96px", maskPosition: "-58px -14px", WebkitMaskPosition: "-58px -14px", filter: "blur(.18px)", fontSize: "12.5px", letterSpacing: ".13em", padding: "5px 11px 4px" }}>
                      Test Record
                    </span>
                  </div>
                  <p style={{ fontSize: "16px", lineHeight: "28px", color: "var(--ink2)", margin: "0 0 27px", maxWidth: "64ch" }}>
                    Two of the 2026–27 directions concern how VISOR tests, not what it builds.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
                    <div style={{ padding: "18px 22px 18px 0" }}>
                      <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--mars)", marginBottom: "6px" }}>
                        01
                      </div>
                      <div style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "17px", color: "var(--ink)", marginBottom: "4px" }}>
                        Prototype
                      </div>
                      <p style={{ fontSize: "13.5px", lineHeight: "22.5px", color: "var(--ink2)", margin: "0" }}>
                        Build a focused hardware or interface hypothesis.
                      </p>
                    </div>
                    <div style={{ padding: "18px 0 18px 22px", borderLeft: "1px solid var(--rule)" }}>
                      <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--mars)", marginBottom: "6px" }}>
                        02
                      </div>
                      <div style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "17px", color: "var(--ink)", marginBottom: "4px" }}>
                        Run it at Purdue
                      </div>
                      <p style={{ fontSize: "13.5px", lineHeight: "22.5px", color: "var(--ink2)", margin: "0" }}>
                        A mock test location is planned so integrated scenarios can happen earlier and more often.
                      </p>
                    </div>
                    <div style={{ padding: "18px 22px 18px 0", marginTop: "24px", borderTop: "1px solid var(--rule)" }}>
                      <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--mars)", marginBottom: "6px" }}>
                        03
                      </div>
                      <div style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "17px", color: "var(--ink)", marginBottom: "4px" }}>
                        Measure
                      </div>
                      <p style={{ fontSize: "13.5px", lineHeight: "22.5px", color: "var(--ink2)", margin: "0 0 6px" }}>
                        Pair observation with biometric signals for an objective read on cognitive load.
                      </p>
                      <p style={{ fontSize: "11px", margin: "0", lineHeight: "1.4" }}>
                        <span style={{ color: "var(--ink2)", textDecoration: "line-through" }}>
                          observe only
                        </span>
                        <span style={{ display: "inline-block", color: "var(--mars)", fontFamily: "'Caveat Brush',cursive", fontSize: "19px", lineHeight: "1", transform: "rotate(-1.8deg) translateY(1px)", marginLeft: "3px" }}>
                          → add biometric channel
                        </span>
                      </p>
                    </div>
                    <div style={{ padding: "18px 0 18px 22px", marginTop: "24px", borderLeft: "1px solid var(--rule)", borderTop: "1px solid var(--rule)" }}>
                      <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--mars)", marginBottom: "6px" }}>
                        04
                      </div>
                      <div style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "17px", color: "var(--ink)", marginBottom: "4px" }}>
                        Iterate
                      </div>
                      <p style={{ fontSize: "13.5px", lineHeight: "22.5px", color: "var(--ink2)", margin: "0" }}>
                        Use the evidence to decide what earns another build cycle.
                      </p>
                    </div>
                  </div>
                  <div style={{ marginTop: "27px", fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--ink2)", display: "flex", flexDirection: "column", gap: "7px", maxWidth: "70ch" }}>
                    <div style={{ borderBottom: "1px dotted var(--rule)", paddingBottom: "5px" }}>
                      LOG — baseline observation window opened
                    </div>
                    <div style={{ borderBottom: "1px dotted var(--rule)", paddingBottom: "5px" }}>
                      LOG — biometric channel added to measurement pass
                    </div>
                    <div style={{ borderBottom: "1px dotted var(--rule)", paddingBottom: "5px" }}>
                      LOG — integrated scenario scheduling moved on-campus
                    </div>
                  </div>
                  <div data-curl="" style={{ position: "absolute", inset: "0", zIndex: "3", pointerEvents: "none", opacity: "0", background: "linear-gradient(to bottom,rgba(255,255,255,.5) 0%,rgba(255,255,255,0) 9%,rgba(28,17,9,0) 42%,rgba(28,17,9,.5) 100%)" }} />
                  <div data-under="" style={{ position: "absolute", inset: "0", zIndex: "2", pointerEvents: "none", opacity: "0", background: "linear-gradient(to bottom,rgba(16,9,5,.6) 0%,rgba(16,9,5,.18) 42%,rgba(16,9,5,0) 78%)" }} />
                </div>
              </div>
            </div>
          </div>
          <div data-page="" data-screen-label="PG 04" style={{ position: "relative", marginTop: "-16px" }}>
            <div data-stick="" style={{ position: "relative", perspective: "2400px", perspectiveOrigin: "50% 0%" }}>
              <div data-leaf="" style={{ position: "relative", transformOrigin: "50% 0%", backfaceVisibility: "hidden", willChange: "transform" }}>
                <div data-shadow="" style={{ position: "absolute", left: "8px", right: "8px", top: "26px", bottom: "0", boxShadow: "0 12px 30px rgba(10,6,4,.42)", pointerEvents: "none" }} />
                <div data-paper="" style={{ position: "relative", boxSizing: "border-box", transform: "rotate(.3deg)", backgroundColor: "var(--paper)", backgroundImage: "radial-gradient(115% 70% at 60% 2%,rgba(255,255,255,.5),rgba(255,255,255,0) 58%),radial-gradient(85% 55% at 8% 80%,rgba(138,112,74,.06),rgba(138,112,74,0) 74%),repeating-linear-gradient(0deg,var(--grid) 0px,var(--grid) 1px,transparent 1px,transparent 27px),repeating-linear-gradient(90deg,var(--grid) 0px,var(--grid) 1px,transparent 1px,transparent 27px)", maskImage: "var(--tornA),linear-gradient(black,black)", maskSize: "100% 34px,100% calc(100% - 32px)", maskPosition: "right top,left 32px", maskRepeat: "no-repeat", WebkitMaskImage: "var(--tornA),linear-gradient(black,black)", WebkitMaskSize: "100% 34px,100% calc(100% - 32px)", WebkitMaskPosition: "right top,left 32px", WebkitMaskRepeat: "no-repeat", padding: "clamp(46px,4vw,62px) clamp(16px,3.2vw,54px) clamp(30px,3.4vw,54px) clamp(42px,5.4vw,88px)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: "0", pointerEvents: "none", backgroundImage: "var(--grain)", backgroundSize: "180px 180px", opacity: ".055", mixBlendMode: "multiply" }} />
                  <div style={{ position: "absolute", left: "0", right: "0", top: "0", height: "10px", pointerEvents: "none", background: "linear-gradient(to bottom,rgba(58,40,20,.24),rgba(58,40,20,.06) 45%,rgba(58,40,20,0))" }} />
                  <div style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "clamp(42px,5.4vw,88px)", pointerEvents: "none" }}>
                    <div style={{ position: "absolute", right: "10px", top: "0", bottom: "0", width: "1px", background: "var(--mars)", opacity: ".42" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", top: "108px", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", top: "50%", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)", transform: "translateY(-50%)" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", bottom: "108px", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap", borderBottom: "1px solid var(--rule)", paddingBottom: "9px", marginBottom: "27px" }}>
                    <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink2)" }}>
                      VISOR — Field Notebook
                    </span>
                    <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".04em", color: "var(--ink2)" }}>
                      PG. 04 / 05
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "5px" }}>
                    <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "15px", color: "var(--mars)" }}>
                      03
                    </span>
                    <h2 style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "clamp(23px,2.2vw,31px)", color: "var(--ink)", margin: "0", textTransform: "uppercase", letterSpacing: ".02em" }}>
                      Previous NASA SUITS Work
                    </h2>
                  </div>
                  <p style={{ fontSize: "16px", lineHeight: "28px", color: "var(--ink2)", margin: "0 0 27px", maxWidth: "64ch" }}>
                    Prior VISOR teams built and fielded a full mission interface. The images below document that work as historical reference.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: "27px 32px", alignItems: "start" }}>
                    <div style={{ position: "relative", minWidth: "0", transform: "rotate(-1.2deg)", gridColumn: "span 1" }}>
                      <div style={{ aspectRatio: "1.6", backgroundImage: "repeating-linear-gradient(45deg,var(--paper2),var(--paper2) 10px,#d6caaf 10px,#d6caaf 20px)", border: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", boxShadow: "0 2px 6px rgba(20,12,6,.14)" }}>
                        <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", letterSpacing: ".02em", color: "var(--ink2)", textTransform: "uppercase", textAlign: "center", padding: "0 12px" }}>
                          photo placeholder — rover interface
                        </span>
                        <span style={{ position: "absolute", left: "26%", top: "30%", width: "34px", height: "34px", border: "2px solid var(--mars)", borderRadius: "50%" }} />
                      </div>
                      <span style={{ position: "absolute", top: "-11px", left: "22px", width: "62px", height: "21px", background: "linear-gradient(96deg,rgba(255,253,246,.5),rgba(236,230,215,.3) 50%,rgba(255,255,255,.44))", maskImage: "var(--tape)", maskSize: "100% 100%", WebkitMaskImage: "var(--tape)", WebkitMaskSize: "100% 100%", transform: "rotate(4deg)", filter: "drop-shadow(0 1px 1.5px rgba(30,18,8,.22))" }} />
                      <span style={{ position: "absolute", top: "-10px", right: "18px", width: "56px", height: "19px", background: "linear-gradient(72deg,rgba(255,255,250,.44),rgba(238,232,218,.3) 55%,rgba(255,255,255,.4))", maskImage: "var(--tape)", maskSize: "100% 100%", WebkitMaskImage: "var(--tape)", WebkitMaskSize: "100% 100%", transform: "rotate(-6deg)", filter: "drop-shadow(0 1px 1.5px rgba(30,18,8,.2))" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", marginTop: "9px", flexWrap: "wrap" }}>
                        <p style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", lineHeight: "1.55", color: "var(--ink2)", margin: "0", maxWidth: "42ch" }}>
                          fig — previous VISOR rover interface, fielded at NASA SUITS: telemetry, navigation, alerts, and procedures in one view
                        </p>
                        <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", color: "var(--mars)", border: "1px solid var(--mars)", padding: "2px 6px", whiteSpace: "nowrap" }}>
                          IMG–014
                        </span>
                      </div>
                    </div>
                    <div style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "27px" }}>
                      <div style={{ position: "relative", transform: "rotate(1.6deg)" }}>
                        <div style={{ aspectRatio: "4/3", backgroundImage: "repeating-linear-gradient(45deg,var(--paper2),var(--paper2) 10px,#d6caaf 10px,#d6caaf 20px)", border: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 5px rgba(20,12,6,.12)" }}>
                          <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".02em", color: "var(--ink2)", textTransform: "uppercase", textAlign: "center", padding: "0 10px" }}>
                            photo placeholder — integration testing
                          </span>
                        </div>
                        <span style={{ position: "absolute", top: "-9px", right: "14px", width: "50px", height: "18px", background: "linear-gradient(88deg,rgba(255,253,246,.46),rgba(238,232,218,.3) 50%,rgba(255,255,255,.4))", maskImage: "var(--tape)", maskSize: "100% 100%", WebkitMaskImage: "var(--tape)", WebkitMaskSize: "100% 100%", transform: "rotate(-7deg)", filter: "drop-shadow(0 1px 1.5px rgba(30,18,8,.2))" }} />
                        <p style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", lineHeight: "1.55", color: "var(--ink2)", margin: "8px 0 0" }}>
                          fig — software under integrated testing 
                          <span style={{ color: "var(--mars)" }}>
                            IMG–015
                          </span>
                        </p>
                      </div>
                      <div style={{ position: "relative", transform: "rotate(-1.4deg)" }}>
                        <div style={{ aspectRatio: "16/9", backgroundImage: "repeating-linear-gradient(45deg,var(--paper2),var(--paper2) 10px,#d6caaf 10px,#d6caaf 20px)", border: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 5px rgba(20,12,6,.12)" }}>
                          <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".02em", color: "var(--ink2)", textTransform: "uppercase", textAlign: "center", padding: "0 10px" }}>
                            photo placeholder — Houston field test
                          </span>
                        </div>
                        <span style={{ position: "absolute", top: "-9px", left: "50%", width: "54px", height: "18px", marginLeft: "-27px", background: "linear-gradient(100deg,rgba(255,255,250,.48),rgba(238,232,218,.3) 55%,rgba(255,255,255,.42))", maskImage: "var(--tape)", maskSize: "100% 100%", WebkitMaskImage: "var(--tape)", WebkitMaskSize: "100% 100%", transform: "rotate(2deg)", filter: "drop-shadow(0 1px 1.5px rgba(30,18,8,.2))" }} />
                        <p style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", lineHeight: "1.55", color: "var(--ink2)", margin: "8px 0 0" }}>
                          fig — NASA SUITS finals, Houston 
                          <span style={{ color: "var(--mars)" }}>
                            IMG–016
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <span style={{ marginTop: "27px", display: "inline-block", borderStyle: "solid", borderColor: "var(--mars)", borderWidth: "2px 1.5px 2.5px 1.5px", borderRadius: "1.5px", color: "var(--mars)", fontFamily: "'Special Elite','Courier New',monospace", textTransform: "uppercase", transform: "rotate(-2.1deg)", opacity: ".94", maskImage: "var(--stampink)", WebkitMaskImage: "var(--stampink)", maskSize: "240px 96px", WebkitMaskSize: "240px 96px", maskPosition: "-120px -30px", WebkitMaskPosition: "-120px -30px", filter: "blur(.18px)", fontSize: "12.5px", letterSpacing: ".1em", padding: "6px 13px 5px" }}>
                    2 Innovation Awards — 3 Seasons
                  </span>
                  <div style={{ marginTop: "34px", paddingTop: "27px", borderTop: "1px solid var(--rule)" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "5px" }}>
                      <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "15px", color: "var(--mars)" }}>
                        04
                      </span>
                      <h2 style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "clamp(23px,2.2vw,31px)", color: "var(--ink)", margin: "0", textTransform: "uppercase", letterSpacing: ".02em" }}>
                        With Thanks
                      </h2>
                    </div>
                    <p style={{ fontSize: "16px", lineHeight: "28px", color: "var(--ink2)", margin: "0 0 24px", maxWidth: "64ch" }}>
                      VISOR's 2026–27 cycle runs on the generosity of the following partners.
                    </p>
                    <div style={{ overflow: "hidden", width: "100%" }}>
                      <div className="field-notebook-marquee" style={{ display: "flex", gap: "64px", width: "max-content", animation: "visor-marquee 20s linear infinite" }}>
                        <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                          <div style={{ width: "260px", height: "130px", backgroundImage: "repeating-linear-gradient(45deg,var(--paper2),var(--paper2) 10px,#d6caaf 10px,#d6caaf 20px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", letterSpacing: ".05em", color: "var(--ink2)", textTransform: "uppercase" }}>
                              logo placeholder
                            </span>
                          </div>
                          <div style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "22px", color: "var(--ink)" }}>
                            Purdue CS
                          </div>
                          <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".04em", color: "var(--ink2)" }}>
                            Department of Computer Science
                          </div>
                        </div>
                        <div style={{ flex: "0 0 auto", width: "260px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", letterSpacing: ".05em", color: "var(--ink2)", textTransform: "uppercase" }}>
                            + open sponsor slot
                          </span>
                        </div>
                        <div style={{ flex: "0 0 auto", width: "260px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", letterSpacing: ".05em", color: "var(--ink2)", textTransform: "uppercase" }}>
                            + open sponsor slot
                          </span>
                        </div>
                        <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                          <div style={{ width: "260px", height: "130px", backgroundImage: "repeating-linear-gradient(45deg,var(--paper2),var(--paper2) 10px,#d6caaf 10px,#d6caaf 20px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", letterSpacing: ".05em", color: "var(--ink2)", textTransform: "uppercase" }}>
                              logo placeholder
                            </span>
                          </div>
                          <div style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "22px", color: "var(--ink)" }}>
                            Purdue CS
                          </div>
                          <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".04em", color: "var(--ink2)" }}>
                            Department of Computer Science
                          </div>
                        </div>
                        <div style={{ flex: "0 0 auto", width: "260px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", letterSpacing: ".05em", color: "var(--ink2)", textTransform: "uppercase" }}>
                            + open sponsor slot
                          </span>
                        </div>
                        <div style={{ flex: "0 0 auto", width: "260px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", letterSpacing: ".05em", color: "var(--ink2)", textTransform: "uppercase" }}>
                            + open sponsor slot
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div data-curl="" style={{ position: "absolute", inset: "0", zIndex: "3", pointerEvents: "none", opacity: "0", background: "linear-gradient(to bottom,rgba(255,255,255,.5) 0%,rgba(255,255,255,0) 9%,rgba(28,17,9,0) 42%,rgba(28,17,9,.5) 100%)" }} />
                  <div data-under="" style={{ position: "absolute", inset: "0", zIndex: "2", pointerEvents: "none", opacity: "0", background: "linear-gradient(to bottom,rgba(16,9,5,.6) 0%,rgba(16,9,5,.18) 42%,rgba(16,9,5,0) 78%)" }} />
                </div>
              </div>
            </div>
          </div>
          <div data-page="" data-screen-label="PG 05" style={{ position: "relative", marginTop: "-16px" }}>
            <div data-stick="" style={{ position: "relative", perspective: "2400px", perspectiveOrigin: "50% 0%" }}>
              <div data-leaf="" style={{ position: "relative", transformOrigin: "50% 0%", backfaceVisibility: "hidden" }}>
                <div data-shadow="" style={{ position: "absolute", left: "8px", right: "8px", top: "26px", bottom: "0", boxShadow: "0 12px 30px rgba(10,6,4,.42)", pointerEvents: "none" }} />
                <div data-paper="" style={{ position: "relative", boxSizing: "border-box", transform: "rotate(.1deg)", backgroundColor: "var(--paper)", backgroundImage: "radial-gradient(120% 65% at 25% 3%,rgba(255,255,255,.5),rgba(255,255,255,0) 60%),radial-gradient(80% 50% at 85% 85%,rgba(138,112,74,.07),rgba(138,112,74,0) 72%),repeating-linear-gradient(0deg,var(--grid) 0px,var(--grid) 1px,transparent 1px,transparent 27px),repeating-linear-gradient(90deg,var(--grid) 0px,var(--grid) 1px,transparent 1px,transparent 27px)", maskImage: "var(--tornC),linear-gradient(black,black)", maskSize: "100% 34px,100% calc(100% - 32px)", maskPosition: "right top,left 32px", maskRepeat: "no-repeat", WebkitMaskImage: "var(--tornC),linear-gradient(black,black)", WebkitMaskSize: "100% 34px,100% calc(100% - 32px)", WebkitMaskPosition: "right top,left 32px", WebkitMaskRepeat: "no-repeat", padding: "clamp(46px,4vw,62px) clamp(16px,3.2vw,54px) clamp(34px,3.6vw,56px) clamp(42px,5.4vw,88px)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", inset: "0", pointerEvents: "none", backgroundImage: "var(--grain)", backgroundSize: "180px 180px", opacity: ".05", mixBlendMode: "multiply" }} />
                  <div style={{ position: "absolute", left: "0", right: "0", top: "0", height: "10px", pointerEvents: "none", background: "linear-gradient(to bottom,rgba(58,40,20,.24),rgba(58,40,20,.06) 45%,rgba(58,40,20,0))" }} />
                  <div style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "clamp(42px,5.4vw,88px)", pointerEvents: "none" }}>
                    <div style={{ position: "absolute", right: "10px", top: "0", bottom: "0", width: "1px", background: "var(--mars)", opacity: ".42" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", top: "108px", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", top: "50%", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)", transform: "translateY(-50%)" }} />
                    <div style={{ position: "absolute", left: "clamp(10px,1.5vw,26px)", bottom: "108px", width: "9px", height: "9px", borderRadius: "50%", background: "var(--sitebg)", boxShadow: "inset 0 1px 2px rgba(0,0,0,.65),0 1px 0 rgba(255,255,255,.45)" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap", borderBottom: "1px solid var(--rule)", paddingBottom: "9px", marginBottom: "27px" }}>
                    <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--ink2)" }}>
                      VISOR — Field Notebook
                    </span>
                    <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10.5px", letterSpacing: ".04em", color: "var(--ink2)" }}>
                      PG. 05 / 05
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "5px" }}>
                    <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "15px", color: "var(--mars)" }}>
                      04
                    </span>
                    <h2 style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "clamp(23px,2.2vw,31px)", color: "var(--ink)", margin: "0", textTransform: "uppercase", letterSpacing: ".02em" }}>
                      Sponsor Requirements
                    </h2>
                  </div>
                  <p style={{ fontSize: "16px", lineHeight: "28px", color: "var(--ink2)", margin: "0 0 20px", maxWidth: "64ch" }}>
                    Support priorities for the 2026–27 VISOR development cycle, and what a contribution goes toward.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--rule)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(230px,100%),1fr))", gap: "9px 28px", padding: "14px 0", borderBottom: "1px solid var(--rule)", alignItems: "start" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "baseline", minWidth: "0" }}>
                        <span style={{ width: "13px", height: "13px", border: "1.5px solid var(--ink)", display: "inline-block", flexShrink: "0" }} />
                        <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--mars)", flexShrink: "0" }}>
                          REQ–01
                        </span>
                        <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "17px", lineHeight: "20px", letterSpacing: ".01em", color: "var(--ink)" }}>
                          XR / sensing hardware
                        </span>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", letterSpacing: ".05em", color: "var(--mars)", marginBottom: "3px" }}>
                          NEEDED FOR
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: "21px", color: "var(--ink2)" }}>
                          Custom headset and navigation prototypes
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", letterSpacing: ".05em", color: "var(--ink2)", marginBottom: "3px" }}>
                          EXAMPLES
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: "21px", color: "var(--ink2)" }}>
                          Displays · optics · cameras · IMUs
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(230px,100%),1fr))", gap: "9px 28px", padding: "14px 0", borderBottom: "1px solid var(--rule)", alignItems: "start" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "baseline", minWidth: "0" }}>
                        <span style={{ width: "13px", height: "13px", border: "1.5px solid var(--ink)", display: "inline-block", flexShrink: "0" }} />
                        <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--mars)", flexShrink: "0" }}>
                          REQ–02
                        </span>
                        <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "17px", lineHeight: "20px", letterSpacing: ".01em", color: "var(--ink)" }}>
                          LiDAR / robotics
                        </span>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", letterSpacing: ".05em", color: "var(--mars)", marginBottom: "3px" }}>
                          NEEDED FOR
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: "21px", color: "var(--ink2)" }}>
                          Spatial navigation experiments
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", letterSpacing: ".05em", color: "var(--ink2)", marginBottom: "3px" }}>
                          EXAMPLES
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: "21px", color: "var(--ink2)" }}>
                          LiDAR units · robotic components
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(230px,100%),1fr))", gap: "9px 28px", padding: "14px 0", borderBottom: "1px solid var(--rule)", alignItems: "start" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "baseline", minWidth: "0" }}>
                        <span style={{ width: "13px", height: "13px", border: "1.5px solid var(--ink)", display: "inline-block", flexShrink: "0" }} />
                        <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--mars)", flexShrink: "0" }}>
                          REQ–03
                        </span>
                        <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "17px", lineHeight: "20px", letterSpacing: ".01em", color: "var(--ink)" }}>
                          Fabrication
                        </span>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", letterSpacing: ".05em", color: "var(--mars)", marginBottom: "3px" }}>
                          NEEDED FOR
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: "21px", color: "var(--ink2)" }}>
                          Custom enclosures and mechanical systems
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", letterSpacing: ".05em", color: "var(--ink2)", marginBottom: "3px" }}>
                          EXAMPLES
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: "21px", color: "var(--ink2)" }}>
                          CNC · additive manufacturing · machining access
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(230px,100%),1fr))", gap: "9px 28px", padding: "14px 0", borderBottom: "1px solid var(--rule)", alignItems: "start" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "baseline", minWidth: "0" }}>
                        <span style={{ width: "13px", height: "13px", border: "1.5px solid var(--ink)", display: "inline-block", flexShrink: "0" }} />
                        <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--mars)", flexShrink: "0" }}>
                          REQ–04
                        </span>
                        <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "17px", lineHeight: "20px", letterSpacing: ".01em", color: "var(--ink)" }}>
                          Travel support
                        </span>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", letterSpacing: ".05em", color: "var(--mars)", marginBottom: "3px" }}>
                          NEEDED FOR
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: "21px", color: "var(--ink2)" }}>
                          NASA SUITS testing in Houston
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", letterSpacing: ".05em", color: "var(--ink2)", marginBottom: "3px" }}>
                          EXAMPLES
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: "21px", color: "var(--ink2)" }}>
                          Travel funding · lodging
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(230px,100%),1fr))", gap: "9px 28px", padding: "14px 0", borderBottom: "1px solid var(--rule)", alignItems: "start" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "baseline", minWidth: "0" }}>
                        <span style={{ width: "13px", height: "13px", border: "1.5px solid var(--ink)", display: "inline-block", flexShrink: "0" }} />
                        <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--mars)", flexShrink: "0" }}>
                          REQ–05
                        </span>
                        <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "17px", lineHeight: "20px", letterSpacing: ".01em", color: "var(--ink)" }}>
                          Biometric equipment
                        </span>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", letterSpacing: ".05em", color: "var(--mars)", marginBottom: "3px" }}>
                          NEEDED FOR
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: "21px", color: "var(--ink2)" }}>
                          Human-factors evaluation
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", letterSpacing: ".05em", color: "var(--ink2)", marginBottom: "3px" }}>
                          EXAMPLES
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: "21px", color: "var(--ink2)" }}>
                          Eye tracking · physiological sensors
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(230px,100%),1fr))", gap: "9px 28px", padding: "14px 0", borderBottom: "1px solid var(--rule)", alignItems: "start" }}>
                      <div style={{ display: "flex", gap: "10px", alignItems: "baseline", minWidth: "0" }}>
                        <span style={{ width: "13px", height: "13px", border: "1.5px solid var(--ink)", display: "inline-block", flexShrink: "0" }} />
                        <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", color: "var(--mars)", flexShrink: "0" }}>
                          REQ–06
                        </span>
                        <span style={{ fontFamily: "'Saira Condensed','Arial Narrow',sans-serif", fontWeight: "700", fontSize: "17px", lineHeight: "20px", letterSpacing: ".01em", color: "var(--ink)" }}>
                          Mentorship & sponsorship
                        </span>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", letterSpacing: ".05em", color: "var(--mars)", marginBottom: "3px" }}>
                          NEEDED FOR
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: "21px", color: "var(--ink2)" }}>
                          Sustained engineering capacity across the cycle
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", letterSpacing: ".05em", color: "var(--ink2)", marginBottom: "3px" }}>
                          EXAMPLES
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: "21px", color: "var(--ink2)" }}>
                          Technical mentorship · engineering support · financial sponsorship
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: "27px", border: "1.5px solid var(--mars)", padding: "22px", position: "relative", maxWidth: "520px" }}>
                    <span style={{ position: "absolute", top: "-10px", left: "16px", background: "var(--paper)", padding: "0 8px", fontFamily: "'Special Elite','Courier New',monospace", fontSize: "11.5px", letterSpacing: ".09em", color: "var(--mars)", transform: "rotate(-2deg)", display: "inline-block" }}>
                      SPONSOR
                    </span>
                    <p style={{ fontSize: "15.5px", lineHeight: "23px", color: "var(--ink)", margin: "4px 0 14px" }}>
                      Interested in supporting VISOR?
                    </p>
                    <Link to="/contact" style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "13px", letterSpacing: ".04em", color: "var(--mars)", textDecoration: "none", fontWeight: "700", borderBottom: "1.5px solid var(--mars)" }}>
                      Contact VISOR about sponsorship →
                    </Link>
                    <div style={{ marginTop: "16px", borderTop: "1px dashed var(--rule)", paddingTop: "9px", fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "10px", color: "var(--ink2)", letterSpacing: ".04em" }}>
                      SIGN–OFF: ______________________
                    </div>
                  </div>
                  <div data-curl="" style={{ position: "absolute", inset: "0", zIndex: "3", pointerEvents: "none", opacity: "0", background: "linear-gradient(to bottom,rgba(255,255,255,.5) 0%,rgba(255,255,255,0) 9%,rgba(28,17,9,0) 42%,rgba(28,17,9,.5) 100%)" }} />
                  <div data-under="" style={{ position: "absolute", inset: "0", zIndex: "2", pointerEvents: "none", opacity: "0", background: "linear-gradient(to bottom,rgba(16,9,5,.6) 0%,rgba(16,9,5,.18) 42%,rgba(16,9,5,0) 78%)" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px clamp(10px,2.2vw,32px) 56px", textAlign: "center" }}>
          <span style={{ fontFamily: "'Azeret Mono',ui-monospace,monospace", fontSize: "11px", letterSpacing: ".05em", color: "#8b8073" }}>
            — end of field notebook, rev 2026–27 —
          </span>
        </div>
      </div>

      </div>
      <Footer />
    </div>
  );
};

export default FieldNotebook;
