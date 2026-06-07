// VRM avatar editor with four tabs: Base / Face / Body / Style.
// One AvatarModel preview pane on the left re-applies featureJson on every
// slider change (no remount). Save: PUT /api/avatar/config + snapshot portrait.
//
// VRM_DISABLED: 3D preview is behind a feature flag. Set VRM_ENABLED = true
// and restore lazy imports to re-enable. See src/clubpm/avatar/VRM_DISABLED.md.

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { get, put, post } from "../../../api/clubPmClient";
// VRM_DISABLED: AvatarModel import left dormant (see VRM_DISABLED.md)
// import AvatarModel from "./AvatarModel";
import AvatarPortrait from "./AvatarPortrait";
import { listBaseModels, getBaseModel, DEFAULT_BASE_MODEL_ID } from "../../../clubpm/avatar/vrm/baseModels";
import { migrateFeatureJson } from "../../../clubpm/avatar/vrm/migrateFeatureJson";
// VRM_DISABLED: capturePortrait requires a live canvas
// import { capturePortrait } from "../../../clubpm/avatar/vrm/snapshot";

// Set to true to restore the 3D VRM preview. See src/clubpm/avatar/VRM_DISABLED.md.
const VRM_ENABLED = false;

const TABS = [
  { id: "base",   label: "Base",   icon: "fas fa-user" },
  { id: "face",   label: "Face",   icon: "fas fa-smile" },
  { id: "body",   label: "Body",   icon: "fas fa-male" },
  { id: "style",  label: "Style",  icon: "fas fa-palette" },
];

const FACE_SLIDERS = [
  { key: "faceWidth",  label: "Face width"  },
  { key: "faceJaw",    label: "Jaw"         },
  { key: "faceCheek",  label: "Cheeks"      },
  { key: "eyeSize",    label: "Eye size"    },
  { key: "eyeSpacing", label: "Eye spacing" },
  { key: "noseWidth",  label: "Nose width"  },
  { key: "noseHeight", label: "Nose length" },
  { key: "mouthWidth", label: "Mouth width" },
  { key: "browHeight", label: "Brow height" },
];

const BODY_SLIDERS = [
  { key: "height",        label: "Height"         },
  { key: "build",         label: "Build"          },
  { key: "shoulderWidth", label: "Shoulder width" },
  { key: "headSize",      label: "Head size"      },
];

const SLOT_LABEL = {
  outfit:    "Outfit",
  hair:      "Hair",
  theme:     "Dashboard theme",
  frame:     "Name frame",
  animation: "Animation",
};

const CATEGORY_FOR_SLOT = {
  outfit:    "CLOTHING",
  hair:      "AVATAR_FEATURE",
  theme:     "DASHBOARD_THEME",
  frame:     "NAME_FRAME",
  animation: "ANIMATION",
};

function Slider({ value, onChange, label }) {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "120px 1fr 36px", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span style={{ fontSize: 11, color: "var(--clubpm-text-muted, #636b7a)", textAlign: "right" }}>
        {Math.round(value * 100)}
      </span>
    </label>
  );
}

