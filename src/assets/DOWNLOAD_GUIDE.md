# Asset Download Guide

This guide tells you what assets to download and where to place them.

## Folder Structure Created

```
src/assets/environment/
├── buildings/    # Houses, structures, architecture
├── grass/         # Grass patches, ground vegetation
├── land/          # General terrain features, ground details
├── mountains/     # Mountain-specific details, cliff textures
├── snow/          # Snow patches, snow-covered features
├── trees/         # Various tree types (we already have mature-scots-pine.glb)
├── water/         # Water effects, splashes, ripples
├── mature-scots-pine.glb  # Existing tree asset
└── rock-09/       # Existing rock asset
```

## Recommended Asset Sources

### 1. Poly Pizza (https://poly.pizza) - FREE, No Attribution
Best for: Game-ready, optimized models

**Search terms and folders:**

| Search on Poly Pizza | Download | Put in Folder | Notes |
|---------------------|----------|---------------|-------|
| "low poly tree" | Download GLB | `trees/` | Rename to `tree-1.glb`, `tree-2.glb`, etc. |
| "pine tree" | Download GLB | `trees/` | Add variety to existing pine |
| "palm tree" | Download GLB | `trees/` | If you want tropical feel |
| "rock" | Download GLB | `land/` | Rename to `rock-1.glb`, etc. |
| "grass patch" | Download GLB | `grass/` | Ground vegetation |
| "house" | Download GLB | `buildings/` | Small houses/cabins |
| "cabin" | Download GLB | `buildings/` | Mountain cabins |
| "tower" | Download GLB | `buildings/` | Watchtowers, lighthouses |
| "snow pile" | Download GLB | `snow/` | Snow patches |
| "snow rock" | Download GLB | `snow/` | Snow-covered rocks |
| "water splash" | Download GLB | `water/` | Water effects |
| "water ripple" | Download GLB | `water/` | Ripples/foam |

### 2. Kenney Assets (https://kenney.nl/assets) - FREE, CC0
Best for: Game-specific asset packs

**Download these packs:**

| Pack | Extract to Folder | Rename to |
|------|-------------------|-----------|
| "Nature Pack" | Extract all to `trees/` | Keep original names |
| "Building Bricks" | Extract to `buildings/` | Keep original names |
| "Terrain" | Extract to `land/` | Keep original names |
| "Winter Pack" | Extract to `snow/` | Keep original names |

### 3. Sketchfab (https://sketchfab.com) - Mix of Free/Paid
Best for: High-quality specific models

**How to use:**
1. Search for asset type
2. Filter: "Downloadable" → "Free"
3. Download as GLB (preferred) or GLTF
4. Place in appropriate folder

**Search suggestions:**
- "low poly medieval house" → `buildings/`
- "mountain cabin" → `buildings/`
- "dead tree" → `trees/`
- "boulder" → `land/`
- "snowy tree" → `snow/` or `trees/`

## After Downloading

### Step 1: Organize Files
- Keep GLB files in their folders
- If GLTF with textures, keep everything together in a subfolder
- Use clear, descriptive names

### Step 2: Update credits.md
For each new asset, add to `src/assets/credits.md`:

```markdown
## [Asset Name]

- **Display name:** [Name as shown on source]
- **Author/source:** [Creator name or company]
- **Source:** [URL to asset page]
- **Source model download:** [URL to download]
- **License:** [License type, e.g., CC0 1.0, MIT]
- **Attribution:** [Required or not?]
- **Redistribution conditions:** [Can we bundle it?]
- **Local model:** `src/assets/environment/[folder]/[filename]`
- **Local dependencies:** [If GLTF with textures, list them]
```

### Step 3: Run Tests
```bash
npm test
```

The test in `environment.test.ts` will validate:
- GLB/GLTF format is correct
- All files are documented in credits.md
- No missing dependencies

## Recommended Asset Counts (Start Small)

| Category | Target Count | Why |
|----------|--------------|-----|
| trees | 3-5 | You already have 1, add variety |
| buildings | 2-3 | Cabin, house, tower |
| grass | 2-3 | Different grass patches |
| land | 3-5 | Rocks, ground details |
| snow | 2-3 | Snow patches, snowy rocks |
| water | 1-2 | Splash effects |
| mountains | 1-2 | Mountain-specific details |

## Example: Adding a Tree

1. Go to https://poly.pizza
2. Search "low poly oak tree"
3. Download GLB
4. Save as `src/assets/environment/trees/oak-tree.glb`
5. Add to credits.md with source info
6. Run `npm test` to validate

## Next Steps After Assets Are Loaded

Once you have assets downloaded, I can help you:
1. Create an asset loader system
2. Place assets on terrain based on height/slope
3. Create variety by randomly selecting from asset folders
4. Add LOD (Level of Detail) for performance

Would you like me to help with any of these steps?
