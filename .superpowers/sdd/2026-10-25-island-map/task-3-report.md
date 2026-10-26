# Task 3 report — licensed environment assets

## Outcome

Replaced the oversized Poly Haven Tree Small 02 candidate with Innerscene's Mature Scots pine tree after verifying its actual individual asset page, CC0 terms, preview and downloaded GLB. Kept Poly Haven Rock 09 after verifying its asset page and Poly Haven's asset license. Both are locally bundled; no runtime hotlinks are used.

## Asset/license research

- **Mature Scots pine tree**, credited by its page to Innerscene (no individual author named): [asset landing page](https://www.innerscene.com/tools/library/3d-parts/mature-scots-pine-tree-280307e1), [download](https://www.innerscene.com/api/library/mature-scots-pine-tree-280307e1/download), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
  - The individual page states CC0/public domain and permits use, modification and redistribution for any purpose, including commercial use, without attribution. It identifies the model as textured and real-world scale, with an 18 m height.
  - Download verified as GLB v2, exactly 2,105,404 bytes (~2.1 MB), with 18 mesh primitives, two named materials and two embedded PNG texture images. No external buffers or image URIs. Downloaded preview visually shows a realistic branching Scots pine, not a stylized/low-poly form.
  - Local path: `src/assets/environment/mature-scots-pine.glb`.
- **Rock 09**, Jenelle van Heerden: [asset landing page](https://polyhaven.com/a/rock_09), [1K glTF listing](https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/rock_09/rock_09_1k.gltf), [Poly Haven asset license](https://polyhaven.com/license).
  - Asset page names creator and labels it CC0; Poly Haven license permits commercial use, modification, redistribution and bundling in a product/game; attribution is not required but appreciated. The asset license is separate from website/API terms.
  - Local model and dependencies: `src/assets/environment/rock-09/rock-09.gltf`, `rock_09.bin`, and three 1K JPG maps under `src/assets/environment/rock-09/textures/` (about 2.8 MB total).
- Poly Haven Tree Small 02 was not bundled; its purported 1K listing referenced a 95,102,324-byte geometry buffer, too large for this target.

## Files changed

- `src/assets/credits.md`: source, author, license, attribution guidance, redistribution terms and local model/dependency paths for both assets.
- `src/assets/environment/`: pine GLB and Rock 09 glTF with local textures/buffer.
- `src/assets/environment.test.ts`: dynamically inventories every environment file, discovers every GLB/glTF, validates each model/dependency, and asserts exact equality between the bundled inventory and all local file paths listed in credits; also checks buffer sizes, GLB chunks, and embedded PNG signatures/termination.
- `tsconfig.app.json`: adds the already-installed Node types needed to type-check the file-system-backed asset validation test.

## Verification

- `npm test`: passed, 3 files / 9 tests.
- `npm run build`: passed (`tsc -b` and Vite production build).
- `npm run lint`: passed.
- `git diff --check`: passed.

### Review follow-up: full bundle/credits coverage

Expanded the asset test to discover every bundled GLB/glTF, validate all model dependencies, discover all file paths documented in credits, verify every documented path exists, and assert exact equality between the documented local-file set and the complete environment directory inventory. This catches unregistered files, missing/stale credits paths, and missing model dependencies.

- Command: `npx vitest run src/assets/environment.test.ts`
- Output: `Test Files 1 passed (1); Tests 1 passed (1)` (Vitest v5.0.5, 09:55:41).

## Notes

No model optimizer or external package was installed/run. Task changes were committed separately; the pre-existing plan edit and CodeGraph initialization artifacts were kept out of the task commit.
