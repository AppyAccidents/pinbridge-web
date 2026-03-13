# MapSwitch Integration into PinBridge

**Date:** 2026-03-14
**Status:** Approved

## Summary

Integrate MapSwitch's functionality into PinBridge Web: new import parsers (GeoJSON, KML, KMZ), new export formats (KML, Apple Shortcut, bulk copy links), and a stateless Quick Convert page (`/convert`) that mirrors MapSwitch's UI style and interaction model.

## Goals

1. Support GeoJSON, KML, and KMZ import formats alongside existing CSV/Takeout ZIP
2. Add KML export (for Google My Maps), Apple Shortcut export, and bulk link copy
3. Provide a standalone Quick Convert page — stateless, in-memory only, MapSwitch-style UI
4. Extend existing `/import` and `/export` pages with the new formats
5. Share all parser/exporter logic between both flows

## Non-Goals

- No automatic sync between map providers
- Quick Convert does not save to IndexedDB
- No changes to database schema or stores
- `ImportRun.type` union will be extended minimally (see Section 4.1)

---

## 1. Parsers

All parsers return `{ places: ParsedPlace[], errors: ImportError[] }` matching the existing contract from `src/types/index.ts`.

### 1.1 Unified Entry Point — `src/lib/parsers/index.ts` (updated)

This file currently re-exports from `csv.ts` and `takeout.ts`. Those exports are preserved. The new `parseFile()` function is added alongside them.

```typescript
// Existing re-exports preserved
export { parseCsv, exportToCsv, getCsvTemplate } from './csv';
export { parseTakeoutZip, parseTakeoutCsv } from './takeout';
export type { TakeoutParseResult } from './takeout';

// New
export { parseGeoJson } from './geojson';
export { parseKml, parseKmz } from './kml';

export async function parseFile(file: File): Promise<{
  places: ParsedPlace[];
  errors: ImportError[];
}>;
```

Routes by file extension with content-sniffing fallback:

| Extension | Parser |
|-----------|--------|
| `.kmz` | ArrayBuffer → KMZ extractor (JSZip) → KML parser |
| `.json`, `.geojson` | GeoJSON parser |
| `.kml` | KML parser |
| `.csv`, `.tsv`, `.txt` | CSV parser (existing) |
| Other | Content sniff: `{`/`[` → GeoJSON, `<?xml`/`<kml` → KML, else → CSV |

Auto-detects CSV delimiter (tab, pipe, semicolon, comma) by counting occurrences in the header row.

Derives `listName` from filename: strip extension, normalize "Saved Places" → "Favorites".

### 1.2 GeoJSON Parser — `src/lib/parsers/geojson.ts`

```typescript
export function parseGeoJson(content: string, fileName: string): {
  places: ParsedPlace[];
  errors: ImportError[];
};
```

- Parses JSON, checks for `FeatureCollection` with `features` array
- Handles bare JSON arrays by wrapping in FeatureCollection
- Handles standalone `Feature` objects by wrapping in `[feature]`
- Filters to features with `geometry.type === 'Point'` (other geometry types are skipped)
- Per feature extraction:
  - `properties.name || properties.title || properties.Title || "Unnamed Place"` → title
  - `properties.address || properties.location?.address || ""` → address
  - `geometry.coordinates[1]` → latitude, `geometry.coordinates[0]` → longitude (GeoJSON is lng,lat order)
  - `properties.note || properties.comment || properties.description` → notes
  - `properties.url || properties.google_maps_url || properties["Google Maps URL"]` → sourceUrl
  - `properties.list || listName(fileName)` → listName
- Returns error `"Not a recognized GeoJSON format."` for non-FeatureCollection, non-array, non-Feature JSON
- Returns error `"Invalid JSON file."` for parse failures

### 1.3 KML Parser — `src/lib/parsers/kml.ts`

```typescript
export function parseKml(content: string, fileName: string): {
  places: ParsedPlace[];
  errors: ImportError[];
};
```

