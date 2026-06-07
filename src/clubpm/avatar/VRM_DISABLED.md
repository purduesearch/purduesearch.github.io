# VRM 3D Avatar — Disabled

## Why Disabled

The VRM 3D avatar pipeline is not ready to ship in the `feat/engagement-system` PR.
The equippable cosmetic flow (outfit, hair, animation slots) and portrait-snapshot
reliability need additional QA before enabling in production.

This disablement is controlled by a `VRM_ENABLED` constant in two files:
- `src/components/clubpm/avatar/AvatarEditor.jsx`
- `src/pages/ClubPM/Profile.jsx`

When `VRM_ENABLED = false`:
- `AvatarEditor` shows an `<AvatarPortrait>` fallback instead of the `<AvatarModel>` canvas.
- The photo-driven feature-extraction tab is hidden (no canvas → no snapshot).
- `Profile.jsx` renders `<AvatarPortrait>` instead of the R3F `<AvatarModel>` scene.

VRM assets and infrastructure remain intact and dormant:
- `src/components/clubpm/avatar/AvatarModel.jsx`
- `src/clubpm/avatar/vrm/*`  (base models, blendshapes, migrateFeatureJson, snapshot)

Astro/Research 3D surfaces (`AstroSubsystem3D.jsx`, `STLViewer.jsx`) are unaffected.

## Files Involved

| File | Role |
|------|------|
| `AvatarModel.jsx` | Three.js / R3F scene that loads the VRM GLB |
| `AvatarEditor.jsx` | Editor shell — has `VRM_ENABLED` constant |
| `Profile.jsx` | Profile page — has `VRM_ENABLED` constant |
| `src/clubpm/avatar/vrm/baseModels.js` | Base GLB registry |
| `src/clubpm/avatar/vrm/blendshapeMap.js` | Morph-target ↔ featureJson mapping |
| `src/clubpm/avatar/vrm/migrateFeatureJson.js` | Schema migration for saved configs |
| `src/clubpm/avatar/vrm/snapshot.js` | Portrait capture via `toDataURL` |
| `src/api/clubPmClient.js` | `/api/avatar/config` and `/api/avatar/extract-features` calls |

## How to Re-Enable

1. In `AvatarEditor.jsx`, change:
   ```js
   const VRM_ENABLED = false;
   ```
   to:
   ```js
   const VRM_ENABLED = true;
   ```

2. In `Profile.jsx`, change:
   ```js
   const VRM_ENABLED = false;
   ```
   to:
   ```js
   const VRM_ENABLED = true;
   ```

3. Restore any lazy imports that were commented out (search for `// VRM_DISABLED`).

4. Validate the cosmetic-equip flow in `AvatarEditor` with a real VRM GLB to confirm
   `capturePortrait()` writes a valid data-URL to the backend.

5. Run the full engagement e2e checklist from the plan doc before merging.
