import { useEffect, useRef } from 'react';

export default function OrbitLoader({ size = 72 }) {
  const beltRef = useRef(null);

  useEffect(() => {
    const belt = beltRef.current;
    if (!belt) return;
    const frag = document.createDocumentFragment();
    for (let j = 0; j < 54; j++) {
      const a = document.createElement('div');
      a.className = 'ol-r-asteroid';
      const ang = (j / 54) * Math.PI * 2 + (Math.random() - 0.5) * 0.18;
      const r = 67 + (Math.random() - 0.5) * 14;
      const d = (Math.random() * 1.4 + 0.7).toFixed(2);
      a.style.cssText = `width:${d}px;height:${d}px;opacity:${(Math.random()*0.5+0.3).toFixed(2)};transform:translate(-50%,-50%) translate(${(Math.cos(ang)*r).toFixed(2)}px,${(Math.sin(ang)*r).toFixed(2)}px)`;
      frag.appendChild(a);
    }
    belt.appendChild(frag);
    return () => { while (belt.firstChild) belt.removeChild(belt.firstChild); };
  }, []);

  const scale = size / 200;

  return (
    <div className="ol-r-outer" style={{ width: size, height: size }}>
      <div className="ol-r-inner" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <div className="ol-r-wrap" role="status" aria-label="Loading">
          <div className="ol-r-whirl" />
          <div className="ol-r-whirl ol-r-whirl-two" />
          <div className="ol-r-orbit ol-r-o1" />
          <div className="ol-r-orbit ol-r-o2" />
          <div className="ol-r-orbit ol-r-o3" />
          <div className="ol-r-belt" ref={beltRef} />
          <div className="ol-r-orbit ol-r-o4" />
          <div className="ol-r-orbit ol-r-o5" />
          <div className="ol-r-sun" />
        </div>
      </div>
    </div>
  );
}