- Uses `DOMParser` to parse XML as `application/xml`
- `querySelectorAll('Placemark')` to find all place elements (works through nested `<Folder>` elements)
- Per Placemark extraction:
  - `<name>` → title (fallback: "Unnamed Place")
  - `<description>` → notes
  - `<address>` → address
  - `<coordinates>` text → split on comma: `[0]` = longitude, `[1]` = latitude (KML is lng,lat,alt)
  - Validates coordinates with `isFinite()`
- Returns error `"Could not parse KML file."` on failure

### 1.4 KMZ Extractor — `src/lib/parsers/kml.ts`

```typescript
export async function parseKmz(file: File, fileName: string): Promise<{
  places: ParsedPlace[];
  errors: ImportError[];
}>;
```

- Uses JSZip (already installed in `package.json`) to extract the KMZ archive
- JSZip handles all compression methods (DEFLATE, stored, etc.) — this is critical since most real-world KMZ files from Google Earth/My Maps use DEFLATE compression
- Finds the first `.kml` file in the archive, extracts as string
- Passes extracted KML content to `parseKml()`
- Returns error `"No KML file found in KMZ archive"` if no .kml entry
- Returns error `"Could not read KMZ file."` on failure

---

## 2. Exporters

New module: `src/lib/exporters/`

### 2.0 Shared URL Generation — `src/lib/exporters/url.ts`

Exporters need to generate Apple/Google Maps URLs from `ParsedPlace` objects (which lack the full `Place` type). Rather than duplicating the logic from `src/lib/links/index.ts`, this module provides lightweight wrappers:

```typescript
export function generateAppleMapsUrlForPlace(place: ParsedPlace): string;
export function generateGoogleMapsUrlForPlace(place: ParsedPlace): string;
```

**Apple Maps URLs** use the MapSwitch-style format for the Shortcut exporter specifically:
- With coordinates: `https://maps.apple.com/place?coordinate={lat},{lng}&name={name}`
- Without: `https://maps.apple.com/search?query={name, address}`

This differs from the existing `generateAppleMapsUrl()` in `src/lib/links/index.ts` which uses `?ll=` format. The MapSwitch format is used because:
1. The `/place?coordinate=` format is the newer Apple Maps URL scheme
2. It works better with Shortcuts' `openurl` action
3. The existing `?ll=` format in `src/lib/links/` is preserved for all other PinBridge features (transfer packs, link lists, place detail page)

**Google Maps URLs** use the same format as existing: `https://www.google.com/maps/search/?api=1&query={lat},{lng}` or query fallback.

### 2.1 KML Export — `src/lib/exporters/kml.ts`

```typescript
export function exportToKml(
  places: PlaceLike[],
  documentName: string
): Blob;
```

`PlaceLike` is a type alias that accepts both `ParsedPlace` and `Place`:

```typescript
type PlaceLike = {
  title?: string;
  name?: string;  // MapSwitch uses 'name', PinBridge uses 'title'
  address?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;     // MapSwitch field names
  lng?: number;
  notes?: string;
  note?: string;
};
```

This avoids needing a conversion step — the exporter reads whichever fields are present.

- Generates KML XML:
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
      <name>{documentName}</name>
      <Placemark>
        <name>{escaped name}</name>
        <description>{address — note}</description>
        <address>{escaped address}</address>
        <Point><coordinates>{lng},{lat},0</coordinates></Point>
      </Placemark>
    </Document>
  </kml>
  ```
- Only includes `<description>`, `<address>`, `<Point>` when values exist
- XML-escapes all strings: `&` `<` `>` `"`
- Returns `Blob` with type `application/vnd.google-earth.kml+xml`

### 2.2 Apple Shortcut Export — `src/lib/exporters/shortcut.ts`

```typescript
export function exportToShortcut(places: PlaceLike[]): Blob;
```

- Generates Apple Shortcuts plist XML
- Each place produces two workflow actions:
  1. `is.workflow.actions.openurl` — opens the Apple Maps URL
  2. `is.workflow.actions.waitfornavigation` — 2 second delay
