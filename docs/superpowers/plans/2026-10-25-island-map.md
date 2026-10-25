# Island Map Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive browser-based 3D view of the uninhabited island with the approved landscape, atmospheric lighting, and keyboard/mouse camera controls.

**Architecture:** React owns the page shell, help overlay, loading/error states, and lifecycle of a separate Three.js scene module. Pure terrain-generation helpers create the editable island mesh; Three.js renders the terrain, ocean, sky, lighting, and licensed environment assets. Camera input and snapping are isolated from React state and tested independently.

**Tech Stack:** Vite, React, TypeScript, Three.js, Vitest, React Testing Library, and browser-based manual verification.

**Spec:** `docs/superpowers/specs/2026-10-25-island-map-design.md`

## Global Constraints

- Current phase is the island map only; do not add buildings, roads, economy, resources, saving, or multiplayer.
- Use React + TypeScript + Vite for the web app and Three.js for the independent 3D scene.
- Start with a full-island view; the island is uninhabited, with a broad harbor, central plains, rear hills/mountains, and distributed forests.
- Use warm clear daylight and calm, subtly moving water; no dynamic weather or day/night cycle.
- Camera: arrow keys pan, wheel zooms, Ctrl + pointer movement rotates without a mouse button, Ctrl release snaps to the nearest of four 90-degree headings, with fixed tilt.
- Use only assets whose use is permitted by their licenses; record source, author, license, and attribution requirements.
- Target approximately 60 FPS on a mid-range desktop as an optimization goal, not an unconditional guarantee.
- Show an understandable fallback when WebGL or a required scene resource fails; do not leave a blank canvas.
- No Git repository exists yet; do not initialize Git or create commits as part of implementation unless the user explicitly requests it.

---

## Planned File Structure

- `package.json` — scripts and application/test dependencies.
- `index.html` — Vite document shell and language metadata.
- `vite.config.ts` — Vite and Vitest configuration.
- `tsconfig.json` — TypeScript project settings.
- `src/main.tsx` — React application entry point.
- `src/App.tsx` — page shell, scene lifecycle, control hints, and error/loading states.
- `src/styles.css` — full-viewport responsive layout and unobtrusive overlay styling.
- `src/game/island/terrain.ts` — deterministic island footprint and height-generation helpers, independent of Three.js where practical.
- `src/game/island/terrain.test.ts` — tests for coastline, harbor indentation, central lowland, and rear highlands.
- `src/game/island/IslandScene.ts` — Three.js renderer, scene, terrain/ocean/sky/lighting, environment asset loading, resize handling, and disposal.
- `src/game/island/CameraController.ts` — arrow-key pan, wheel zoom, Ctrl pointer rotation, four-heading snap, and camera bounds.
- `src/game/island/CameraController.test.ts` — deterministic tests for input mapping, limits, and snap behavior.
- `src/game/island/IslandScene.test.ts` — scene lifecycle, resize, and failure-path tests using mocked WebGL/Three dependencies where browser rendering is unavailable.
- `src/assets/` — licensed GLB/GLTF and texture files used in the scene, organized by type.
- `src/assets/credits.md` — source, author, license, source URL, and attribution for every bundled asset.
- `public/` — static application assets only when an asset loader requires stable public URLs.

Keep each module focused. If an asset is loaded by URL from `public/`, keep its credit record alongside the project-level asset register and do not silently hotlink a third-party server at runtime.

---

### Task 1: Scaffold the React, TypeScript, and Vite application

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- `main.tsx` mounts `App` into `#root`.
- `App` renders a full-viewport scene host and accessible loading/error regions; no game HUD or game systems.

- [ ] **Step 1: Create the Vite React TypeScript scaffold and install dependencies**

