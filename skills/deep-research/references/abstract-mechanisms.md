# Abstract Mechanisms Vocabulary

Cross-domain translation vocabulary. When a sub-problem has no solution in its obvious field,
abstract the mechanism and search for solutions in fields listed here.

This file grows over time. During Phase 5, when a successful cross-domain translation is found,
append the mechanism if not already present. During Phase 7, confirm and commit new entries.

## Mechanisms

| Abstract Mechanism | Description | Example Concrete Problems |
|---|---|---|
| Region detection in noisy signal | Locating bounded regions of interest within a larger noisy field | Text in image, tumor in scan, object in satellite, defect in wafer |
| Constrained signal reconstruction | Recovering missing or corrupted signal regions given surrounding context | Image inpainting, audio denoising, missing data imputation, video frame interpolation |
| Attribute disentanglement | Separating orthogonal attributes that are entangled in a single representation | Style/content separation, speaker/speech separation, pose/identity disentanglement |
| Conditional generation under constraints | Generating new samples that match specific attributes from a reference | Text rendering in style, voice cloning, texture synthesis, virtual try-on |
| Inverse problem (observe output, infer input) | Reconstructing an input representation from an observed output | Image to layers, audio to stems, compiled to source, rendered to scene graph |
| Sequence alignment under noise | Aligning two sequences that share structure but differ in noise or representation | DNA alignment, time series matching, subtitle sync, multilingual parallel text |
| Hierarchical composition from primitives | Building complex outputs by composing simpler, reusable parts | UI from components, music from samples, molecules from fragments, programs from functions |

## Usage

During Phase 0 (FRAME): tag each sub-problem with the closest abstract mechanism.
During Phase 5 (DEVELOP): when a gap has no within-field solution, use the mechanism to
identify which other fields to search.

Example:
```
GAP: "style-preserving text re-rendering"
Abstract mechanism: "Conditional generation under constraints"
Search fields: speech synthesis (voice cloning), music (style transfer), 3D (texture transfer)
```
