import React from 'react';

// Rubric point ids are generated once, here, and never regenerated. Feedback
// rows are keyed by id, so a point can be reworded without orphaning the
// feedback already given against it.
export const emptyPoint = () => ({ id: `r${Date.now().toString(36)}`, point: '', weight: 1 });

/**
 * The rubric control shared by `LitReviewBuilder` and `AssignmentBuilder`.
 *
 * Both kinds grade against the same `[{ id, point, weight }]` shape and write
 * it into their own config column, so the editor itself is kind-agnostic: it
 * takes the array and hands back the next one.
 */
export default function RubricEditor({ points, onChange, placeholder }) {
  const list = Array.isArray(points) && points.length ? points : [emptyPoint()];

  const setPoint = (index, patch) =>
    onChange(list.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  return (
    <fieldset className="pm-lit-builder-rubric">
      <legend>Rubric points</legend>
      {list.map((p, i) => (
        <div key={p.id} className="pm-lit-builder-point">
          <input
            value={p.point}
            placeholder={placeholder ?? 'e.g. Identifies that the 2× figure is transient, not a mean'}
            onChange={(e) => setPoint(i, { point: e.target.value })}
          />
          <input
            type="number"
            min="1"
            value={p.weight}
            aria-label="Weight"
            onChange={(e) => setPoint(i, { weight: Number(e.target.value) || 1 })}
          />
          <button
            type="button"
            className="clubpm-btn-secondary"
            onClick={() => onChange(list.filter((_, j) => j !== i))}
            aria-label="Remove point"
          >
            <i className="fas fa-trash" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="clubpm-btn-secondary"
        onClick={() => onChange([...list, emptyPoint()])}
      >
        <i className="fas fa-plus" aria-hidden="true" /> Add point
      </button>
      <small>
        Ids are generated once and never change, so feedback already given stays attached
        when you reword a point.
      </small>
    </fieldset>
  );
}
