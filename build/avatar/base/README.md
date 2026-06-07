# Base VRM authoring contract

Every base VRM in this directory must expose the same vocabulary so the editor
sliders behave identically across bodies. Author in VRoid Studio for the body
silhouette, then open the export in Blender (with the VRM addon) to add the
shared morph targets on the face mesh.

## Face morph targets (Blender shape keys on the face mesh)

All in the range `[0..1]`; default pose is the mesh at `0`. Names must match
exactly — the runtime looks them up by name.

| Name           | Direction                                      |
|----------------|------------------------------------------------|
| `faceWidth`    | wider face (cheekbones spread outward)         |
| `faceJaw`      | wider / more angular jawline                   |
| `faceCheek`    | fuller cheeks (rounder)                        |
| `eyeSize`      | larger eyes                                    |
| `eyeSpacing`   | wider gap between eyes                         |
| `noseWidth`    | wider nostrils                                 |
| `noseHeight`   | longer nose bridge                             |
| `mouthWidth`   | wider mouth                                    |
| `browHeight`   | raised brows                                   |

The standard VRM expressions (`Aa`, `Joy`, `Blink`, etc.) still ship and are
unaffected — they live alongside these custom shape keys.

## MToon material slots

The runtime tints materials by name prefix. Each base VRM should rename its
materials so the head/skin material starts with `Skin`, the hair material with
`Hair`, and the iris material with `Eyes`. Multiple materials are allowed
(e.g. `Skin_Body`, `Skin_Face`) — the prefix match handles both.

## Humanoid bones used by the body sliders

VRM's standard humanoid rig is required; the runtime calls
`vrm.humanoid.getNormalizedBoneNode(name)` with these names:

- `spine`, `chest`, `upperChest`
- `head`
- `leftShoulder`, `rightShoulder`
- `leftUpperLeg`, `rightUpperLeg`

## Bundled files

| File             | Notes                                          |
|------------------|------------------------------------------------|
| `male-01.vrm`    | Placeholder (shared with male-02 / andro-01)   |
| `male-02.vrm`    | Placeholder                                    |
| `female-01.vrm`  | Placeholder (shared with female-02 / andro-02) |
| `female-02.vrm`  | Placeholder                                    |
| `andro-01.vrm`   | Placeholder                                    |
| `andro-02.vrm`   | Placeholder                                    |

The placeholders currently ship without the custom morph vocabulary above —
sliders will no-op until the real assets are authored. Replace files in place
(same names) to roll out new content without code changes.