- Uses `generateAppleMapsUrlForPlace()` for URL generation
- XML-escapes all URLs
- Returns `Blob` with type `application/x-apple-shortcut`

### 2.3 Quick CSV Export — `src/lib/exporters/csv.ts`

```typescript
export function exportQuickCsv(
  places: PlaceLike[],
  target: 'apple' | 'google'
): Blob;
```

- Lightweight CSV for Quick Convert (no IDs, timestamps, or collection maps)
- Columns: Name, Address, Latitude, Longitude, Original URL, {Target} Maps URL, Note
- Proper CSV escaping (quotes around values containing commas, quotes, newlines)
- Returns `Blob` with type `text/csv`

### 2.4 Bulk Link Copy — `src/lib/exporters/links.ts`

```typescript
export function generateBulkLinks(
  places: PlaceLike[],
  target: 'apple' | 'google'
): string;
```

- Generates one URL per place, joined with newlines
- Uses `generateAppleMapsUrlForPlace()` / `generateGoogleMapsUrlForPlace()`
- Returns string for `navigator.clipboard.writeText()`

### 2.5 File Download Helper — `src/lib/exporters/download.ts`

```typescript
export function downloadBlob(blob: Blob, filename: string): void;
```

- Creates object URL, creates `<a>` element, sets download attribute, clicks, revokes URL
- Shared by all export functions

---

## 3. Quick Convert Page

### 3.1 Route & Layout

- **Path:** `/convert`
- **Layout:** NOT wrapped in AppShell. Achieved via Next.js route groups:
  - Move existing pages into `src/app/(main)/` route group with a `layout.tsx` that wraps children in `<AppShell>`
  - Root `src/app/layout.tsx` becomes a bare shell (html/body/Toaster only, no AppShell)
  - `src/app/convert/layout.tsx` provides the standalone MapSwitch-style layout
  - All existing routes are unaffected — route groups don't change URL paths
- **Component:** `src/app/convert/page.tsx` — single `'use client'` component
- **State:** All React `useState`, no IndexedDB, no Zustand

### 3.2 Visual Style — MapSwitch Theme

The Quick Convert page uses MapSwitch's visual language, scoped via CSS variables on the page wrapper (not global — PinBridge's existing theme is unchanged).

**Color palette (dark mode — primary experience):**

| Token | Value |
|-------|-------|
| `--background` | `210 15% 8%` |
| `--foreground` | `40 10% 92%` |
| `--card` | `210 12% 10%` |
| `--border` | `210 8% 18%` |
| `--primary` | `192 70% 45%` (teal/cyan) |
| `--primary-foreground` | `0 0% 99%` |
| `--muted` | `210 6% 20%` |
| `--muted-foreground` | `210 6% 55%` |

**Light mode:**

| Token | Value |
|-------|-------|
| `--background` | `40 20% 97%` |
| `--foreground` | `210 20% 12%` |
| `--card` | `40 18% 98%` |
| `--border` | `40 10% 88%` |
| `--primary` | `192 85% 30%` |
| `--muted` | `40 10% 93%` |
| `--muted-foreground` | `210 8% 46%` |

**Typography:** `General Sans` (body) + `Cabinet Grotesk` (headings) via Fontshare. Loaded in the convert page layout only.

**Animation:** CSS animations using Tailwind's `animate-` utilities and `tailwindcss-animate` (already installed). Spring-like motion via `cubic-bezier(0.16, 1, 0.3, 1)` easing. Staggered entry via `animation-delay` on children. No Framer Motion dependency needed.

### 3.3 Empty State

```
[Header: logo + "PinBridge" + "APPYACCIDENTS 2026" badge + theme toggle]

"Move your saved places"
"Drop a Google Takeout file and get Apple Maps links instantly.
 Works with CSV, GeoJSON, KML, and KMZ."

┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐
│                                 │
│         [upload icon]           │
│                                 │
│  Drop files here or click to    │
│         browse                  │
│                                 │
│  CSV, GeoJSON, KML, KMZ —      │
│  format is auto-detected        │
│                                 │
├─────────────────────────────────┤
│ ℹ How to get your Google Maps   │
│   data                      ▼  │
└─────────────────────────────────┘

[Google icon] [transfer icon] [Apple icon]
Format auto-detected. Coordinates extracted when available.

[footer: An AppyAccidents 2026 project]
```