Run:
```bash
npm create vite@latest . -- --template react-ts
npm install three
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

Expected: Vite produces the app shell and package scripts. If the directory isn't accepted as an existing Vite target, scaffold into a temporary sibling directory and move only the generated files after confirming no user files would be overwritten.

- [ ] **Step 2: Configure Vitest and a DOM test environment**

Set `test.environment` to `jsdom`, load `@testing-library/jest-dom/vitest`, and add a `test` script running `vitest run`.

- [ ] **Step 3: Add an App smoke test**

In `src/App.test.tsx`, render `App` with the Three.js scene module mocked and assert that the scene host, the «الجزيرة غير مأهولة» label, and the control hint region exist.

- [ ] **Step 4: Run the initial application and test**

Run:
```bash
npm test
npm run build
```

Expected: Vitest passes and Vite emits a production build without TypeScript errors.

---

### Task 2: Build deterministic editable island terrain data

**Files:**
- Create: `src/game/island/terrain.ts`
- Create: `src/game/island/terrain.test.ts`

**Interfaces:**
```ts
export type TerrainSample = {
  x: number;
  z: number;
  height: number;
  land: boolean;
};

export type IslandTerrain = {
  width: number;
  depth: number;
  segments: number;
  heights: Float32Array;
  landMask: Uint8Array;
};

export function createIslandTerrain(seed: number, segments?: number): IslandTerrain;
export function sampleIslandTerrain(terrain: IslandTerrain, x: number, z: number): TerrainSample;
```

- [ ] **Step 1: Write failing deterministic-terrain tests**

Cover: identical seed gives identical arrays; most points inside the island bounds are land; the perimeter slopes down to sea level; the broad harbor is a water indentation on one coast; the central buildable region has lower mean height than the rear mountain ridge; at least two highland peaks rise above the plains.

- [ ] **Step 2: Run the terrain tests and confirm they fail**

Run:
```bash
npm test -- src/game/island/terrain.test.ts
```

Expected: FAIL because the terrain functions are not implemented.

- [ ] **Step 3: Implement deterministic height and land-mask generation**

Generate a rectangular vertex grid. Combine an irregular elliptical island falloff, a fixed harbor indentation on one side, low-frequency rolling plains, and several Gaussian hill/peak influences along the rear side. Use a seeded pseudo-random source only for small natural variation, not to change the major landform. Return the sampled arrays without any visible grid overlay.

- [ ] **Step 4: Run the terrain tests and confirm they pass**

Run:
```bash
npm test -- src/game/island/terrain.test.ts
```

Expected: PASS for deterministic seed, shore falloff, harbor shape, central plains, and rear highlands.

---

### Task 3: Verify and add licensed environmental assets

**Files:**
- Create: `src/assets/environment/` (licensed tree and rock assets, with required textures)
- Create: `src/assets/credits.md`
- Modify: `package.json` only if asset-processing dependencies are necessary

**Interfaces:**
- Scene loading consumes local bundled asset URLs. Runtime must not depend on third-party hotlinks.
- `credits.md` records, for every asset, the display name, author, source URL, license, attribution text, and any redistribution conditions.

- [ ] **Step 1: Select assets from sources with explicit reuse terms**

Use assets whose license has been verified to allow bundling and use in this project (prefer CC0 or an equally permissive license). Check source and license pages individually; don't infer rights from a download page title. Pick a small compatible set of tree and rock models that share plausible scale and material style.

- [ ] **Step 2: Record license metadata before adding each asset**

Add each asset's exact source, author, license, attribution requirements, and source URL to `src/assets/credits.md`. Do not bundle assets whose redistribution terms are unclear or incompatible.

- [ ] **Step 3: Bundle optimized model and texture files locally**

Add the verified files to `src/assets/environment/`; use compressed glTF/GLB and optimized texture sizes appropriate for desktop web where the source format permits. Remove unused textures/materials without violating the source license.

- [ ] **Step 4: Check asset records and file paths**

Run a test or a small validation script that confirms each imported environment asset has a matching `credits.md` record and that each referenced file exists.

Expected: all bundled assets are local, licensed, documented, and loadable; no assets are sourced from Anno 1800.

---

### Task 4: Render the island, ocean, atmosphere, and environment

**Files:**
- Create: `src/game/island/IslandScene.ts`
- Create: `src/game/island/IslandScene.test.ts`
- Consume: `src/game/island/terrain.ts`
- Consume: `src/assets/environment/` and `src/assets/credits.md`

**Interfaces:**
```ts
export type IslandSceneHandle = {
  resize(): void;
  dispose(): void;
};

