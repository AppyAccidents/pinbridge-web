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
    const openUrlCount = (text.match(/is\.workflow\.actions\.openurl/g) || []).length;
    expect(openUrlCount).toBe(2);
  });

  it('XML-escapes URLs with special characters', async () => {
    const blob = exportToShortcut([{ title: 'A & B', latitude: 0, longitude: 0 }]);
    const text = await blob.text();
    expect(text).not.toContain('&B');
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
