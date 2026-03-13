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
    expect(text).toContain('"A, ""B"""');
  });

  it('uses Google Maps URL when target is google', async () => {
    const blob = exportQuickCsv([{ title: 'X', latitude: 10, longitude: 20 }], 'google');
    const text = await blob.text();
    expect(text.split('\n')[0]).toContain('Google Maps URL');
    expect(text.split('\n')[1]).toContain('google.com/maps');
  });
});

describe('generateBulkLinks', () => {
  it('generates one URL per line for apple target', () => {
    const links = generateBulkLinks(
      [{ title: 'A', latitude: 10, longitude: 20 }, { title: 'B', latitude: 30, longitude: 40 }],
      'apple'
    );
    const lines = links.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('maps.apple.com');
  });

  it('generates Google URLs for google target', () => {
    const links = generateBulkLinks([{ title: 'A', latitude: 10, longitude: 20 }], 'google');
    expect(links).toContain('google.com/maps');
  });

  it('skips places with no usable data', () => {
    const links = generateBulkLinks(
      [{ title: 'Good', latitude: 10, longitude: 20 }, { title: '', address: '' }],
      'apple'
    );
    expect(links.split('\n').filter(Boolean)).toHaveLength(1);
  });

  it('returns empty string for empty input', () => {
    expect(generateBulkLinks([], 'apple')).toBe('');
  });
});
