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
      title: 'Central Park', notes: 'A nice park', address: 'New York, NY',
      latitude: 40.7829, longitude: -73.9654, listName: 'places',
    });
    expect(result.places[1]).toMatchObject({ title: 'Eiffel Tower', latitude: 48.8584, longitude: 2.2945 });
  });

  it('handles Placemarks without coordinates', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document><Placemark><name>No Coords Place</name><address>Somewhere</address></Placemark></Document>
</kml>`;
    const result = parseKml(kml, 'nocoords.kml');
    expect(result.places).toHaveLength(1);
    expect(result.places[0].title).toBe('No Coords Place');
    expect(result.places[0].latitude).toBeUndefined();
  });

  it('handles nested Folder elements', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Folder><name>Restaurants</name>
      <Placemark><name>Pizza Place</name><Point><coordinates>10,20,0</coordinates></Point></Placemark>
    </Folder>
    <Folder><name>Hotels</name>
      <Placemark><name>Grand Hotel</name><Point><coordinates>30,40,0</coordinates></Point></Placemark>
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
  <Document><Placemark><Point><coordinates>1,2,0</coordinates></Point></Placemark></Document>
</kml>`;
    const result = parseKml(kml, 'noname.kml');
    expect(result.places[0].title).toBe('Unnamed Place');
  });

  it('returns error for invalid XML', () => {
    const result = parseKml('not xml at all <<<', 'bad.kml');
    expect(result.places).toHaveLength(0);
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
  <Document><Placemark><name>X</name><Point><coordinates>0,0,0</coordinates></Point></Placemark></Document>
</kml>`;
    expect(parseKml(kml, 'Saved Places.kml').places[0].listName).toBe('Favorites');
    expect(parseKml(kml, 'My Trip.kml').places[0].listName).toBe('My Trip');
  });

  it('handles coordinates without altitude', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document><Placemark><name>No Alt</name><Point><coordinates>-73.9654,40.7829</coordinates></Point></Placemark></Document>
</kml>`;
    const result = parseKml(kml, 'noalt.kml');
    expect(result.places[0].latitude).toBe(40.7829);
    expect(result.places[0].longitude).toBe(-73.9654);
  });
});