- Drop zone: dashed border, `border-border hover:border-primary/40`, clickable
- Drag over state: `border-primary bg-primary/5`
- Progress bar shown during parsing with percentage
- Collapsible instructions: numbered steps for Google Takeout export

### 3.4 Results State

```
[Header: same]

[X places] [Y with coordinates] [Clear all]

┌─────────────────────────────────┐
│ Place Name              [list]  │
│ 40.7128, -74.0060              │
│ 123 Main St, New York          │
│ Open in Apple Maps  [copy] [x] │
├─────────────────────────────────┤
│ ...more places...               │
└─────────────────────────────────┘

┌─ Export & Save ─────────────────┐
│ ┌──────────┐ ┌────────────────┐│
│ │ CSV      │ │ KML            ││
│ │ Download │ │ Google My Maps ││
│ └──────────┘ └────────────────┘│
│ ┌──────────┐ ┌────────────────┐│
│ │ Shortcut │ │ Copy Links     ││
│ │ iPhone   │ │ All to clipboard│
│ └──────────┘ └────────────────┘│
├─────────────────────────────────┤
│ ℹ How to add all pins to a     │
│   guide or list             ▼  │
│                                 │
│ [Apple Maps Guide instructions] │
│ [Google My Maps instructions]   │
└─────────────────────────────────┘

[footer]
```

- Place list: animated entry with stagger, each card shows name/coords/address/note
- Per-place: clickable target maps link, copy single link, delete from list
- Export grid: 2x2 on sm+, stacked on mobile
- Collapsible instructions for Apple Maps Guide (Shortcut workflow) and Google My Maps (KML upload)
- Auto-detect source: if places have `google` source, target defaults to `apple` and vice versa

### 3.5 Component State

Each place in Quick Convert gets a transient `id` assigned at parse time via `crypto.randomUUID()` for React keys and copy-feedback tracking. This is added by the `parseFile()` entry point — it does NOT modify the `ParsedPlace` type. Instead, Quick Convert uses a local extended type:

```typescript
interface ConvertPlace extends ParsedPlace {
  id: string;         // transient, assigned at parse time
  name?: string;      // alias for title (MapSwitch compat)
  source?: string;    // detected source provider
}

const [places, setPlaces] = useState<ConvertPlace[]>([]);
const [detectedSource, setDetectedSource] = useState<'apple' | 'google' | null>(null);
const [isDragOver, setIsDragOver] = useState(false);
const [copiedId, setCopiedId] = useState<string | null>(null);
const [isProcessing, setIsProcessing] = useState(false);
const [progress, setProgress] = useState(0);
const [showInstructions, setShowInstructions] = useState(false);
const [showExportHelp, setShowExportHelp] = useState(false);
```

Target provider is derived: `detectedSource === 'apple' ? 'google' : 'apple'`.

---

## 4. Existing Page Extensions

### 4.1 Import Page (`/import`)

- Update Google Takeout card's file input `accept`: `.zip,.csv,.json,.geojson,.kml,.kmz`
- Replace manual `.zip`/`.csv` branching with `parseFile()` from unified entry point
- For `.zip` files, continue using `parseTakeoutZip()` (handles Takeout-specific folder structure)
- For all other files, use `parseFile()`
- Update card description: "Upload your Takeout ZIP, CSV, GeoJSON, KML, or KMZ"
- Add cross-link to Quick Convert below the import cards

**Type change:** Add `'geojson' | 'kml' | 'kmz'` to the `ImportRun.type` union in `src/types/index.ts`:

```typescript
// Before
type: 'takeout' | 'csv' | 'link';

// After
type: 'takeout' | 'csv' | 'link' | 'geojson' | 'kml' | 'kmz';
```

