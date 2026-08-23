import { useId, useMemo, useState } from 'react';
import {
  grashof, rayleigh, peclet, reynolds, airPropertiesAt, GRAVITY, PLUME,
  AIR_PROPERTIES,
} from './aresPhysics';

/**
 * The two length presets a reader can pick, and nothing else. This control is
 * deliberately NOT a free-number input — the whole lesson of this component is
 * that the characteristic length is a stated choice, not a fitted parameter,
 * and Gr ~ L^3 means that choice dominates the answer.
 *
 * BODY_HEIGHT_M: what the whole-body plume analysis (M1) non-dimensionalises
 * on. HEAD_WIDTH_M: what the CFD paper (M3 / GLOSSARY §6) non-dimensionalises
 * on instead. Both are physically legitimate length scales for the same body;
 * they just answer different questions.
 */
const BODY_HEIGHT_M = 1.7;
const HEAD_WIDTH_M = 1 / 6;

const LENGTH_PRESETS = [
  { id: 'body', label: 'Body height — 1.7 m', L: BODY_HEIGHT_M },
  { id: 'head', label: 'Head width — 1/6 m', L: HEAD_WIDTH_M },
];

/**
 * ΔT slider range, per this component's brief (task-9). aresPhysics.js has
 * no opinion on how wide the demo sweep should be, so this is named here
 * rather than typed as bare 2 / 20 into the slider markup.
 */
const DT_MIN_K = 2;
const DT_MAX_K = 20;

/**
 * Film-temperature slider bounds come straight from the tabulated range in
 * AIR_PROPERTIES (295-305 K) rather than being retyped as literals — the
 * slider can't ask airPropertiesAt() for anything outside that range anyway
 * (it clamps), so the bounds should say so.
 */
const TEMP_FILM_MIN_K = AIR_PROPERTIES[0].tempK;
const TEMP_FILM_MAX_K = AIR_PROPERTIES[AIR_PROPERTIES.length - 1].tempK;

const fmtExp = (v) => (Number.isFinite(v) ? v.toExponential(2) : '—');

function ReadoutRow({ label, values }) {
  return (
    <tr className="ares-regime-row">
      <th className="ares-regime-row-label" scope="row">{label}</th>
      {values.map((v) => (
        <td className="ares-regime-row-value" key={v.key}>
          {v.value}
        </td>
      ))}
    </tr>
  );
}

