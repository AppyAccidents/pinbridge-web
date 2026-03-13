# MapSwitch Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GeoJSON/KML/KMZ import, KML/Shortcut/bulk-link export, and a stateless Quick Convert page to PinBridge Web.

**Architecture:** New parsers and exporters as pure-function modules in `src/lib/`, a route group restructure to support a standalone `/convert` page outside AppShell, and extensions to existing `/import` and `/export` pages. All logic is shared between flows.

**Tech Stack:** Next.js 14, TypeScript, JSZip (existing), DOMParser (built-in), Tailwind CSS, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-14-mapswitch-integration-design.md`

---

## Chunk 1: Parsers

### Task 0: Shared Parser Utilities

**Files:**
- Create: `src/lib/parsers/utils.ts`

- [ ] **Step 1: Create shared parser utils**

Create `src/lib/parsers/utils.ts`:

```typescript
/**
 * Derive a list name from a filename.
 * Strips extension and normalizes "Saved Places" → "Favorites".
 */
export function deriveListName(fileName: string): string | undefined {
  if (!fileName) return undefined;
  return fileName
    .replace(/\.(csv|json|geojson|kml|kmz|txt|tsv)$/i, '')
    .replace(/^Saved Places?$/i, 'Favorites');
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add src/lib/parsers/utils.ts
git commit -m "feat: add shared parser utilities"
```

---

### Task 1: GeoJSON Parser

**Files:**
- Create: `src/lib/parsers/geojson.ts`
- Create: `src/lib/parsers/__tests__/geojson.test.ts`

- [ ] **Step 1: Write failing tests for GeoJSON parser**

Create `src/lib/parsers/__tests__/geojson.test.ts`:

```typescript
import { parseGeoJson } from '../geojson';

describe('parseGeoJson', () => {
  it('parses a valid FeatureCollection with Point features', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Central Park', address: 'New York, NY' },
          geometry: { type: 'Point', coordinates: [-73.9654, 40.7829] },
        },
        {
          type: 'Feature',
          properties: { title: 'Eiffel Tower', address: 'Paris, France', note: 'Must visit' },
          geometry: { type: 'Point', coordinates: [2.2945, 48.8584] },
        },
      ],
    });

    const result = parseGeoJson(geojson, 'places.geojson');
    expect(result.errors).toHaveLength(0);
    expect(result.places).toHaveLength(2);
    expect(result.places[0]).toMatchObject({
      title: 'Central Park',
      address: 'New York, NY',
      latitude: 40.7829,
      longitude: -73.9654,
      listName: 'places',
    });
    expect(result.places[1]).toMatchObject({
      title: 'Eiffel Tower',
      notes: 'Must visit',
      latitude: 48.8584,
      longitude: 2.2945,
    });
  });

  it('handles bare JSON array of features', () => {
    const geojson = JSON.stringify([
      {
        type: 'Feature',
        properties: { name: 'Place A' },
        geometry: { type: 'Point', coordinates: [10, 20] },
      },
    ]);

    const result = parseGeoJson(geojson, 'array.json');
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('Place A');
  });

  it('handles standalone Feature object', () => {
    const geojson = JSON.stringify({
      type: 'Feature',
      properties: { name: 'Solo Place' },
      geometry: { type: 'Point', coordinates: [5, 10] },
    });

    const result = parseGeoJson(geojson, 'single.geojson');
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('Solo Place');
  });

  it('skips non-Point geometry types', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'A Point' },
          geometry: { type: 'Point', coordinates: [1, 2] },
        },
        {
          type: 'Feature',
          properties: { name: 'A Line' },
          geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] },
        },
      ],
    });

    const result = parseGeoJson(geojson, 'mixed.geojson');
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('A Point');
  });

  it('extracts Google Maps URL fields', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Test',
            'Google Maps URL': 'https://maps.google.com/place/123',
            location: { address: '123 Main St' },
          },
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ],
    });

    const result = parseGeoJson(geojson, 'test.json');
    expect(result.places[0].sourceUrl).toBe('https://maps.google.com/place/123');
    expect(result.places[0].address).toBe('123 Main St');
  });

  it('falls back to "Unnamed Place" when no name/title', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { address: 'Somewhere' },
          geometry: { type: 'Point', coordinates: [1, 2] },
        },
      ],
    });

    const result = parseGeoJson(geojson, 'noname.json');
    expect(result.places[0].title).toBe('Unnamed Place');
  });

  it('returns error for invalid JSON', () => {
    const result = parseGeoJson('not json at all', 'bad.json');
    expect(result.places).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toBe('Invalid JSON file.');
  });

  it('returns error for unrecognized JSON structure', () => {
    const result = parseGeoJson(JSON.stringify({ foo: 'bar' }), 'weird.json');
    expect(result.places).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toBe('Not a recognized GeoJSON format.');
  });

  it('normalizes listName from filename', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'X' },
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ],
    });

    expect(parseGeoJson(geojson, 'Saved Places.geojson').places[0].listName).toBe('Favorites');
    expect(parseGeoJson(geojson, 'My Trip.json').places[0].listName).toBe('My Trip');
  });

  it('handles features with properties.list as listName', () => {
    const geojson = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'X', list: 'Restaurants' },
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ],
    });

    const result = parseGeoJson(geojson, 'whatever.json');
    expect(result.places[0].listName).toBe('Restaurants');
  });

  it('handles empty features array', () => {
    const geojson = JSON.stringify({ type: 'FeatureCollection', features: [] });
    const result = parseGeoJson(geojson, 'empty.geojson');
    expect(result.places).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/parsers/__tests__/geojson.test.ts`
Expected: FAIL — module `../geojson` not found

- [ ] **Step 3: Implement GeoJSON parser**

Create `src/lib/parsers/geojson.ts`:

```typescript
import type { ParsedPlace, ImportError } from '@/types';
import { deriveListName } from './utils';

/**
 * Parse GeoJSON content into ParsedPlace objects.
 * Supports FeatureCollection, bare Feature arrays, and standalone Feature objects.
 */
export function parseGeoJson(
  content: string,
  fileName: string
): { places: ParsedPlace[]; errors: ImportError[] } {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return { places: [], errors: [{ reason: 'Invalid JSON file.' }] };
  }

  // Normalize to FeatureCollection
  if (Array.isArray(data)) {
    data = { type: 'FeatureCollection', features: data };
  } else if (
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>).type === 'Feature'
  ) {
    data = { type: 'FeatureCollection', features: [data] };
  }

  const obj = data as Record<string, unknown>;
  if (obj.type !== 'FeatureCollection' || !Array.isArray(obj.features)) {
    return { places: [], errors: [{ reason: 'Not a recognized GeoJSON format.' }] };
  }

  const defaultListName = deriveListName(fileName);
  const places: ParsedPlace[] = [];

  for (const feature of obj.features as Record<string, unknown>[]) {
    const geometry = feature.geometry as Record<string, unknown> | undefined;
    if (!geometry || geometry.type !== 'Point') continue;

    const coords = geometry.coordinates as number[] | undefined;
    if (!coords || coords.length < 2) continue;

    const lng = coords[0];
    const lat = coords[1];

    const props = (feature.properties || {}) as Record<string, unknown>;
    const locationObj = props.location as Record<string, unknown> | undefined;

    const title =
      (props.name as string) ||
      (props.title as string) ||
      (props.Title as string) ||
      'Unnamed Place';

    const address =
      (props.address as string) ||
      (locationObj?.address as string) ||
      '';

    const notes =
      (props.note as string) ||
      (props.comment as string) ||
      (props.description as string) ||
      undefined;

    const sourceUrl =
      (props.url as string) ||
      (props.google_maps_url as string) ||
      (props['Google Maps URL'] as string) ||
      undefined;

    const listName = (props.list as string) || defaultListName;

    places.push({
      title,
      address,
      latitude: isFinite(lat) ? lat : undefined,
      longitude: isFinite(lng) ? lng : undefined,
      notes: notes || undefined,
      sourceUrl: sourceUrl || undefined,
      listName,
    });
  }

  return { places, errors: [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/parsers/__tests__/geojson.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add src/lib/parsers/geojson.ts src/lib/parsers/__tests__/geojson.test.ts
git commit -m "feat: add GeoJSON parser with tests"
```

---

### Task 2: KML Parser

**Files:**
- Create: `src/lib/parsers/kml.ts`
- Create: `src/lib/parsers/__tests__/kml.test.ts`

- [ ] **Step 1: Write failing tests for KML parser**

Create `src/lib/parsers/__tests__/kml.test.ts`:

```typescript
import { parseKml } from '../kml';

describe('parseKml', () => {
  it('parses valid KML with coordinates', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>My Places</name>
    <Placemark>
      <name>Central Park</name>
      <description>A nice park</description>
      <address>New York, NY</address>
      <Point><coordinates>-73.9654,40.7829,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>Eiffel Tower</name>
      <Point><coordinates>2.2945,48.8584,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

    const result = parseKml(kml, 'places.kml');
    expect(result.errors).toHaveLength(0);
    expect(result.places).toHaveLength(2);
    expect(result.places[0]).toMatchObject({
      title: 'Central Park',
      notes: 'A nice park',
      address: 'New York, NY',
      latitude: 40.7829,
      longitude: -73.9654,
      listName: 'places',
    });
    expect(result.places[1]).toMatchObject({
      title: 'Eiffel Tower',
      latitude: 48.8584,
      longitude: 2.2945,
    });
  });

  it('handles Placemarks without coordinates', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>No Coords Place</name>
      <address>Somewhere</address>
    </Placemark>
  </Document>
</kml>`;

    const result = parseKml(kml, 'nocoords.kml');
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('No Coords Place');
    expect(result.places[0].latitude).toBeUndefined();
    expect(result.places[0].longitude).toBeUndefined();
  });

  it('handles nested Folder elements', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Folder>
      <name>Restaurants</name>
      <Placemark>
        <name>Pizza Place</name>
        <Point><coordinates>10,20,0</coordinates></Point>
      </Placemark>
    </Folder>
    <Folder>
      <name>Hotels</name>
      <Placemark>
        <name>Grand Hotel</name>
        <Point><coordinates>30,40,0</coordinates></Point>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

    const result = parseKml(kml, 'nested.kml');
    expect(result.places).toHaveLength(2);
    expect(result.places[0].title).toBe('Pizza Place');
    expect(result.places[1].title).toBe('Grand Hotel');
  });

  it('falls back to "Unnamed Place" when name is missing', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <Point><coordinates>1,2,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

    const result = parseKml(kml, 'noname.kml');
    expect(result.places[0].title).toBe('Unnamed Place');
  });

  it('returns error for invalid XML', () => {
    const result = parseKml('not xml at all <<<', 'bad.kml');
    expect(result.places).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].reason).toBe('Could not parse KML file.');
  });

  it('handles KML with no Placemarks', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document><name>Empty</name></Document>
</kml>`;

    const result = parseKml(kml, 'empty.kml');
    expect(result.places).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('normalizes listName from filename', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark><name>X</name><Point><coordinates>0,0,0</coordinates></Point></Placemark>
  </Document>
</kml>`;

    expect(parseKml(kml, 'Saved Places.kml').places[0].listName).toBe('Favorites');
    expect(parseKml(kml, 'My Trip.kml').places[0].listName).toBe('My Trip');
  });

  it('handles coordinates without altitude', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>No Alt</name>
      <Point><coordinates>-73.9654,40.7829</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

    const result = parseKml(kml, 'noalt.kml');
    expect(result.places[0].latitude).toBe(40.7829);
    expect(result.places[0].longitude).toBe(-73.9654);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/parsers/__tests__/kml.test.ts`
Expected: FAIL — module `../kml` not found

- [ ] **Step 3: Implement KML and KMZ parsers**

Create `src/lib/parsers/kml.ts`:

```typescript
import JSZip from 'jszip';
import type { ParsedPlace, ImportError } from '@/types';
import { deriveListName } from './utils';

/**
 * Parse KML XML content into ParsedPlace objects.
 */
export function parseKml(
  content: string,
  fileName: string
): { places: ParsedPlace[]; errors: ImportError[] } {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'application/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return { places: [], errors: [{ reason: 'Could not parse KML file.' }] };
    }

    const placemarks = doc.querySelectorAll('Placemark');
    const listName = deriveListName(fileName);
    const places: ParsedPlace[] = [];

    placemarks.forEach((pm) => {
      const title = pm.querySelector('name')?.textContent?.trim() || 'Unnamed Place';
      const description = pm.querySelector('description')?.textContent?.trim() || '';
      const address = pm.querySelector('address')?.textContent?.trim() || '';
      const coordsText = pm.querySelector('coordinates')?.textContent?.trim() || '';

      let latitude: number | undefined;
      let longitude: number | undefined;

      if (coordsText) {
        const parts = coordsText.split(',').map(Number);
        if (parts.length >= 2 && isFinite(parts[0]) && isFinite(parts[1])) {
          longitude = parts[0];
          latitude = parts[1];
        }
      }

      places.push({
        title,
        address,
        latitude,
        longitude,
        notes: description || undefined,
        listName,
      });
    });

    return { places, errors: [] };
  } catch {
    return { places: [], errors: [{ reason: 'Could not parse KML file.' }] };
  }
}

/**
 * Parse a KMZ file (ZIP containing KML) into ParsedPlace objects.
 * Uses JSZip to handle all compression methods including DEFLATE.
 */
export async function parseKmz(
  file: File,
  fileName: string
): Promise<{ places: ParsedPlace[]; errors: ImportError[] }> {
  try {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    // Find the first .kml file in the archive
    let kmlContent: string | null = null;
    for (const [path, entry] of Object.entries(zip.files)) {
      if (path.toLowerCase().endsWith('.kml') && !entry.dir) {
        kmlContent = await entry.async('string');
        break;
      }
    }

    if (!kmlContent) {
      return { places: [], errors: [{ reason: 'No KML file found in KMZ archive' }] };
    }

    return parseKml(kmlContent, fileName);
  } catch {
    return { places: [], errors: [{ reason: 'Could not read KMZ file.' }] };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/parsers/__tests__/kml.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add src/lib/parsers/kml.ts src/lib/parsers/__tests__/kml.test.ts
git commit -m "feat: add KML and KMZ parsers with tests"
```

---

### Task 3: Unified parseFile Entry Point + Type Update

**Files:**
- Modify: `src/lib/parsers/index.ts`
- Modify: `src/types/index.ts`
- Create: `src/lib/parsers/__tests__/parse-file.test.ts`

- [ ] **Step 1: Write failing tests for parseFile**

Create `src/lib/parsers/__tests__/parse-file.test.ts`:

```typescript
import { parseFile } from '../index';

// Helper to create a File from content
function makeFile(content: string, name: string, type = ''): File {
  return new File([content], name, { type });
}

const sampleGeoJson = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Test Place' },
      geometry: { type: 'Point', coordinates: [10, 20] },
    },
  ],
});

const sampleKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>KML Place</name>
      <Point><coordinates>10,20,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

const sampleCsv = `title,address,latitude,longitude
Test Place,123 Main St,40.7128,-74.0060`;

describe('parseFile', () => {
  it('routes .geojson to GeoJSON parser', async () => {
    const file = makeFile(sampleGeoJson, 'places.geojson');
    const result = await parseFile(file);
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('Test Place');
  });

  it('routes .json to GeoJSON parser', async () => {
    const file = makeFile(sampleGeoJson, 'data.json');
    const result = await parseFile(file);
    expect(result.places).toHaveLength(1);
  });

  it('routes .kml to KML parser', async () => {
    const file = makeFile(sampleKml, 'places.kml');
    const result = await parseFile(file);
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('KML Place');
  });

  it('routes .csv to CSV parser', async () => {
    const file = makeFile(sampleCsv, 'places.csv');
    const result = await parseFile(file);
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('Test Place');
  });

  it('content-sniffs JSON when extension is unknown', async () => {
    const file = makeFile(sampleGeoJson, 'data.txt');
    // .txt goes to CSV first, but let's test explicit JSON content sniff
    const file2 = makeFile(sampleGeoJson, 'data.xyz');
    const result = await parseFile(file2);
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('Test Place');
  });

  it('content-sniffs XML when extension is unknown', async () => {
    const file = makeFile(sampleKml, 'data.xyz');
    const result = await parseFile(file);
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('KML Place');
  });

  it('falls back to CSV for unknown content', async () => {
    const file = makeFile(sampleCsv, 'data.xyz');
    const result = await parseFile(file);
    expect(result.places).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/parsers/__tests__/parse-file.test.ts`
Expected: FAIL — `parseFile` is not exported from `../index`

- [ ] **Step 3: Update ImportRun.type in types**

Modify `src/types/index.ts` — change line 59:

```typescript
// Before:
  type: 'takeout' | 'csv' | 'link';

// After:
  type: 'takeout' | 'csv' | 'link' | 'geojson' | 'kml' | 'kmz';
```

- [ ] **Step 4: Implement parseFile in parsers/index.ts**

Replace `src/lib/parsers/index.ts` with:

```typescript
export { parseCsv, exportToCsv, getCsvTemplate } from './csv';
export { parseTakeoutZip, parseTakeoutCsv } from './takeout';
export type { TakeoutParseResult } from './takeout';
export { parseGeoJson } from './geojson';
export { parseKml, parseKmz } from './kml';

import type { ParsedPlace, ImportError } from '@/types';
import { parseCsv } from './csv';
import { parseGeoJson } from './geojson';
import { parseKml, parseKmz } from './kml';

/**
 * Auto-detect file format and parse into places.
 * Routes by extension first, then content-sniffs as fallback.
 */
export async function parseFile(file: File): Promise<{
  places: ParsedPlace[];
  errors: ImportError[];
}> {
  const name = file.name.toLowerCase();

  // Route by extension
  if (name.endsWith('.kmz')) {
    return parseKmz(file, file.name);
  }
  if (name.endsWith('.json') || name.endsWith('.geojson')) {
    const text = await file.text();
    return parseGeoJson(text, file.name);
  }
  if (name.endsWith('.kml')) {
    const text = await file.text();
    return parseKml(text, file.name);
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    return parseCsv(file);
  }

  // Content-sniff fallback
  const text = await file.text();
  const trimmed = text.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseGeoJson(text, file.name);
  }
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<kml')) {
    return parseKml(text, file.name);
  }

  // Default to CSV
  return parseCsv(file);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/parsers/__tests__/parse-file.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 6: Run all parser tests together**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/parsers/__tests__/`
Expected: All tests PASS (GeoJSON + KML + parseFile)

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add src/lib/parsers/index.ts src/types/index.ts src/lib/parsers/__tests__/parse-file.test.ts
git commit -m "feat: add unified parseFile entry point and extend ImportRun.type"
```

---

## Chunk 2: Exporters

### Task 4: Shared URL Generation + Download Helper

**Files:**
- Create: `src/lib/exporters/url.ts`
- Create: `src/lib/exporters/download.ts`
- Create: `src/lib/exporters/__tests__/url.test.ts`

- [ ] **Step 1: Write failing tests for URL generation**

Create `src/lib/exporters/__tests__/url.test.ts`:

```typescript
import { generateAppleMapsUrlForPlace, generateGoogleMapsUrlForPlace } from '../url';

describe('generateAppleMapsUrlForPlace', () => {
  it('generates coordinate-based URL when lat/lng present', () => {
    const url = generateAppleMapsUrlForPlace({
      title: 'Central Park',
      address: '',
      latitude: 40.7829,
      longitude: -73.9654,
    });
    expect(url).toContain('maps.apple.com/place');
    expect(url).toContain('coordinate=40.7829%2C-73.9654');
    expect(url).toContain('name=Central+Park');
  });

  it('generates search-based URL without coordinates', () => {
    const url = generateAppleMapsUrlForPlace({
      title: 'Pizza Place',
      address: '123 Main St',
    });
    expect(url).toContain('maps.apple.com/search');
    expect(url).toContain('query=');
    expect(url).toContain('Pizza');
  });

  it('returns empty string with no useful data', () => {
    const url = generateAppleMapsUrlForPlace({ title: '', address: '' });
    expect(url).toBe('');
  });
});

describe('generateGoogleMapsUrlForPlace', () => {
  it('generates coordinate-based URL when lat/lng present', () => {
    const url = generateGoogleMapsUrlForPlace({
      title: 'Central Park',
      address: '',
      latitude: 40.7829,
      longitude: -73.9654,
    });
    expect(url).toContain('google.com/maps/search');
    expect(url).toContain('query=40.7829,-73.9654');
  });

  it('generates search-based URL without coordinates', () => {
    const url = generateGoogleMapsUrlForPlace({
      title: 'Pizza Place',
      address: '123 Main St',
    });
    expect(url).toContain('google.com/maps/search');
    expect(url).toContain('query=');
  });

  it('returns empty string with no useful data', () => {
    const url = generateGoogleMapsUrlForPlace({ title: '', address: '' });
    expect(url).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/exporters/__tests__/url.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement URL generation and download helper**

Create `src/lib/exporters/url.ts`:

```typescript
/**
 * PlaceLike type — accepts both ParsedPlace and Place fields.
 */
export type PlaceLike = {
  title?: string;
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  notes?: string;
  note?: string;
  sourceUrl?: string;
  url?: string;
};

/** Get the name from a PlaceLike, coalescing field variants. */
export function getPlaceName(place: PlaceLike): string {
  return place.title || place.name || '';
}

/** Get the address from a PlaceLike. */
export function getPlaceAddress(place: PlaceLike): string {
  return place.address || '';
}

/** Get latitude from a PlaceLike. */
export function getPlaceLat(place: PlaceLike): number | undefined {
  const lat = place.latitude ?? place.lat;
  return lat != null && isFinite(lat) ? lat : undefined;
}

/** Get longitude from a PlaceLike. */
export function getPlaceLng(place: PlaceLike): number | undefined {
  const lng = place.longitude ?? place.lng;
  return lng != null && isFinite(lng) ? lng : undefined;
}

/** Get notes from a PlaceLike. */
export function getPlaceNotes(place: PlaceLike): string {
  return place.notes || place.note || '';
}

/** Get source URL from a PlaceLike. */
export function getPlaceSourceUrl(place: PlaceLike): string {
  return place.sourceUrl || place.url || '';
}

/**
 * Build a display query string from name + address.
 */
function buildQuery(place: PlaceLike): string {
  const parts: string[] = [];
  const name = getPlaceName(place);
  const address = getPlaceAddress(place);
  if (name) parts.push(name);
  if (address && address !== name) parts.push(address);
  return parts.join(', ');
}

/**
 * Generate Apple Maps URL (MapSwitch-style /place?coordinate= format).
 */
export function generateAppleMapsUrlForPlace(place: PlaceLike): string {
  const lat = getPlaceLat(place);
  const lng = getPlaceLng(place);

  if (lat != null && lng != null) {
    const params = new URLSearchParams();
    params.set('coordinate', `${lat},${lng}`);
    const name = getPlaceName(place);
    if (name) params.set('name', name);
    return `https://maps.apple.com/place?${params.toString()}`;
  }

  const query = buildQuery(place);
  if (!query) return '';
  return `https://maps.apple.com/search?query=${encodeURIComponent(query)}`;
}

/**
 * Generate Google Maps URL.
 */
export function generateGoogleMapsUrlForPlace(place: PlaceLike): string {
  const lat = getPlaceLat(place);
  const lng = getPlaceLng(place);

  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  const query = buildQuery(place);
  if (!query) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
```

Create `src/lib/exporters/download.ts`:

```typescript
/**
 * Download a Blob as a file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/exporters/__tests__/url.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add src/lib/exporters/url.ts src/lib/exporters/download.ts src/lib/exporters/__tests__/url.test.ts
git commit -m "feat: add exporter URL generation and download helper"
```

---

### Task 5: KML Exporter

**Files:**
- Create: `src/lib/exporters/kml.ts`
- Create: `src/lib/exporters/__tests__/kml.test.ts`

- [ ] **Step 1: Write failing tests for KML export**

Create `src/lib/exporters/__tests__/kml.test.ts`:

```typescript
import { exportToKml } from '../kml';

describe('exportToKml', () => {
  it('generates valid KML for places with coordinates', async () => {
    const blob = exportToKml(
      [
        { title: 'Park', address: '123 St', latitude: 40.78, longitude: -73.96, notes: 'Nice' },
        { title: 'Tower', latitude: 48.85, longitude: 2.29 },
      ],
      'My Export'
    );

    expect(blob.type).toBe('application/vnd.google-earth.kml+xml');
    const text = await blob.text();
    expect(text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(text).toContain('<name>My Export</name>');
    expect(text).toContain('<name>Park</name>');
    expect(text).toContain('<coordinates>-73.96,40.78,0</coordinates>');
    expect(text).toContain('<address>123 St</address>');
    expect(text).toContain('<description>123 St — Nice</description>');
    expect(text).toContain('<name>Tower</name>');
    expect(text).toContain('<coordinates>2.29,48.85,0</coordinates>');
  });

  it('omits coordinate/address/description elements when empty', async () => {
    const blob = exportToKml([{ title: 'Bare Place' }], 'Test');
    const text = await blob.text();
    expect(text).toContain('<name>Bare Place</name>');
    expect(text).not.toContain('<Point>');
    expect(text).not.toContain('<address>');
    expect(text).not.toContain('<description>');
  });

  it('XML-escapes special characters', async () => {
    const blob = exportToKml(
      [{ title: 'A & B <place>', address: '"Quoted"', latitude: 0, longitude: 0 }],
      'Escape & Test'
    );
    const text = await blob.text();
    expect(text).toContain('A &amp; B &lt;place&gt;');
    expect(text).toContain('&quot;Quoted&quot;');
    expect(text).toContain('Escape &amp; Test');
  });

  it('handles PlaceLike with name/lat/lng fields (MapSwitch compat)', async () => {
    const blob = exportToKml(
      [{ name: 'MapSwitch Place', lat: 10, lng: 20 } as any],
      'Compat'
    );
    const text = await blob.text();
    expect(text).toContain('<name>MapSwitch Place</name>');
    expect(text).toContain('<coordinates>20,10,0</coordinates>');
  });

  it('round-trips with KML parser', async () => {
    const { parseKml } = await import('../../parsers/kml');
    const original = [
      { title: 'Place A', address: 'Addr A', latitude: 10, longitude: 20, notes: 'Note A' },
      { title: 'Place B', latitude: 30, longitude: 40 },
    ];

    const blob = exportToKml(original, 'RoundTrip');
    const kmlText = await blob.text();
    const parsed = parseKml(kmlText, 'roundtrip.kml');

    expect(parsed.places).toHaveLength(2);
    expect(parsed.places[0].title).toBe('Place A');
    expect(parsed.places[0].latitude).toBe(10);
    expect(parsed.places[0].longitude).toBe(20);
    expect(parsed.places[1].title).toBe('Place B');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/exporters/__tests__/kml.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement KML exporter**

Create `src/lib/exporters/kml.ts`:

```typescript
import type { PlaceLike } from './url';
import { getPlaceName, getPlaceAddress, getPlaceLat, getPlaceLng, getPlaceNotes } from './url';

/** XML-escape a string. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Export places to KML format for Google My Maps import.
 */
export function exportToKml(places: PlaceLike[], documentName: string): Blob {
  const placemarks = places
    .map((place) => {
      const name = getPlaceName(place) || 'Unnamed Place';
      const address = getPlaceAddress(place);
      const notes = getPlaceNotes(place);
      const lat = getPlaceLat(place);
      const lng = getPlaceLng(place);

      const descParts: string[] = [];
      if (address) descParts.push(address);
      if (notes) descParts.push(notes);
      const description = descParts.join(' — ');

      const hasCoords = lat != null && lng != null;

      return `    <Placemark>
      <name>${escapeXml(name)}</name>${
        description
          ? `\n      <description>${escapeXml(description)}</description>`
          : ''
      }${
        address
          ? `\n      <address>${escapeXml(address)}</address>`
          : ''
      }${
        hasCoords
          ? `\n      <Point><coordinates>${lng},${lat},0</coordinates></Point>`
          : ''
      }
    </Placemark>`;
    })
    .join('\n');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(documentName)}</name>
${placemarks}
  </Document>
</kml>`;

  return new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/exporters/__tests__/kml.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add src/lib/exporters/kml.ts src/lib/exporters/__tests__/kml.test.ts
git commit -m "feat: add KML exporter with round-trip test"
```

---

### Task 6: Apple Shortcut Exporter

**Files:**
- Create: `src/lib/exporters/shortcut.ts`
- Create: `src/lib/exporters/__tests__/shortcut.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/exporters/__tests__/shortcut.test.ts`:

```typescript
import { exportToShortcut } from '../shortcut';

describe('exportToShortcut', () => {
  it('generates a valid plist with openurl actions', async () => {
    const blob = exportToShortcut([
      { title: 'Park', latitude: 40.78, longitude: -73.96 },
      { title: 'Tower', address: 'Paris' },
    ]);

    expect(blob.type).toBe('application/x-apple-shortcut');
    const text = await blob.text();
    expect(text).toContain('<!DOCTYPE plist');
    expect(text).toContain('is.workflow.actions.openurl');
    expect(text).toContain('is.workflow.actions.waitfornavigation');
    expect(text).toContain('maps.apple.com');
    // Should have 2 openurl actions (one per place)
    const openUrlCount = (text.match(/is\.workflow\.actions\.openurl/g) || []).length;
    expect(openUrlCount).toBe(2);
  });

  it('XML-escapes URLs with special characters', async () => {
    const blob = exportToShortcut([{ title: 'A & B', latitude: 0, longitude: 0 }]);
    const text = await blob.text();
    // URL params are URL-encoded, and the whole thing is XML-escaped
    expect(text).not.toContain('&B'); // should be escaped
    expect(text).toContain('maps.apple.com');
  });

  it('skips places with no usable data', async () => {
    const blob = exportToShortcut([
      { title: 'Good', latitude: 10, longitude: 20 },
      { title: '', address: '' },
    ]);
    const text = await blob.text();
    const openUrlCount = (text.match(/is\.workflow\.actions\.openurl/g) || []).length;
    expect(openUrlCount).toBe(1);
  });

  it('returns a Blob even for empty input', async () => {
    const blob = exportToShortcut([]);
    expect(blob.type).toBe('application/x-apple-shortcut');
    const text = await blob.text();
    expect(text).toContain('WFWorkflowActions');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/exporters/__tests__/shortcut.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Apple Shortcut exporter**

Create `src/lib/exporters/shortcut.ts`:

```typescript
import type { PlaceLike } from './url';
import { generateAppleMapsUrlForPlace } from './url';

/** XML-escape a string for plist. */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Export places as an Apple Shortcut (.shortcut) plist file.
 * Each place becomes an openurl + waitfornavigation action pair.
 */
export function exportToShortcut(places: PlaceLike[]): Blob {
  const actions = places
    .map((place) => generateAppleMapsUrlForPlace(place))
    .filter(Boolean)
    .map(
      (url) => `
      <dict>
        <key>WFWorkflowActionIdentifier</key>
        <string>is.workflow.actions.openurl</string>
        <key>WFWorkflowActionParameters</key>
        <dict>
          <key>WFInput</key>
          <dict>
            <key>Value</key>
            <dict>
              <key>attachmentsByRange</key>
              <dict/>
              <key>string</key>
              <string>${escapeXml(url)}</string>
            </dict>
            <key>WFSerializationType</key>
            <string>WFTextTokenString</string>
          </dict>
        </dict>
      </dict>
      <dict>
        <key>WFWorkflowActionIdentifier</key>
        <string>is.workflow.actions.waitfornavigation</string>
        <key>WFWorkflowActionParameters</key>
        <dict>
          <key>WFDelay</key>
          <integer>2</integer>
        </dict>
      </dict>`
    )
    .join('\n');

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>WFWorkflowActions</key>
  <array>
    ${actions}
  </array>
  <key>WFWorkflowClientVersion</key>
  <string>2605.0.5</string>
  <key>WFWorkflowHasShortcutInputVariables</key>
  <false/>
  <key>WFWorkflowImportQuestions</key>
  <array/>
  <key>WFWorkflowInputContentItemClasses</key>
  <array/>
  <key>WFWorkflowMinimumClientVersion</key>
  <integer>900</integer>
  <key>WFWorkflowMinimumClientVersionString</key>
  <string>900</string>
  <key>WFWorkflowOutputContentItemClasses</key>
  <array/>
  <key>WFWorkflowTypes</key>
  <array>
    <string>NCWidget</string>
    <string>WatchKit</string>
  </array>
  <key>WFWorkflowName</key>
  <string>PinBridge Import</string>
</dict>
</plist>`;

  return new Blob([plist], { type: 'application/x-apple-shortcut' });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/exporters/__tests__/shortcut.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add src/lib/exporters/shortcut.ts src/lib/exporters/__tests__/shortcut.test.ts
git commit -m "feat: add Apple Shortcut exporter with tests"
```

---

### Task 7: Quick CSV Exporter + Bulk Links

**Files:**
- Create: `src/lib/exporters/csv.ts`
- Create: `src/lib/exporters/links.ts`
- Create: `src/lib/exporters/__tests__/csv-links.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/exporters/__tests__/csv-links.test.ts`:

```typescript
import { exportQuickCsv } from '../csv';
import { generateBulkLinks } from '../links';

describe('exportQuickCsv', () => {
  it('generates CSV with correct headers and data', async () => {
    const blob = exportQuickCsv(
      [
        { title: 'Park', address: '123 St', latitude: 40.78, longitude: -73.96, notes: 'Nice' },
        { title: 'Tower', address: 'Paris', notes: undefined },
      ],
      'apple'
    );

    expect(blob.type).toBe('text/csv');
    const text = await blob.text();
    const lines = text.split('\n');
    expect(lines[0]).toBe('Name,Address,Latitude,Longitude,Original URL,Apple Maps URL,Note');
    expect(lines[1]).toContain('Park');
    expect(lines[1]).toContain('40.78');
    expect(lines[1]).toContain('maps.apple.com');
  });

  it('escapes CSV special characters', async () => {
    const blob = exportQuickCsv(
      [{ title: 'A, "B"', address: 'Line1\nLine2', latitude: 0, longitude: 0 }],
      'google'
    );
    const text = await blob.text();
    // Title with comma and quotes should be wrapped in quotes with escaped inner quotes
    expect(text).toContain('"A, ""B"""');
  });

  it('uses Google Maps URL when target is google', async () => {
    const blob = exportQuickCsv(
      [{ title: 'X', latitude: 10, longitude: 20 }],
      'google'
    );
    const text = await blob.text();
    const lines = text.split('\n');
    expect(lines[0]).toContain('Google Maps URL');
    expect(lines[1]).toContain('google.com/maps');
  });
});

describe('generateBulkLinks', () => {
  it('generates one URL per line for apple target', () => {
    const links = generateBulkLinks(
      [
        { title: 'A', latitude: 10, longitude: 20 },
        { title: 'B', latitude: 30, longitude: 40 },
      ],
      'apple'
    );
    const lines = links.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('maps.apple.com');
    expect(lines[1]).toContain('maps.apple.com');
  });

  it('generates Google URLs for google target', () => {
    const links = generateBulkLinks(
      [{ title: 'A', latitude: 10, longitude: 20 }],
      'google'
    );
    expect(links).toContain('google.com/maps');
  });

  it('skips places with no usable data', () => {
    const links = generateBulkLinks(
      [
        { title: 'Good', latitude: 10, longitude: 20 },
        { title: '', address: '' },
      ],
      'apple'
    );
    const lines = links.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
  });

  it('returns empty string for empty input', () => {
    expect(generateBulkLinks([], 'apple')).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/exporters/__tests__/csv-links.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Quick CSV exporter**

Create `src/lib/exporters/csv.ts`:

```typescript
import type { PlaceLike } from './url';
import {
  getPlaceName,
  getPlaceAddress,
  getPlaceLat,
  getPlaceLng,
  getPlaceNotes,
  getPlaceSourceUrl,
  generateAppleMapsUrlForPlace,
  generateGoogleMapsUrlForPlace,
} from './url';

/** CSV-escape a value. */
function escapeCsv(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Export places to a lightweight CSV (no IDs, timestamps, or collections).
 */
export function exportQuickCsv(
  places: PlaceLike[],
  target: 'apple' | 'google'
): Blob {
  const urlLabel = target === 'apple' ? 'Apple Maps URL' : 'Google Maps URL';
  const generateUrl =
    target === 'apple' ? generateAppleMapsUrlForPlace : generateGoogleMapsUrlForPlace;

  const header = `Name,Address,Latitude,Longitude,Original URL,${urlLabel},Note`;
  const rows = places.map((place) => {
    const lat = getPlaceLat(place);
    const lng = getPlaceLng(place);
    return [
      escapeCsv(getPlaceName(place)),
      escapeCsv(getPlaceAddress(place)),
      lat ?? '',
      lng ?? '',
      escapeCsv(getPlaceSourceUrl(place)),
      escapeCsv(generateUrl(place)),
      escapeCsv(getPlaceNotes(place)),
    ].join(',');
  });

  const csv = [header, ...rows].join('\n');
  return new Blob([csv], { type: 'text/csv' });
}
```

- [ ] **Step 4: Implement Bulk Links generator**

Create `src/lib/exporters/links.ts`:

```typescript
import type { PlaceLike } from './url';
import { generateAppleMapsUrlForPlace, generateGoogleMapsUrlForPlace } from './url';

/**
 * Generate all place URLs joined by newlines for clipboard copy.
 */
export function generateBulkLinks(
  places: PlaceLike[],
  target: 'apple' | 'google'
): string {
  const generateUrl =
    target === 'apple' ? generateAppleMapsUrlForPlace : generateGoogleMapsUrlForPlace;

  return places
    .map((place) => generateUrl(place))
    .filter(Boolean)
    .join('\n');
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/exporters/__tests__/csv-links.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 6: Run all exporter tests**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test -- src/lib/exporters/__tests__/`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add src/lib/exporters/csv.ts src/lib/exporters/links.ts src/lib/exporters/__tests__/csv-links.test.ts
git commit -m "feat: add quick CSV exporter and bulk link generator"
```

---

## Chunk 3: Route Group Restructure

### Task 8: Move Existing Pages into (main) Route Group

This is a structural move — no logic changes. The goal is to separate AppShell-wrapped routes from the standalone `/convert` page.

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/(main)/layout.tsx`
- Move: all existing pages/dirs into `src/app/(main)/`

- [ ] **Step 1: Create the (main) route group layout**

Create `src/app/(main)/layout.tsx`:

```typescript
import { AppShell } from '@/components/shared/app-shell';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 2: Update root layout to remove AppShell**

Modify `src/app/layout.tsx` — remove the AppShell import and wrapper. The layout becomes:

```typescript
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import Script from 'next/script';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PinBridge - Transfer Places Between Maps',
  description: 'Move your saved places between Apple Maps and Google Maps',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#3b82f6',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Google AdSense */}
        <Script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        {/* Google Analytics for ad performance tracking */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');
          `}
        </Script>
      </head>
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Move all existing pages into (main) route group**

Run the following commands to move files. Route groups `(main)` don't affect URL paths.

```bash
cd ~/Documents/GitHub/pinbridge-web/src/app
mkdir -p "(main)"
# Move page.tsx and all route directories EXCEPT api/
# api/ stays at src/app/api/ because API routes should not be wrapped in the AppShell client layout
mv page.tsx "(main)/"
mv import "(main)/"
mv export "(main)/"
mv collections "(main)/"
mv place "(main)/"
mv link-list "(main)/"
mv link-lists "(main)/"
mv resolve "(main)/"
mv transfer-packs "(main)/"
mv premium "(main)/"
mv settings "(main)/"
```

- [ ] **Step 4: Verify the app still builds**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun run type-check`
Expected: No errors. All imports should still resolve since `@/` paths are unchanged.

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add -A src/app/
git commit -m "refactor: move existing routes into (main) route group for layout separation"
```

---

## Chunk 4: Quick Convert Page

### Task 9: Convert Page Layout + CSS

**Files:**
- Create: `src/app/convert/layout.tsx`
- Create: `src/app/convert/convert.css`

- [ ] **Step 1: Create MapSwitch theme CSS**

Create `src/app/convert/convert.css`:

```css
.convert-theme {
  --background: 210 15% 8%;
  --foreground: 40 10% 92%;
  --card: 210 12% 10%;
  --card-foreground: 40 10% 92%;
  --border: 210 8% 18%;
  --primary: 192 70% 45%;
  --primary-foreground: 0 0% 99%;
  --secondary: 210 8% 18%;
  --secondary-foreground: 40 10% 92%;
  --muted: 210 6% 20%;
  --muted-foreground: 210 6% 55%;
  --accent: 192 12% 18%;
  --accent-foreground: 40 10% 92%;
  --destructive: 0 72% 48%;
  --destructive-foreground: 0 0% 99%;
  --input: 210 6% 28%;
  --ring: 192 70% 45%;
  --radius: 0.625rem;
}

.convert-theme.light {
  --background: 40 20% 97%;
  --foreground: 210 20% 12%;
  --card: 40 18% 98%;
  --card-foreground: 210 20% 12%;
  --border: 40 10% 88%;
  --primary: 192 85% 30%;
  --primary-foreground: 0 0% 99%;
  --secondary: 40 12% 92%;
  --secondary-foreground: 210 20% 12%;
  --muted: 40 10% 93%;
  --muted-foreground: 210 8% 46%;
  --accent: 192 20% 92%;
  --accent-foreground: 210 20% 12%;
  --input: 40 8% 78%;
  --ring: 192 85% 30%;
}

/* Spring-like easing for animations */
@keyframes convert-fade-in-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes convert-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.convert-animate-in {
  animation: convert-fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.convert-animate-fade {
  animation: convert-fade-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.convert-stagger-1 { animation-delay: 0.05s; }
.convert-stagger-2 { animation-delay: 0.1s; }
.convert-stagger-3 { animation-delay: 0.15s; }
.convert-stagger-4 { animation-delay: 0.2s; }
```

- [ ] **Step 2: Create convert layout**

Create `src/app/convert/layout.tsx`:

```typescript
import type { Metadata } from 'next';
import './convert.css';

export const metadata: Metadata = {
  title: 'Quick Convert - PinBridge',
  description: 'Convert saved places between Google Maps and Apple Maps instantly',
};

export default function ConvertLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add src/app/convert/layout.tsx src/app/convert/convert.css
git commit -m "feat: add Quick Convert layout and MapSwitch theme CSS"
```

---

### Task 10: Quick Convert Page Component

**Files:**
- Create: `src/app/convert/page.tsx`

- [ ] **Step 1: Create the Quick Convert page**

Create `src/app/convert/page.tsx`:

```typescript
'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { parseFile } from '@/lib/parsers';
import { exportToKml } from '@/lib/exporters/kml';
import { exportToShortcut } from '@/lib/exporters/shortcut';
import { exportQuickCsv } from '@/lib/exporters/csv';
import { generateBulkLinks } from '@/lib/exporters/links';
import { generateAppleMapsUrlForPlace, generateGoogleMapsUrlForPlace } from '@/lib/exporters/url';
import { downloadBlob } from '@/lib/exporters/download';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import type { ParsedPlace } from '@/types';
import {
  Upload,
  ArrowRightLeft,
  X,
  ExternalLink,
  ClipboardCopy,
  Check,
  FileSpreadsheet,
  Map,
  Smartphone,
  ChevronDown,
  Sun,
  Moon,
  Trash2,
  Info,
} from 'lucide-react';

interface ConvertPlace extends ParsedPlace {
  id: string;
  source?: string;
}

export default function ConvertPage() {
  const [places, setPlaces] = useState<ConvertPlace[]>([]);
  const [detectedSource, setDetectedSource] = useState<'apple' | 'google' | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showExportHelp, setShowExportHelp] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const target = detectedSource === 'apple' ? 'google' : 'apple';
  const targetLabel = target === 'apple' ? 'Apple Maps' : 'Google Maps';
  const hasPlaces = places.length > 0;
  const coordCount = places.filter((p) => p.latitude != null).length;

  const generateUrl = useCallback(
    (place: ConvertPlace) =>
      target === 'apple'
        ? generateAppleMapsUrlForPlace(place)
        : generateGoogleMapsUrlForPlace(place),
    [target]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;
      setIsProcessing(true);
      setProgress(0);

      const allPlaces: ConvertPlace[] = [];
      const allErrors: string[] = [];
      let source: 'apple' | 'google' = 'google';

      for (let i = 0; i < files.length; i++) {
        setProgress(Math.round(((i + 0.5) / files.length) * 100));
        try {
          const result = await parseFile(files[i]);
          const converted: ConvertPlace[] = result.places.map((p) => ({
            ...p,
            id: crypto.randomUUID(),
            source: p.sourceUrl?.includes('apple') ? 'apple' : 'google',
          }));
          allPlaces.push(...converted);
          allErrors.push(...result.errors.map((e) => e.reason));

          if (converted.some((p) => p.source === 'apple')) {
            source = 'apple';
          }
        } catch (err) {
          allErrors.push(`${files[i].name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      setProgress(100);

      if (allPlaces.length > 0) {
        setPlaces((prev) => [...prev, ...allPlaces]);
        setDetectedSource(source);
        const withCoords = allPlaces.filter((p) => p.latitude != null).length;
        toast({
          title: 'Import complete',
          description: withCoords > 0
            ? `${allPlaces.length} places loaded (${withCoords} with precise coordinates).`
            : `${allPlaces.length} places loaded.`,
        });
      } else if (allErrors.length > 0) {
        toast({ title: 'Import failed', description: allErrors[0], variant: 'destructive' });
      }

      setTimeout(() => setIsProcessing(false), 400);
    },
    [toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleClearAll = useCallback(() => {
    setPlaces([]);
    setDetectedSource(null);
    setShowExportHelp(false);
  }, []);

  const handleExportCsv = useCallback(() => {
    const blob = exportQuickCsv(places, target);
    downloadBlob(blob, `pinbridge-${target}-maps.csv`);
    toast({ title: 'CSV exported', description: `${places.length} places saved.` });
  }, [places, target, toast]);

  const handleExportKml = useCallback(() => {
    const docName = places[0]?.listName || 'PinBridge Import';
    const blob = exportToKml(places, docName);
    downloadBlob(blob, `pinbridge-${docName.replace(/\s+/g, '-').toLowerCase()}.kml`);
    toast({ title: 'KML exported', description: `${places.length} places ready for Google My Maps.` });
  }, [places, toast]);

  const handleExportShortcut = useCallback(() => {
    const blob = exportToShortcut(places);
    downloadBlob(blob, 'PinBridge Import.shortcut');
    toast({
      title: 'Shortcut downloaded',
      description: 'Open the file on your iPhone/iPad to add it to Shortcuts.',
    });
  }, [places, toast]);

  const handleCopyAllLinks = useCallback(() => {
    const links = generateBulkLinks(places, target);
    navigator.clipboard.writeText(links);
    toast({ title: 'Copied', description: `${places.length} links copied to clipboard.` });
  }, [places, target, toast]);

  return (
    <div
      className={`convert-theme ${theme === 'light' ? 'light' : ''} min-h-screen flex flex-col`}
      style={{
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
      }}
    >
      {/* Header */}
      <header
        className="border-b sticky top-0 z-50 backdrop-blur-md convert-animate-in"
        style={{
          borderColor: 'hsl(var(--border) / 0.6)',
          backgroundColor: 'hsl(var(--card) / 0.8)',
        }}
      >
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'hsl(var(--primary))' }}
            >
              <ArrowRightLeft className="w-4 h-4" style={{ color: 'hsl(var(--primary-foreground))' }} />
            </div>
            <span className="font-semibold text-base tracking-tight">PinBridge</span>
            <span
              className="text-[10px] tracking-wide uppercase px-2 py-0.5 rounded"
              style={{
                opacity: 0.6,
                backgroundColor: 'hsl(var(--muted))',
              }}
            >
              AppyAccidents 2026
            </span>
          </div>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-md transition-colors"
            style={{ color: 'hsl(var(--muted-foreground))' }}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-10">
        {hasPlaces ? (
          /* ===== RESULTS STATE ===== */
          <div className="space-y-6">
            {/* Summary bar */}
            <div className="convert-animate-in flex items-center gap-2.5 flex-wrap">
              <span className="text-sm font-semibold">{places.length} places</span>
              {coordCount > 0 && (
                <span
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
                >
                  {coordCount} with coordinates
                </span>
              )}
              <button
                onClick={handleClearAll}
                className="ml-auto flex items-center gap-1 text-xs transition-colors"
                style={{ color: 'hsl(var(--destructive))' }}
              >
                <Trash2 className="w-3 h-3" />
                Clear all
              </button>
            </div>

            {/* Place list */}
            <div className="space-y-2 convert-animate-in convert-stagger-1">
              {places.map((place) => {
                const url = generateUrl(place);
                return (
                  <Card
                    key={place.id}
                    className="border"
                    style={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                    }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{place.title}</span>
                            {place.listName && (
                              <span
                                className="text-[10px] shrink-0 px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: 'hsl(var(--muted))',
                                  opacity: 0.6,
                                }}
                              >
                                {place.listName}
                              </span>
                            )}
                          </div>
                          {place.latitude != null && place.longitude != null && (
                            <p
                              className="text-[10px] tabular-nums"
                              style={{ color: 'hsl(var(--muted-foreground) / 0.5)' }}
                            >
                              {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
                            </p>
                          )}
                          {place.address && (
                            <p
                              className="text-xs truncate"
                              style={{ color: 'hsl(var(--muted-foreground))' }}
                            >
                              {place.address}
                            </p>
                          )}
                          {place.notes && (
                            <p
                              className="text-xs truncate"
                              style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}
                            >
                              {place.notes}
                            </p>
                          )}
                          <div className="flex items-center gap-2 pt-0.5">
                            {url && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs inline-flex items-center gap-1 transition-colors"
                                style={{ color: 'hsl(var(--primary))' }}
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                Open in {targetLabel}
                              </a>
                            )}
                            {url && (
                              <button
                                onClick={() => handleCopy(url, place.id)}
                                className="text-xs inline-flex items-center gap-1 transition-colors"
                                style={{ color: 'hsl(var(--muted-foreground))' }}
                              >
                                {copiedId === place.id ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <ClipboardCopy className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDelete(place.id)}
                          className="p-1 rounded transition-colors shrink-0"
                          style={{ color: 'hsl(var(--muted-foreground))' }}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Export panel */}
            <div className="convert-animate-in convert-stagger-2">
              <Card
                style={{
                  backgroundColor: 'hsl(var(--card))',
                  borderColor: 'hsl(var(--border))',
                }}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">Export & Save</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={handleExportCsv}
                      className="justify-start gap-2.5 h-auto py-3"
                    >
                      <FileSpreadsheet className="w-4 h-4 shrink-0" />
                      <div className="text-left">
                        <div className="text-sm font-medium">Download CSV</div>
                        <div className="text-xs opacity-70">Spreadsheet format</div>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleExportKml}
                      className="justify-start gap-2.5 h-auto py-3"
                    >
                      <Map className="w-4 h-4 shrink-0" />
                      <div className="text-left">
                        <div className="text-sm font-medium">Download KML</div>
                        <div className="text-xs opacity-70">Import into Google My Maps</div>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleExportShortcut}
                      className="justify-start gap-2.5 h-auto py-3"
                    >
                      <Smartphone className="w-4 h-4 shrink-0" />
                      <div className="text-left">
                        <div className="text-sm font-medium">Apple Shortcut</div>
                        <div className="text-xs opacity-70">Opens each place on iPhone</div>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCopyAllLinks}
                      className="justify-start gap-2.5 h-auto py-3"
                    >
                      <ClipboardCopy className="w-4 h-4 shrink-0" />
                      <div className="text-left">
                        <div className="text-sm font-medium">Copy All Links</div>
                        <div className="text-xs opacity-70">{targetLabel} links to clipboard</div>
                      </div>
                    </Button>
                  </div>

                  {/* Export help collapsible */}
                  <button
                    onClick={() => setShowExportHelp(!showExportHelp)}
                    className="w-full flex items-center justify-between text-xs px-3 py-2 rounded transition-colors"
                    style={{
                      color: 'hsl(var(--muted-foreground))',
                      backgroundColor: 'hsl(var(--muted) / 0.5)',
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      How to add all pins to a guide or list
                    </span>
                    <ChevronDown
                      className="w-3.5 h-3.5 transition-transform"
                      style={{ transform: showExportHelp ? 'rotate(180deg)' : undefined }}
                    />
                  </button>
                  {showExportHelp && (
                    <div
                      className="rounded-lg p-4 space-y-3 text-xs"
                      style={{
                        backgroundColor: 'hsl(var(--muted) / 0.5)',
                        color: 'hsl(var(--muted-foreground))',
                      }}
                    >
                      <div>
                        <p className="font-semibold text-xs mb-1" style={{ color: 'hsl(var(--foreground) / 0.7)' }}>
                          Apple Maps Guide
                        </p>
                        <ol className="space-y-1.5 list-decimal ml-4 leading-relaxed">
                          <li>Download the Apple Shortcut above and open it on your iPhone</li>
                          <li>Run the Shortcut — it opens each place in Apple Maps</li>
                          <li>For each place, tap the share icon and &ldquo;Add to Guide&rdquo;</li>
                        </ol>
                      </div>
                      <div>
                        <p className="font-semibold text-xs mb-1" style={{ color: 'hsl(var(--foreground) / 0.7)' }}>
                          Google My Maps (batch import)
                        </p>
                        <ol className="space-y-1.5 list-decimal ml-4 leading-relaxed">
                          <li>Download the KML file above</li>
                          <li>
                            Go to{' '}
                            <a
                              href="https://www.google.com/mymaps"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2 transition-colors"
                              style={{ color: 'hsl(var(--primary))' }}
                            >
                              Google My Maps
                            </a>{' '}
                            and create a new map
                          </li>
                          <li>Click &ldquo;Import&rdquo; in the left panel and upload the KML file</li>
                          <li>All places appear as pins on your map</li>
                        </ol>
                        <p className="text-[10px] mt-1" style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}>
                          Works with CSV too — My Maps supports both formats.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Footer note */}
            <div
              className="text-xs text-center py-2 convert-animate-in convert-stagger-3"
              style={{ color: 'hsl(var(--muted-foreground))' }}
            >
              Import all your places as a collection into Apple Maps or Google Maps.
              <br />
              <Link href="/import" className="underline underline-offset-2 transition-colors" style={{ color: 'hsl(var(--primary))' }}>
                Want to save to your library? Use full Import
              </Link>
            </div>
          </div>
        ) : (
          /* ===== EMPTY STATE ===== */
          <div className="space-y-8 text-center">
            <div className="convert-animate-in">
              <h1 className="text-xl font-bold tracking-tight">Move your saved places</h1>
              <p
                className="text-sm mt-2 max-w-sm mx-auto leading-relaxed"
                style={{ color: 'hsl(var(--muted-foreground))' }}
              >
                Drop a Google Takeout file and get Apple Maps links instantly. Works with CSV, GeoJSON,
                KML, and KMZ.
              </p>
            </div>

            {/* Drop zone */}
            <div className="convert-animate-in convert-stagger-1">
              <div
                className="rounded-xl border-2 border-dashed p-8 sm:p-12 cursor-pointer transition-colors"
                style={{
                  borderColor: isDragOver ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  backgroundColor: isDragOver ? 'hsl(var(--primary) / 0.05)' : undefined,
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".csv,.json,.geojson,.kml,.kmz,.tsv,.txt"
                  multiple
                  onChange={(e) => handleFiles(e.target.files)}
                />
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="text-sm font-medium">Processing...</div>
                    <Progress value={progress} className="w-48" />
                    <div
                      className="text-xs"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                    >
                      {progress}%
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: 'hsl(var(--primary) / 0.1)' }}
                    >
                      <Upload className="w-6 h-6" style={{ color: 'hsl(var(--primary))' }} />
                    </div>
                    <div className="space-y-1.5 text-center">
                      <p className="text-sm font-semibold">Drop files here or click to browse</p>
                      <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        CSV, GeoJSON, KML, KMZ — format is auto-detected
                      </p>
                    </div>
                  </div>
                )}

                {/* Collapsible instructions */}
                <div
                  className="mt-6 pt-4"
                  style={{ borderTop: '1px dashed hsl(var(--border) / 0.5)' }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowInstructions(!showInstructions);
                    }}
                    className="w-full flex items-center justify-between text-xs"
                    style={{ color: 'hsl(var(--muted-foreground))' }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0" />
                      How to get your Google Maps data
                    </span>
                    <ChevronDown
                      className="w-3.5 h-3.5 transition-transform"
                      style={{ transform: showInstructions ? 'rotate(180deg)' : undefined }}
                    />
                  </button>
                  {showInstructions && (
                    <ol
                      className="mt-3 ml-5 space-y-2 text-xs list-decimal pb-2 leading-relaxed text-left"
                      style={{ color: 'hsl(var(--muted-foreground))' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <li>
                        Go to{' '}
                        <a
                          href="https://takeout.google.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2"
                          style={{ color: 'hsl(var(--primary))' }}
                        >
                          Google Takeout
                        </a>
                        , then select only <strong>Maps (your places)</strong>
                      </li>
                      <li>Export as .zip, download, and unzip</li>
                      <li>Drop the CSV files from the Saved folder here</li>
                    </ol>
                  )}
                </div>
              </div>
            </div>

            {/* Decorative icons */}
            <div className="convert-animate-in convert-stagger-2 flex items-center justify-center gap-4">
              <svg className="w-6 h-6" style={{ color: 'hsl(var(--muted-foreground) / 0.4)' }} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 1.5a8.5 8.5 0 0 1 8.5 8.5c0 .55-.06 1.09-.15 1.62H12v-3.25h4.84A4.98 4.98 0 0 0 12 7.5a4.5 4.5 0 1 0 0 9c1.58 0 2.97-.82 3.76-2.06l2.54 1.53A8.47 8.47 0 0 1 12 20.5 8.5 8.5 0 0 1 3.5 12 8.5 8.5 0 0 1 12 3.5z" />
              </svg>
              <ArrowRightLeft className="w-5 h-5" style={{ color: 'hsl(var(--muted-foreground) / 0.3)' }} />
              <svg className="w-6 h-6" style={{ color: 'hsl(var(--muted-foreground) / 0.4)' }} viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
            </div>
            <p className="text-xs convert-animate-in convert-stagger-3" style={{ color: 'hsl(var(--muted-foreground) / 0.7)' }}>
              Format auto-detected. Coordinates extracted when available.
            </p>

            {/* Cross-link */}
            <p className="text-xs convert-animate-fade convert-stagger-4" style={{ color: 'hsl(var(--muted-foreground) / 0.5)' }}>
              Want to save places permanently?{' '}
              <Link href="/import" className="underline underline-offset-2" style={{ color: 'hsl(var(--primary) / 0.7)' }}>
                Use full Import
              </Link>
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        className="py-6 convert-animate-fade convert-stagger-4"
        style={{ borderTop: '1px solid hsl(var(--border) / 0.5)' }}
      >
        <div className="max-w-2xl mx-auto px-4 sm:px-6 flex flex-col items-center gap-2 text-center">
          <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}>
            An{' '}
            <span className="font-medium" style={{ color: 'hsl(var(--primary) / 0.7)' }}>
              AppyAccidents
            </span>{' '}
            2026 project
          </p>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders (type-check)**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun run type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add src/app/convert/page.tsx
git commit -m "feat: add Quick Convert page with MapSwitch-style UI"
```

---

## Chunk 5: Extend Existing Pages

### Task 11: Update Import Page

**Files:**
- Modify: `src/app/(main)/import/page.tsx`

- [ ] **Step 1: Update the import page to support new formats**

In `src/app/(main)/import/page.tsx`, make these changes:

1. Add `parseFile` import:
   ```typescript
   import { parseFile } from '@/lib/parsers';
   ```

2. Replace the `handleTakeoutUpload` + `handleCsvUpload` dual handler with a unified `handleFileUpload`:

   After the existing `const { importPlaces, addPlace } = usePlacesStore();` line, add a shared helper and replace both `handleTakeoutUpload` and `handleCsvUpload` with a unified handler:

   ```typescript
   // Shared helper: group places by listName, import each group as a collection
   const importByCollection = useCallback(
     async (
       places: ParsedPlace[],
       errors: ImportError[]
     ): Promise<ImportResult> => {
       const collectionMap = new Map<string, ParsedPlace[]>();
       for (const place of places) {
         const listName = place.listName || 'Imported';
         if (!collectionMap.has(listName)) collectionMap.set(listName, []);
         collectionMap.get(listName)!.push(place);
       }

       const totalResult: ImportResult = {
         success: true,
         importedCount: 0,
         skippedCount: 0,
         errors: [...errors],
         missingCoordinatesCount: 0,
         duplicateCandidatesCount: 0,
       };

       for (const [collectionName, collectionPlaces] of Array.from(collectionMap.entries())) {
         const result = await importPlaces(collectionPlaces, collectionName);
         totalResult.importedCount += result.importedCount;
         totalResult.skippedCount += result.skippedCount;
         totalResult.errors.push(...result.errors);
         totalResult.missingCoordinatesCount += result.missingCoordinatesCount;
         totalResult.duplicateCandidatesCount += result.duplicateCandidatesCount;
       }

       return totalResult;
     },
     [importPlaces]
   );

   const handleFileUpload = useCallback(
     async (file: File) => {
       setIsImporting(true);
       setImportResult(null);

       try {
         const name = file.name.toLowerCase();

         let places: ParsedPlace[];
         let errors: ImportError[];

         if (name.endsWith('.zip')) {
           // ZIP files use the Takeout-specific parser (handles folder structure)
           const result = await parseTakeoutZip(file);
           places = result.places;
           errors = result.errors;
         } else {
           // All other formats use the unified parser
           const result = await parseFile(file);
           places = result.places;
           errors = result.errors;
         }

         setImportResult(await importByCollection(places, errors));
       } catch (error) {
         setImportResult({
           success: false,
           importedCount: 0,
           skippedCount: 0,
           errors: [{ reason: error instanceof Error ? error.message : 'Unknown error' }],
           missingCoordinatesCount: 0,
           duplicateCandidatesCount: 0,
         });
       } finally {
         setIsImporting(false);
       }
     },
     [importByCollection]
   );
   ```

   Add `ImportError` to the type imports: `import type { ImportResult, ParsedPlace, ImportError } from '@/types';`

3. Update the Google Takeout card's file input accept attribute:
   ```
   accept=".zip,.csv,.json,.geojson,.kml,.kmz"
   ```
   And update its onChange to call `handleFileUpload(file)` for all file types.

4. Update the card description to: `"Upload your Takeout ZIP, CSV, GeoJSON, KML, or KMZ"`

5. Update the CSV import card's accept to also handle new formats, or merge both cards into one (the Takeout card already handles CSV).

6. Add a cross-link after the cards grid:
   ```tsx
   <p className="text-sm text-muted-foreground text-center mt-4">
     Just need a quick conversion?{' '}
     <Link href="/convert" className="text-primary hover:underline">
       Try Quick Convert
     </Link>
   </p>
   ```

   Add `import Link from 'next/link';` at the top.

- [ ] **Step 2: Verify type-check passes**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun run type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add src/app/\(main\)/import/page.tsx
git commit -m "feat: extend import page with GeoJSON, KML, KMZ support"
```

---

### Task 12: Update Export Page

**Files:**
- Modify: `src/app/(main)/export/page.tsx`

- [ ] **Step 1: Add new export cards to the export page**

In `src/app/(main)/export/page.tsx`, add these imports:

```typescript
import Link from 'next/link';
import { exportToKml } from '@/lib/exporters/kml';
import { exportToShortcut } from '@/lib/exporters/shortcut';
import { generateBulkLinks } from '@/lib/exporters/links';
import { downloadBlob } from '@/lib/exporters/download';
import { Map, Smartphone, ClipboardCopy } from 'lucide-react';
```

Add state for link target:
```typescript
const [linkTarget, setLinkTarget] = useState<'apple' | 'google'>('apple');
const [copied, setCopied] = useState(false);
```

Add handler functions after `handleExportCsv`:

```typescript
const handleExportKml = () => {
  if (!places) return;
  let placesToExport = places;
  if (selectedCollectionId !== 'all' && placeCollections) {
    const memberPlaceIds = new Set(
      placeCollections.filter((pc) => pc.collectionId === selectedCollectionId).map((pc) => pc.placeId)
    );
    placesToExport = places.filter((p) => memberPlaceIds.has(p.id));
  }
  const docName = selectedCollectionId !== 'all'
    ? collections?.find((c) => c.id === selectedCollectionId)?.name || 'PinBridge Export'
    : 'PinBridge Export';
  const blob = exportToKml(placesToExport, docName);
  downloadBlob(blob, `pinbridge-${docName.replace(/\s+/g, '-').toLowerCase()}.kml`);
};

const handleExportShortcut = () => {
  if (!places) return;
  let placesToExport = places;
  if (selectedCollectionId !== 'all' && placeCollections) {
    const memberPlaceIds = new Set(
      placeCollections.filter((pc) => pc.collectionId === selectedCollectionId).map((pc) => pc.placeId)
    );
    placesToExport = places.filter((p) => memberPlaceIds.has(p.id));
  }
  const blob = exportToShortcut(placesToExport);
  downloadBlob(blob, 'PinBridge Import.shortcut');
};

const handleCopyAllLinks = () => {
  if (!places) return;
  let placesToExport = places;
  if (selectedCollectionId !== 'all' && placeCollections) {
    const memberPlaceIds = new Set(
      placeCollections.filter((pc) => pc.collectionId === selectedCollectionId).map((pc) => pc.placeId)
    );
    placesToExport = places.filter((p) => memberPlaceIds.has(p.id));
  }
  const links = generateBulkLinks(placesToExport, linkTarget);
  navigator.clipboard.writeText(links);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};
```

Add three new Card sections after the CSV export card and before the Link List card:

**KML Export Card:**
```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Map className="w-5 h-5" />
      Export KML
    </CardTitle>
    <CardDescription>
      Download a KML file for import into Google My Maps
    </CardDescription>
  </CardHeader>
  <CardContent>
    <Button onClick={handleExportKml} disabled={!places || places.length === 0}>
      <Download className="w-4 h-4 mr-2" />
      Download KML
    </Button>
  </CardContent>
</Card>
```

**Apple Shortcut Card:**
```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <Smartphone className="w-5 h-5" />
      Apple Shortcut
    </CardTitle>
    <CardDescription>
      Download a Shortcut that opens each place in Apple Maps on your iPhone
    </CardDescription>
  </CardHeader>
  <CardContent>
    <Button onClick={handleExportShortcut} disabled={!places || places.length === 0}>
      <Download className="w-4 h-4 mr-2" />
      Download Shortcut
    </Button>
  </CardContent>
</Card>
```

**Copy All Links Card:**
```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2">
      <ClipboardCopy className="w-5 h-5" />
      Copy All Links
    </CardTitle>
    <CardDescription>
      Copy Apple Maps or Google Maps links for all places to clipboard
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-3">
    <div className="flex gap-2">
      <Button
        variant={linkTarget === 'apple' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setLinkTarget('apple')}
      >
        Apple Maps
      </Button>
      <Button
        variant={linkTarget === 'google' ? 'default' : 'outline'}
        size="sm"
        onClick={() => setLinkTarget('google')}
      >
        Google Maps
      </Button>
    </div>
    <Button onClick={handleCopyAllLinks} disabled={!places || places.length === 0}>
      <ClipboardCopy className="w-4 h-4 mr-2" />
      {copied ? 'Copied!' : 'Copy to Clipboard'}
    </Button>
  </CardContent>
</Card>
```

Add cross-link at the bottom (after the "no places" card):
```tsx
<p className="text-sm text-muted-foreground text-center">
  Just need a quick conversion?{' '}
  <Link href="/convert" className="text-primary hover:underline">
    Try Quick Convert
  </Link>
</p>
```

- [ ] **Step 2: Verify type-check passes**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun run type-check`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/GitHub/pinbridge-web
git add src/app/\(main\)/export/page.tsx
git commit -m "feat: add KML, Apple Shortcut, and bulk copy exports to export page"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Run all tests**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun test`
Expected: All tests PASS

- [ ] **Step 2: Run type-check**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun run type-check`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun lint`
Expected: No errors (fix any that appear)

- [ ] **Step 4: Build the app**

Run: `cd ~/Documents/GitHub/pinbridge-web && bun build`
Expected: Build succeeds. Verify `/convert` route is included in the output.