export default function AvatarEditor({ memberId, initialConfig, onClose }) {
  const [tab, setTab] = useState("base");
  const [features, setFeatures] = useState(() => migrateFeatureJson(initialConfig?.featureJson));
  const [equipped, setEquipped] = useState(initialConfig?.equippedCosmetics ?? {
    outfit: null, hair: null, theme: null, frame: null, animation: null,
  });
  const [owned, setOwned] = useState([]);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const vrmReadyRef = useRef(null);

  useEffect(() => {
    get(`/api/members/${memberId}/cosmetics`).then(setOwned).catch(() => setOwned([]));
  }, [memberId]);

  const ownedBySlot = useMemo(() => {
    const out = { outfit: [], hair: [], theme: [], frame: [], animation: [] };
    for (const mc of owned) {
      for (const [slot, cat] of Object.entries(CATEGORY_FOR_SLOT)) {
        if (mc.cosmetic.category === cat) out[slot].push(mc.cosmetic);
      }
    }
    return out;
  }, [owned]);

  const setBase = (id) => {
    const base = getBaseModel(id);
    setFeatures((prev) => ({
      ...prev,
      baseModelId: id,
      // Seed colors from the base's defaults only if the user hasn't touched
      // them yet (heuristic: still matches the prior base's defaults).
      colors: prev.colors ?? { ...base.defaultColors },
    }));
  };

  const setFace   = (key, v) => setFeatures((prev) => ({ ...prev, faceMorphs: { ...prev.faceMorphs, [key]: v } }));
  const setBody   = (key, v) => setFeatures((prev) => ({ ...prev, bodyMorphs: { ...prev.bodyMorphs, [key]: v } }));
  const setColor  = (key, v) => setFeatures((prev) => ({ ...prev, colors:     { ...prev.colors,     [key]: v } }));
  const setToggle = (key, v) => setFeatures((prev) => ({ ...prev, toggles:    { ...prev.toggles,    [key]: v } }));

  const handleUpload = async (file) => {
    if (!file) return;
    setExtracting(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = String(reader.result);
          const result = await post("/api/avatar/extract-features", {
            imageBase64: dataUrl,
            mimeType: file.type || "image/jpeg",
          });
          // Merge hints onto current features without clobbering nested objects.
          setFeatures((prev) => ({
            ...prev,
            baseModelId: result.baseModelId ?? prev.baseModelId,
            colors:      { ...prev.colors,     ...(result.colors ?? {}) },
            toggles:     { ...prev.toggles,    ...(result.toggles ?? {}) },
            faceMorphs:  { ...prev.faceMorphs, ...(result.faceMorphHints ?? {}) },
            bodyMorphs:  { ...prev.bodyMorphs, ...(result.bodyHints ?? {}) },
          }));
          toast.success("Features extracted from photo");
        } catch (err) {
          toast.error(err.message ?? "Extraction failed");
        } finally {
          setExtracting(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await put("/api/avatar/config", { featureJson: features, equippedCosmetics: equipped });
      await Promise.all(Object.entries(equipped).map(([slot, cosmeticId]) =>
        post("/api/shop/equip", { slot, cosmeticId })
      ));
      // Best-effort portrait snapshot (only when VRM canvas is enabled).
      if (VRM_ENABLED) {
        try {
          const { capturePortrait } = await import("../../../clubpm/avatar/vrm/snapshot.js");
          await capturePortrait();
        } catch (err) {
          console.warn("Portrait capture failed:", err);
        }
      }
      toast.success("Avatar saved");
      window.dispatchEvent(new CustomEvent("avatar-updated"));
      onClose?.();
    } catch (err) {
      toast.error(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const baseList = listBaseModels();
  const activeBaseId = features.baseModelId ?? DEFAULT_BASE_MODEL_ID;

  return (
    <div
      style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{
        background: "var(--clubpm-surface-100, #fff)", borderRadius: 12, overflow: "hidden",
        width: "min(820px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column",
        border: "1px solid var(--clubpm-border, #e5e7eb)",
      }}>
        <div style={{ display: "flex", padding: "12px 16px", borderBottom: "1px solid var(--clubpm-border, #e5e7eb)", alignItems: "center", justifyContent: "space-between" }}>
          <strong>Edit avatar</strong>
          <button type="button" onClick={onClose} style={{ background: "none", border: 0, fontSize: 20, cursor: "pointer" }} aria-label="Close">×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", flex: 1, minHeight: 0 }}>
          {/* Live preview */}
          <div
            data-avatar-preview
            style={{ borderRight: "1px solid var(--clubpm-border, #e5e7eb)", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--clubpm-surface-200, #f8f9fc)" }}
          >
            {VRM_ENABLED ? (
              /* VRM_DISABLED: restore AvatarModel here when VRM_ENABLED = true */
              <div style={{ color: "var(--clubpm-text-muted, #636b7a)", fontSize: 12, textAlign: "center", padding: 16 }}>
                3D preview disabled
              </div>
            ) : (
              <AvatarPortrait size={240} />
            )}
          </div>

          {/* Tabs + content */}
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", borderBottom: "1px solid var(--clubpm-border, #e5e7eb)" }}>
              {TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  style={{
                    flex: 1, padding: "10px 12px",
                    background: tab === t.id ? "var(--clubpm-surface-200, #f3f4f6)" : "transparent",
                    border: 0,
                    borderBottom: tab === t.id ? "2px solid var(--clubpm-accent-primary, #0ea5e9)" : "2px solid transparent",
                    cursor: "pointer", fontSize: 13,
                  }}
                >
                  <i className={t.icon} aria-hidden="true" style={{ marginRight: 6 }} />
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ overflowY: "auto", padding: 14, flex: 1 }}>
              {tab === "base" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {baseList.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBase(b.id)}
                      style={{
                        padding: 10, borderRadius: 8, cursor: "pointer", textAlign: "left",
                        border: activeBaseId === b.id
                          ? "2px solid var(--clubpm-accent-primary, #0ea5e9)"
                          : "1px solid var(--clubpm-border, #e5e7eb)",
                        background: activeBaseId === b.id ? "var(--clubpm-surface-200, #f3f4f6)" : "transparent",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{b.label}</div>
                      <div style={{ fontSize: 11, color: "var(--clubpm-text-muted, #636b7a)", textTransform: "capitalize" }}>
                        {b.gender}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {tab === "face" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {FACE_SLIDERS.map(({ key, label }) => (
                    <Slider
                      key={key}
                      label={label}
                      value={features.faceMorphs?.[key] ?? 0.5}
                      onChange={(v) => setFace(key, v)}
                    />
                  ))}
                </div>
              )}

              {tab === "body" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {BODY_SLIDERS.map(({ key, label }) => (
                    <Slider
                      key={key}
                      label={label}
                      value={features.bodyMorphs?.[key] ?? 0.5}
                      onChange={(v) => setBody(key, v)}
                    />
                  ))}
                </div>
              )}

              {tab === "style" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {/* Colors */}
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Colors</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      {["skin", "hair", "eyes"].map((k) => (
                        <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                          <span style={{ textTransform: "capitalize" }}>{k}</span>
                          <input
                            type="color"
                            value={features.colors?.[k] ?? "#888888"}
                            onChange={(e) => setColor(k, e.target.value)}
                            style={{ width: "100%", height: 36, border: "1px solid var(--clubpm-border, #e5e7eb)", borderRadius: 4 }}
                          />
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Toggles</div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={!!features.toggles?.hasGlasses}
                          onChange={(e) => setToggle("hasGlasses", e.target.checked)}
                        />
                        Glasses
                      </label>
                      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={!!features.toggles?.hasBeard}
                          onChange={(e) => setToggle("hasBeard", e.target.checked)}
                        />
                        Beard
                      </label>
                    </div>
                  </div>

                  {/* Cosmetic grids */}
                  {Object.entries(SLOT_LABEL).map(([slot, label]) => (
                    <div key={slot}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
                      <div className="cpm-cosmetic-grid">
                        <button
                          type="button"
                          onClick={() => setEquipped(prev => ({ ...prev, [slot]: null }))}
                          className={`cpm-cosmetic-chip ${equipped[slot] === null ? "cpm-rarity-uncommon" : ""}`}
                          style={{ border: equipped[slot] === null ? "2px solid var(--clubpm-accent-primary, #0ea5e9)" : "1px solid var(--clubpm-border, #e5e7eb)", cursor: "pointer", textAlign: "left", background: "none" }}
                        >
                          None
                        </button>
                        {ownedBySlot[slot].map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setEquipped(prev => ({ ...prev, [slot]: c.id }))}
                            className={`cpm-cosmetic-chip cpm-rarity-${c.rarity.toLowerCase()}`}
                            style={{ border: equipped[slot] === c.id ? "2px solid var(--clubpm-accent-primary, #0ea5e9)" : "1px solid transparent", cursor: "pointer", textAlign: "left", background: "inherit" }}
                          >
                            <span className="cpm-cosmetic-name">{c.name}</span>
                            <span className="cpm-cosmetic-meta">{c.rarity.toLowerCase()}</span>
                          </button>
                        ))}
                        {ownedBySlot[slot].length === 0 && (
                          <span style={{ color: "var(--clubpm-text-muted, #636b7a)", fontSize: 12 }}>None owned.</span>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Photo-driven feature extraction — requires live VRM canvas */}
                  {VRM_ENABLED && (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Match a photo</div>
                      <p style={{ fontSize: 12, color: "var(--clubpm-text-muted, #636b7a)", margin: "0 0 8px" }}>
                        Upload a portrait to auto-fill base, colors, glasses/beard, and a few face/body sliders. The photo isn't stored.
                      </p>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => handleUpload(e.target.files?.[0])}
                        disabled={extracting}
                      />
                      {extracting && <div style={{ marginTop: 10 }}>Analyzing…</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: "10px 16px", borderTop: "1px solid var(--clubpm-border, #e5e7eb)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="cpm-btn-primary" onClick={handleSave} disabled={saving} style={{ background: "var(--clubpm-accent-primary, #0ea5e9)", color: "white", border: 0, padding: "6px 14px", borderRadius: 6, cursor: "pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