export async function createIslandScene(
  container: HTMLElement,
  onFatalError: (message: string) => void,
): Promise<IslandSceneHandle>;
```

- [ ] **Step 1: Write failing scene lifecycle tests**

Mock WebGLRenderer, asset loaders, and `requestAnimationFrame`. Assert that initialization appends a canvas, calls resize on the active container dimensions, `dispose()` removes the canvas and listeners, and renderer initialization failure invokes `onFatalError` with a user-readable Arabic message.

- [ ] **Step 2: Run the tests and confirm they fail**

Run:
```bash
npm test -- src/game/island/IslandScene.test.ts
```

Expected: FAIL because `createIslandScene` is not implemented.

- [ ] **Step 3: Create renderer, scene, camera, and lighting**

Set a WebGL renderer with capped device pixel ratio, color-space/tone-mapping appropriate for natural daylight, a warm directional light with soft shadows, and ambient/hemisphere fill. Keep renderer configuration centralized in `IslandScene.ts`.

- [ ] **Step 4: Add terrain and water meshes**

Convert the generated height array into a mesh with smooth normals and natural green/earth material zones by elevation. Add a broad ocean plane, calm blue material, subtle shader or low-cost animated normal movement, and a continuous shallow coastal transition. Do not add roads, buildings, docks, or structures.

- [ ] **Step 5: Load and instance environment assets**

Load verified local tree and rock GLB/GLTF files. Place clustered forests around highlands and peripheral plains while keeping the center open. Use `InstancedMesh` for repeated models; skip a failed secondary asset with a developer-visible warning and continue rendering the terrain.

- [ ] **Step 6: Implement disposal and resource cleanup**

Cancel the render loop, remove all listeners, dispose renderer/geometries/materials/textures and loaded asset resources owned by the scene, and remove the renderer canvas on unmount.

- [ ] **Step 7: Run scene tests and the production build**

Run:
```bash
npm test -- src/game/island/IslandScene.test.ts
npm run build
```

Expected: lifecycle/error tests pass and the production build succeeds.

---

### Task 5: Implement bounded keyboard, wheel, and Ctrl-pointer camera controls

**Files:**
- Create: `src/game/island/CameraController.ts`
- Create: `src/game/island/CameraController.test.ts`
- Modify: `src/game/island/IslandScene.ts`

**Interfaces:**
```ts
export type CameraControllerOptions = {
  camera: THREE.PerspectiveCamera;
  element: HTMLElement;
  islandCenter: THREE.Vector3;
  movementBounds: THREE.Box2;
  minDistance: number;
  maxDistance: number;
  onRenderRequested: () => void;
};

