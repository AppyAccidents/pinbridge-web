import type { PlaceLike } from './url';
import { generateAppleMapsUrlForPlace } from './url';

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function exportToShortcut(places: PlaceLike[]): Blob {
  const actions = places
    .map((place) => generateAppleMapsUrlForPlace(place))
    .filter(Boolean)
    .map((url) => `
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
      </dict>`).join('\n');

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
