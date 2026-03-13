import JSZip from 'jszip';
import type { ParsedPlace, ImportError } from '@/types';
import { deriveListName } from './utils';

interface XmlElement {
  tag: string;
  content: string;
  children: XmlElement[];
}

/** Minimal XML parser that extracts elements by tag name from KML content. */
function parseXml(xml: string): XmlElement | null {
  // Strip XML declaration and comments
  const cleaned = xml
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  // Check for obvious parse failures
  if (!cleaned.startsWith('<')) {
    return null;
  }

  const root = parseElement(cleaned, 0);
  return root?.element ?? null;
}

function parseElement(
  xml: string,
  offset: number
): { element: XmlElement; end: number } | null {
  // Skip whitespace
  let i = offset;
  while (i < xml.length && /\s/.test(xml[i])) i++;

  if (i >= xml.length || xml[i] !== '<') return null;

  // Check it's not a closing tag
  if (xml[i + 1] === '/') return null;

  // Find tag name (ignoring namespace prefix)
  const tagMatch = xml.slice(i).match(/^<([a-zA-Z_][\w:.-]*)/);
  if (!tagMatch) return null;

  const rawTag = tagMatch[1];
  // Strip namespace prefix for easier matching
  const tag = rawTag.includes(':') ? rawTag.split(':').pop()! : rawTag;

  // Find end of opening tag
  let j = i + tagMatch[0].length;
  let selfClosing = false;

  // Skip attributes until we find > or />
  while (j < xml.length) {
    if (xml[j] === '/' && xml[j + 1] === '>') {
      selfClosing = true;
      j += 2;
      break;
    }
    if (xml[j] === '>') {
      j++;
      break;
    }
    j++;
  }

  if (selfClosing) {
    return { element: { tag, content: '', children: [] }, end: j };
  }

  const children: XmlElement[] = [];
  let textContent = '';

  // Parse children until closing tag
  while (j < xml.length) {
    // Skip whitespace
    while (j < xml.length && /\s/.test(xml[j])) {
      textContent += xml[j];
      j++;
    }

    if (j >= xml.length) break;

    // Check for closing tag
    const closeMatch = xml.slice(j).match(/^<\/([a-zA-Z_][\w:.-]*)\s*>/);
    if (closeMatch) {
      j += closeMatch[0].length;
      break;
    }

    // Check for child element
    if (xml[j] === '<') {
      const child = parseElement(xml, j);
      if (child) {
        children.push(child.element);
        j = child.end;
        textContent = '';
        continue;
      }
      // Skip malformed tag
      j++;
      continue;
    }

    // Text content
    textContent += xml[j];
    j++;
  }

  // Collapse whitespace in text content and decode entities
  const content = decodeEntities(textContent.trim());

  return { element: { tag, content, children }, end: j };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function findAll(element: XmlElement, tag: string): XmlElement[] {
  const results: XmlElement[] = [];
  for (const child of element.children) {
    if (child.tag === tag) {
      results.push(child);
    } else {
      // Search recursively in nested folders/documents
      results.push(...findAll(child, tag));
    }
  }
  return results;
}

function findFirst(element: XmlElement, tag: string): XmlElement | null {
  for (const child of element.children) {
    if (child.tag === tag) return child;
    const found = findFirst(child, tag);
    if (found) return found;
  }
  return null;
}

function getTextContent(element: XmlElement, tag: string): string {
  const found = findFirst(element, tag);
  return found?.content ?? '';
}

function isValidXml(xml: string): boolean {
  // Quick check: must contain at least one valid-looking tag
  return /<[a-zA-Z]/.test(xml) && !xml.includes('<<<');
}

export function parseKml(
  content: string,
  fileName: string
): { places: ParsedPlace[]; errors: ImportError[] } {
  try {
    if (!isValidXml(content)) {
      return { places: [], errors: [{ reason: 'Could not parse KML file.' }] };
    }

    const root = parseXml(content);
    if (!root) {
      return { places: [], errors: [{ reason: 'Could not parse KML file.' }] };
    }

    const listName = deriveListName(fileName);
    const places: ParsedPlace[] = [];

    // Find all Placemarks anywhere in the tree
    const placemarks = findAll(root, 'Placemark');

    for (const pm of placemarks) {
      const title = getTextContent(pm, 'name') || 'Unnamed Place';
      const description = getTextContent(pm, 'description');
      const address = getTextContent(pm, 'address');
      const coordsText = getTextContent(pm, 'coordinates').trim();

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
    }

    return { places, errors: [] };
  } catch {
    return { places: [], errors: [{ reason: 'Could not parse KML file.' }] };
  }
}

export async function parseKmz(
  file: File,
  fileName: string
): Promise<{ places: ParsedPlace[]; errors: ImportError[] }> {
  try {
    const buffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
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