export function createCameraController(options: CameraControllerOptions): {
  update(deltaSeconds: number): void;
  dispose(): void;
};
```

- [ ] **Step 1: Write failing camera-control tests**

Test that each arrow key moves along the appropriate camera-relative ground-plane direction; opposing keys cancel; movement is bounded; wheel input changes camera distance and stays within min/max; Ctrl-pointer movement changes azimuth without mouse buttons; releasing Ctrl requests smooth snap to the nearest 90-degree heading; tilt remains fixed; and disposal removes listeners.

- [ ] **Step 2: Run tests and confirm they fail**

Run:
```bash
npm test -- src/game/island/CameraController.test.ts
```

Expected: FAIL because the camera controller is missing.

- [ ] **Step 3: Implement normalized arrow-key movement**

Track keydown/keyup state for arrows. On each animation update, calculate camera-relative forward/right vectors projected onto the ground plane, normalize combined movement, apply a configurable speed, and clamp the camera target to island bounds. Ignore input while a text-entry element is focused.

- [ ] **Step 4: Implement wheel zoom and limits**

Use a non-passive wheel listener on the scene element, prevent page scroll while the pointer is over the scene, adjust camera distance smoothly, and clamp to min/max distances. Determine the initial distance from the camera frustum and island bounds so the full island plus a sea margin fits at start.

- [ ] **Step 5: Implement Ctrl pointer rotation and four-heading snap**

When Ctrl is held, track pointer movement over the scene and adjust azimuth smoothly without requiring mouse-button state. On Ctrl keyup, animate azimuth to the nearest 0/90/180/270-degree heading. Keep polar angle/tilt constant. Ignore Ctrl rotation while a text-entry element is focused.

- [ ] **Step 6: Verify camera tests pass**

Run:
```bash
npm test -- src/game/island/CameraController.test.ts
```

Expected: PASS for all input, bounds, snapping, and cleanup cases.

---

### Task 6: Connect React lifecycle, responsive layout, hints, and error fallback

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `src/App.test.tsx`
- Consume: `src/game/island/IslandScene.ts`

- [ ] **Step 1: Add failing app tests for states and lifecycle**

Test loading state before scene resolution; success removes loading feedback and displays the canvas and control hints; a fatal scene error displays the Arabic error message and retry action; clicking retry invokes initialization again; unmount calls `dispose()`.

- [ ] **Step 2: Run app tests and confirm the new assertions fail**

Run:
```bash
npm test -- src/App.test.tsx
```

Expected: FAIL for unimplemented initialization, retry, and disposal behavior.

- [ ] **Step 3: Mount the scene safely and expose loading/error state**

Use a React effect with a stable container ref. Start `createIslandScene` once per mount, avoid state updates after unmount, dispose a scene that resolves after unmount, and expose a retry button for fatal initialization failure.

- [ ] **Step 4: Add unobtrusive Arabic control hints and uninhabited label**

Render a semi-transparent overlay for arrow movement, wheel zoom, Ctrl rotation, and «الجزيرة غير مأهولة». Position it away from the central landscape and keep pointer events disabled on hint text so it does not block scene input.

- [ ] **Step 5: Make the scene resize without reconstruction**

Use `ResizeObserver` on the scene container (with a window resize fallback) to update renderer size and camera aspect ratio while preserving camera position and heading. Clean up the observer during unmount.

- [ ] **Step 6: Run the tests and production build**

Run:
```bash
npm test
npm run build
```

Expected: all app, terrain, scene-lifecycle, and camera tests pass; production build succeeds.

---

### Task 7: Browser verification and performance tuning

**Files:**
- Modify as needed: `src/game/island/IslandScene.ts`
- Modify as needed: `src/game/island/CameraController.ts`
- Modify as needed: `src/styles.css`
- Verify: `src/assets/credits.md`

- [ ] **Step 1: Launch the application and inspect its first frame**

Run the project dev server and open it in a desktop browser. Confirm that the entire island and surrounding sea are visible, the harbor is broad, the center is buildable plain, rear hills/mountains and forests are present, no settlement/roads/HUD appear, and the visual is natural rather than cartoon/low-poly.

- [ ] **Step 2: Exercise all camera inputs in the real browser**

Verify arrow movement, wheel zoom, Ctrl + pointer rotation without mouse buttons, snap on Ctrl release, fixed tilt, island boundary clamping, and full-island framing at the initial zoom. Repeat after resizing the browser.

- [ ] **Step 3: Verify UI, error, and cleanup behavior**

Confirm hints are legible but unobtrusive. Use development-only error injection to verify the WebGL fatal fallback and optional asset-skip path. Navigate away and back or hot-reload to ensure no duplicate canvas, render loop, or event listeners remain.

- [ ] **Step 4: Measure and tune rendering cost**

Use browser performance tools on the representative desktop target. Confirm repeated vegetation uses instancing, reduce draw calls/shadow cost if frame time exceeds the approximate 16.7 ms goal, and record measured browser/device plus result in the implementation notes.

- [ ] **Step 5: Re-run the complete verification suite**

Run:
```bash
npm test
npm run build
```

Expected: all tests pass and build succeeds after visual/performance adjustments.

---

## Self-Review Checklist

- [x] Spec coverage: terrain, harbor, plains, highlands, forests, assets/licensing, lighting, camera controls/bounds, overlays, responsive resize, WebGL/asset failures, and approximate performance each have implementation and verification tasks.
- [x] Scope control: no buildings, roads, economy, game save, server, multiplayer, mobile, or dynamic weather tasks are included.
- [x] Interface consistency: `createIslandTerrain(seed, segments?)`, `sampleIslandTerrain(terrain, x, z)`, `createIslandScene(container, onFatalError)`, and `createCameraController(options)` are defined before use.
- [x] No commit steps are included because the workspace is not currently a Git repository.