This is a type-only change — no database migration needed since Dexie does not enforce column types.

### 4.2 Export Page (`/export`)

Add three new cards after the existing CSV card:

1. **KML Export** card:
   - Icon: `Map` from lucide
   - Title: "Export KML"
   - Description: "Download a KML file for import into Google My Maps"
   - Button: "Download KML"
   - Uses `exportToKml()` with places from library

2. **Apple Shortcut** card:
   - Icon: `Smartphone` from lucide
   - Title: "Apple Shortcut"
   - Description: "Download a Shortcut that opens each place in Apple Maps on your iPhone"
   - Button: "Download Shortcut"
   - Uses `exportToShortcut()`

3. **Copy All Links** card:
   - Icon: `ClipboardCopy` from lucide
   - Title: "Copy All Links"
   - Description: "Copy Apple Maps or Google Maps links for all places to clipboard"
   - Toggle: Apple / Google target
   - Button: "Copy to Clipboard"
   - Uses `generateBulkLinks()`

All export cards respect the existing collection scope selector. The `Place[]` from IndexedDB is passed directly to exporters via the `PlaceLike` type (Section 2.1) — no conversion needed.

### 4.3 Navigation

- Add cross-links between `/import` ↔ `/convert` and `/export` ↔ `/convert`
- Do NOT add `/convert` to the main nav (sidebar/bottom bar) — it's a utility, not a core flow

---

## 5. File Structure

```
src/app/
  layout.tsx             — updated: bare shell (html/body/Toaster), no AppShell
  (main)/
    layout.tsx           — new: wraps children in AppShell
    page.tsx             — moved from src/app/page.tsx
    import/page.tsx      — moved, updated (new formats + cross-link)
    export/page.tsx      — moved, updated (new export cards + cross-link)
    collections/         — moved
    place/               — moved
    link-list/           — moved
    link-lists/          — moved
    resolve/             — moved
    transfer-packs/      — moved
    premium/             — moved
    settings/            — moved
    api/                 — moved
  convert/
    layout.tsx           — new: standalone MapSwitch-style layout
    page.tsx             — new: Quick Convert component
    convert.css          — new: MapSwitch theme variables (scoped)

src/lib/parsers/
  index.ts               — updated: add parseFile() + new re-exports
  geojson.ts             — new: GeoJSON parser
  kml.ts                 — new: KML + KMZ parser
  csv.ts                 — existing, unchanged
  takeout.ts             — existing, unchanged

src/lib/exporters/
  url.ts                 — new: shared URL generation for ParsedPlace
  kml.ts                 — new: KML export
  shortcut.ts            — new: Apple Shortcut export
  csv.ts                 — new: quick CSV export
  links.ts               — new: bulk link generation
  download.ts            — new: file download helper

src/types/index.ts       — updated: ImportRun.type union extended
```

## 6. Dependencies

- **No new npm dependencies.** GeoJSON is plain JSON parsing, KML uses built-in DOMParser, KMZ uses JSZip (already installed). Animations use CSS + tailwindcss-animate (already installed).

## 7. Testing Strategy

- **Parser unit tests:**
  - GeoJSON: valid FeatureCollection, bare array, standalone Feature, mixed geometry types (only Points extracted), invalid JSON, empty features
  - KML: valid with coordinates, missing coordinates, nested folders, missing name fallback, invalid XML
  - KMZ: DEFLATE-compressed archive, stored archive, no .kml file, corrupt archive
  - `parseFile()` auto-detection: route by extension, content-sniffing fallback for extensionless/ambiguous files
- **Exporter unit tests:**
  - KML: output validates as well-formed XML, XML escaping of special characters, places with/without coordinates
  - Shortcut: output validates as plist XML, URL generation correctness
  - CSV: proper escaping, column headers, target URL generation
  - Links: one URL per line, empty places handled
  - Round-trip: parse KML → export KML → parse again → same places
- **Integration test:** Quick Convert page — upload file → places displayed → export triggers download
