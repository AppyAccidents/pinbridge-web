import { generateAppleMapsUrlForPlace, generateGoogleMapsUrlForPlace } from '../url';

describe('generateAppleMapsUrlForPlace', () => {
  it('generates coordinate-based URL when lat/lng present', () => {
    const url = generateAppleMapsUrlForPlace({ title: 'Central Park', address: '', latitude: 40.7829, longitude: -73.9654 });
    expect(url).toContain('maps.apple.com/place');
    expect(url).toContain('coordinate=40.7829%2C-73.9654');
    expect(url).toContain('name=Central+Park');
  });

  it('generates search-based URL without coordinates', () => {
    const url = generateAppleMapsUrlForPlace({ title: 'Pizza Place', address: '123 Main St' });
    expect(url).toContain('maps.apple.com/search');
    expect(url).toContain('query=');
    expect(url).toContain('Pizza');
  });

  it('returns empty string with no useful data', () => {
    expect(generateAppleMapsUrlForPlace({ title: '', address: '' })).toBe('');
  });
});

describe('generateGoogleMapsUrlForPlace', () => {
  it('generates coordinate-based URL when lat/lng present', () => {
    const url = generateGoogleMapsUrlForPlace({ title: 'Central Park', address: '', latitude: 40.7829, longitude: -73.9654 });
    expect(url).toContain('google.com/maps/search');
    expect(url).toContain('query=40.7829,-73.9654');
  });

  it('generates search-based URL without coordinates', () => {
    const url = generateGoogleMapsUrlForPlace({ title: 'Pizza Place', address: '123 Main St' });
    expect(url).toContain('google.com/maps/search');
    expect(url).toContain('query=');
  });

  it('returns empty string with no useful data', () => {
    expect(generateGoogleMapsUrlForPlace({ title: '', address: '' })).toBe('');
  });
});
