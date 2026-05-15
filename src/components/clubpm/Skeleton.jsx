import React from 'react';

export function SkeletonLine({ width = '100%', height = 14, style = {} }) {
  return (
    <div
      className="pm-skeleton"
      style={{ width, height, borderRadius: 4, ...style }}
    />
  );
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="pm-skeleton-card">
      <div className="pm-skeleton pm-skeleton-avatar" />
      <div className="pm-skeleton-lines">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine
            key={i}
            width={i === lines - 1 ? '60%' : '100%'}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6, cols = 3 }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 16,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