export default function RegimePlayground() {
  const idBase = useId();
  const [dT, setDT] = useState(8);
  const [g, setG] = useState(GRAVITY.earth);
  const [tFilmK, setTFilmK] = useState(300);
  // The plume crown velocity is a measured range, not a single figure —
  // PLUME.crownVelocityMin/Max in aresPhysics.js. This slider is bounded to
  // that range so the velocity feeding Pe and Re stays sourced rather than
  // invented, and its current value is labelled on screen (below) rather
  // than left implicit.
  const [V, setV] = useState(PLUME.crownVelocityMin);

  const results = useMemo(
    () =>
      LENGTH_PRESETS.map((preset) => ({
        ...preset,
        Gr: grashof({ dT, L: preset.L, tFilmK, g }),
        Ra: rayleigh({ dT, L: preset.L, tFilmK, g }),
        Pe: peclet({ V, L: preset.L }),
        Re: reynolds({ V, L: preset.L, tFilmK }),
      })),
    [dT, tFilmK, g, V],
  );

  const props = airPropertiesAt(tFilmK);

  const dTId = `${idBase}-dt`;
  const gId = `${idBase}-g`;
  const tId = `${idBase}-t`;
  const vId = `${idBase}-v`;

  const summary =
    `At ${dT} K, ${g.toFixed(2)} m/s squared gravity, and a ${tFilmK} K film ` +
    `temperature: using body height, Grashof is ${fmtExp(results[0].Gr)} and ` +
    `Rayleigh is ${fmtExp(results[0].Ra)}. Using head width, Grashof is ` +
    `${fmtExp(results[1].Gr)} and Rayleigh is ${fmtExp(results[1].Ra)}.`;

  return (
    <div className="ares-regime-playground">
      <div className="ares-regime-controls">
        <div className="ares-slider-field">
          <label htmlFor={dTId}>Temperature difference (ΔT) — {dT} K</label>
          <input
            id={dTId}
            type="range"
            min={DT_MIN_K}
            max={DT_MAX_K}
            step={1}
            value={dT}
            onChange={(e) => setDT(Number(e.target.value))}
          />
        </div>

        <div className="ares-slider-field">
          <label htmlFor={gId}>Gravity — {g.toFixed(2)} m/s²</label>
          <input
            id={gId}
            type="range"
            min={GRAVITY.orbit}
            max={GRAVITY.earth}
            step={0.01}
            value={g}
            onChange={(e) => setG(Number(e.target.value))}
          />
        </div>

        <div className="ares-slider-field">
          <label htmlFor={tId}>Film temperature — {tFilmK} K</label>
          <input
            id={tId}
            type="range"
            min={TEMP_FILM_MIN_K}
            max={TEMP_FILM_MAX_K}
            step={1}
            value={tFilmK}
            onChange={(e) => setTFilmK(Number(e.target.value))}
          />
        </div>

        <div className="ares-slider-field">
          <label htmlFor={vId}>
            Plume crown velocity (V) — {V.toFixed(2)} m/s
          </label>
          <input
            id={vId}
            type="range"
            min={PLUME.crownVelocityMin}
            max={PLUME.crownVelocityMax}
            step={0.01}
            value={V}
            onChange={(e) => setV(Number(e.target.value))}
          />
          <p className="ares-slider-note">
            Bounded to the measured plume crown velocity range (GLOSSARY-sourced
            plume figures); Pe and Re both need a velocity, and this is the one
            the rest of ARES already measures.
          </p>
        </div>

        <fieldset className="ares-length-choice">
          <legend>Characteristic length — this is a choice, not a number</legend>
          <p className="ares-length-choice-hint">
            Both readouts below are computed from the same sliders above, once
            per length preset, and shown side by side.
          </p>
          <ul className="ares-length-choice-list">
            {LENGTH_PRESETS.map((preset) => (
              <li key={preset.id}>{preset.label}</li>
            ))}
          </ul>
        </fieldset>
      </div>

      <table className="ares-regime-table">
        <thead>
          <tr className="ares-regime-row ares-regime-row-header">
            <th className="ares-regime-row-label" scope="col">
              Dimensionless number
            </th>
            {results.map((r) => (
              <th className="ares-regime-row-value" scope="col" key={r.id}>
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <ReadoutRow
            label="Grashof (Gr)"
            values={results.map((r) => ({ key: r.id, value: fmtExp(r.Gr) }))}
          />
          <ReadoutRow
            label="Rayleigh (Ra)"
            values={results.map((r) => ({ key: r.id, value: fmtExp(r.Ra) }))}
          />
          <ReadoutRow
            label="Péclet (Pe, mass transport)"
            values={results.map((r) => ({ key: r.id, value: fmtExp(r.Pe) }))}
          />
          <ReadoutRow
            label="Reynolds (Re)"
            values={results.map((r) => ({ key: r.id, value: fmtExp(r.Re) }))}
          />
        </tbody>
      </table>

      <p className="ares-caption">
        Grashof scales as the cube of the characteristic length, so choosing
        body height rather than head width moves the answer by orders of
        magnitude. Both are correct. Neither is meaningful without saying which
        one you used — a dimensionless number quoted without its length scale
        is not a result.
      </p>

      <p className="ares-regime-pe-note">
        Pe here is the <strong>mass-transport</strong> Péclet number, built from
        the CO₂-in-air binary diffusivity — not the film properties read at
        {' '}{tFilmK} K{props ? ` (ν = ${props.nu.toExponential(2)} m²/s)` : ''}.
        A thermal Péclet number, V·L/α, also exists and is a different
        quantity; if this page ever added it, it would be labelled{' '}
        <code>Pe_thermal</code> rather than reusing this name.
      </p>

      <p aria-live="polite" className="ares-regime-summary">
        {summary}
      </p>
    </div>
  );
}
