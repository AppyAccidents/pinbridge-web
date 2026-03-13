'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdNative } from '@/components/ads/ad-native';
import { Upload, Link as LinkIcon, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { parseTakeoutZip } from '@/lib/parsers/takeout';
import { parseCsv, getCsvTemplate } from '@/lib/parsers/csv';
import { parseMapUrl } from '@/lib/links';
import { usePlacesStore } from '@/stores/places';
import { adService } from '@/lib/services/ad-service';
import type { ImportResult, ParsedPlace } from '@/types';

export default function ImportPage() {
  const router = useRouter();

  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteError, setPasteError] = useState('');

  const { importPlaces, addPlace } = usePlacesStore();

  const handleTakeoutUpload = useCallback(
    async (file: File) => {
      setIsImporting(true);
      setImportResult(null);

      try {
        const { places, errors, collections } = await parseTakeoutZip(file);

        // Import places with their collection names
        const collectionMap = new Map<string, ParsedPlace[]>();
        for (const place of places) {
          const listName = place.listName || 'Imported';
          if (!collectionMap.has(listName)) {
            collectionMap.set(listName, []);
          }
          collectionMap.get(listName)!.push(place);
        }

        let totalResult: ImportResult = {
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

        setImportResult(totalResult);
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
    [importPlaces]
  );

  const handleCsvUpload = useCallback(
    async (file: File) => {
      setIsImporting(true);
      setImportResult(null);

      try {
        const { places, errors } = await parseCsv(file);
        const result = await importPlaces(places);
        result.errors.unshift(...errors);
        setImportResult(result);
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
    [importPlaces]
  );

  const handlePasteLink = useCallback(async () => {
    setPasteError('');

    if (!pasteUrl.trim()) {
      setPasteError('Please enter a URL');
      return;
    }

    const parsed = parseMapUrl(pasteUrl.trim());
    if (!parsed) {
      setPasteError('Unable to parse this URL. Please use an Apple Maps or Google Maps link.');
      return;
    }

    try {
      await addPlace({
        title: parsed.title || 'Unnamed Place',
        address: parsed.address || parsed.title || '',
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        tags: [],
        source: parsed.source || 'manual',
        sourceUrl: parsed.sourceUrl,
      });

      setPasteUrl('');
      setImportResult({
        success: true,
        importedCount: 1,
        skippedCount: 0,
        errors: [],
        missingCoordinatesCount: parsed.latitude === undefined ? 1 : 0,
        duplicateCandidatesCount: 0,
      });
    } catch (error) {
      setPasteError(error instanceof Error ? error.message : 'Failed to add place');
    }
  }, [pasteUrl, addPlace]);

  const downloadTemplate = () => {
    const csv = getCsvTemplate();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pinbridge-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import</h1>
        <p className="text-muted-foreground">Add places to your library</p>
      </div>

      {/* Import Result */}
      {importResult && (
        <Card className={importResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {importResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-medium">
                  {importResult.success
                    ? `Imported ${importResult.importedCount} places`
                    : 'Import failed'}
                </p>
                {importResult.skippedCount > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {importResult.skippedCount} skipped (duplicates or errors)
                  </p>
                )}
                {importResult.missingCoordinatesCount > 0 && (
                  <p className="text-sm text-amber-600">
                    {importResult.missingCoordinatesCount} places missing coordinates
                  </p>
                )}
                {importResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-sm cursor-pointer">
                      {importResult.errors.length} errors
                    </summary>
                    <ul className="mt-1 text-sm text-muted-foreground">
                      {importResult.errors.slice(0, 10).map((error, i) => (
                        <li key={i}>
                          {error.item && <strong>{error.item}: </strong>}
                          {error.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => router.push('/')}>
                    Review in Library
                  </Button>
                  {importResult.missingCoordinatesCount > 0 && (
                    <Button size="sm" variant="outline" onClick={() => router.push('/resolve')}>
                      Resolve coordinates
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Google Takeout */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Google Takeout
            </CardTitle>
            <CardDescription>Upload your Takeout ZIP or Saved CSVs</CardDescription>
          </CardHeader>
          <CardContent>
            <label className="block">
              <input
                type="file"
                accept=".zip,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.name.toLowerCase().endsWith('.zip')) {
                      handleTakeoutUpload(file);
                    } else {
                      handleCsvUpload(file);
                    }
                  }
                }}
                disabled={isImporting}
              />
              <Button variant="outline" className="w-full" disabled={isImporting} asChild>
                <span>
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    'Choose file'
                  )}
                </span>
              </Button>
            </label>
          </CardContent>
        </Card>

        {/* Paste Link */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />
              Paste Link
            </CardTitle>
            <CardDescription>Add a single Apple Maps or Google Maps URL</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="url"
              placeholder="https://maps.apple.com/... or https://google.com/maps/..."
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background text-sm"
            />
            {pasteError && <p className="text-sm text-red-600">{pasteError}</p>}
            <Button onClick={handlePasteLink} className="w-full">
              Add
            </Button>
          </CardContent>
        </Card>

        {/* CSV Import */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Import CSV
            </CardTitle>
            <CardDescription>Upload a CSV in PinBridge format</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block">
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCsvUpload(file);
                }}
                disabled={isImporting}
              />
              <Button variant="outline" className="w-full" disabled={isImporting} asChild>
                <span>Choose CSV file</span>
              </Button>
            </label>
            <Button variant="link" className="text-sm p-0 h-auto" onClick={downloadTemplate}>
              Download CSV template
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Native ad after import options */}
      {adService.shouldShowAds() && !adService.isPremiumUser() && (
        <div className="mt-6">
          <AdNative 
            placement={{
              id: 'import-native',
              type: 'native',
              size: 'responsive',
              position: 'content',
              priority: 6,
              minViewTime: 5,
              frequency: 'once-per-session',
              targetPages: ['/import'],
              excludePages: []
            }}
            variant="productivity"
          />
        </div>
      )}
    </div>
  );
}
