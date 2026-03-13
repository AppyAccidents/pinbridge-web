'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { exportToCsv } from '@/lib/parsers/csv';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, FileSpreadsheet, Link as LinkIcon } from 'lucide-react';
import type { Collection } from '@/types';

export default function ExportPage() {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | 'all'>('all');
  const router = useRouter();

  const places = useLiveQuery(() => db.places.toArray(), []);
  const collections = useLiveQuery(() => db.collections.toArray(), []);
  const placeCollections = useLiveQuery(() => db.placeCollections.toArray(), []);

  const handleCreateLinkList = () => {
    // Navigate to link list creation page
    router.push('/link-list/create');
  };

  const handleExportCsv = async () => {
    if (!places || !placeCollections || !collections) return;

    // Build collection names map
    const collectionNameMap = new Map(collections.map((c) => [c.id, c.name]));
    const placeCollectionsMap = new Map<string, string[]>();

    for (const pc of placeCollections) {
      if (!placeCollectionsMap.has(pc.placeId)) {
        placeCollectionsMap.set(pc.placeId, []);
      }
      const name = collectionNameMap.get(pc.collectionId);
      if (name) {
        placeCollectionsMap.get(pc.placeId)!.push(name);
      }
    }

    // Filter places if a collection is selected
    let placesToExport = places;
    if (selectedCollectionId !== 'all') {
      const memberPlaceIds = new Set(
        placeCollections.filter((pc) => pc.collectionId === selectedCollectionId).map((pc) => pc.placeId)
      );
      placesToExport = places.filter((p) => memberPlaceIds.has(p.id));
    }

    const csv = exportToCsv(placesToExport, placeCollectionsMap);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pinbridge-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Export</h1>
        <p className="text-muted-foreground">Backup your places or use in other apps</p>
      </div>

      {/* Scope Selection */}
      <Card>
        <CardHeader>
          <CardTitle>What to Export</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="w-full px-3 py-2 border rounded-md bg-background"
            value={selectedCollectionId}
            onChange={(e) => setSelectedCollectionId(e.target.value)}
          >
            <option value="all">Entire Library ({places?.length ?? 0} places)</option>
            {collections?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* CSV Export */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Export CSV
          </CardTitle>
          <CardDescription>
            Download a CSV file that can be imported back into PinBridge or used in other apps
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExportCsv} disabled={!places || places.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Download CSV
          </Button>
          <p className="text-sm text-muted-foreground mt-2">
            Includes: title, address, coordinates, tags, collections, notes, source URL
          </p>
        </CardContent>
      </Card>

      {/* Link List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="w-5 h-5" />
            Link List
          </CardTitle>
          <CardDescription>
            Create a shareable page with clickable links to your places - perfect for mobile access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Generate QR codes for easy sharing. For guided transfer workflows with progress tracking, use{' '}
            <a href="/transfer-packs/new" className="text-primary hover:underline">
              Transfer Packs
            </a>{' '}
            instead. View all your{' '}
            <a href="/link-lists" className="text-primary hover:underline">
              Link Lists
            </a>.
          </p>
          <Button 
            onClick={handleCreateLinkList}
            disabled={!places || places.length === 0}
          >
            <LinkIcon className="w-4 h-4 mr-2" />
            Create Link List
          </Button>
        </CardContent>
      </Card>

      {places && places.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>No places to export. Import some places first!</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
