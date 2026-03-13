'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { generateGoogleMapsUrl, generateAppleMapsUrl } from '@/lib/links';
import { usePlacesStore } from '@/stores/places';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowLeft, ExternalLink, Check, SkipForward, Trash2, MapPin } from 'lucide-react';
import type { Place } from '@/types';

export default function ResolvePage() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');

  const placesWithMissingCoords = useLiveQuery(
    () =>
      db.places
        .filter((p) => p.latitude === undefined || p.longitude === undefined)
        .toArray(),
    []
  );

  const { updatePlace, deletePlace } = usePlacesStore();

  const currentPlace = placesWithMissingCoords?.[currentIndex];
  const total = placesWithMissingCoords?.length ?? 0;
  const remaining = total - currentIndex;

  useEffect(() => {
    if (currentPlace) {
      setEditLat(currentPlace.latitude?.toString() ?? '');
      setEditLng(currentPlace.longitude?.toString() ?? '');
    }
  }, [currentPlace]);

  const handleSave = async () => {
    if (!currentPlace) return;

    const lat = parseFloat(editLat);
    const lng = parseFloat(editLng);

    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid coordinates');
      return;
    }

    await updatePlace(currentPlace.id, {
      latitude: lat,
      longitude: lng,
    });

    moveNext();
  };

  const handleSkip = () => {
    moveNext();
  };

  const handleDelete = async () => {
    if (!currentPlace) return;
    if (confirm('Delete this place?')) {
      await deletePlace(currentPlace.id);
      // Don't increment index since the list will shift
    }
  };

  const moveNext = () => {
    if (currentIndex < total - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (!placesWithMissingCoords) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (total === 0 || currentIndex >= total || !currentPlace) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold">Resolve Coordinates</h1>
        </div>

        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-8 text-center">
            <Check className="w-12 h-12 mx-auto text-green-600 mb-4" />
            <h2 className="text-xl font-bold text-green-800 mb-2">All Done!</h2>
            <p className="text-green-700 mb-4">
              All places now have coordinates.
            </p>
            <Button onClick={() => router.push('/')}>Back to Library</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Resolve Coordinates</h1>
          <p className="text-muted-foreground">{remaining} places remaining</p>
        </div>
      </div>

      {/* Progress */}
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((currentIndex) / total) * 100}%` }}
        />
      </div>

      {/* Current Place */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            {currentPlace.title}
          </CardTitle>
          <CardDescription>{currentPlace.address}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentPlace.sourceUrl && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Source URL</p>
              <a
                href={currentPlace.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline break-all"
              >
                {currentPlace.sourceUrl}
              </a>
            </div>
          )}

          {/* Look up buttons */}
          <div className="grid grid-cols-2 gap-3">
            <a
              href={generateGoogleMapsUrl({
                ...currentPlace,
                latitude: undefined,
                longitude: undefined,
              } as Place)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full">
                <ExternalLink className="w-4 h-4 mr-2" />
                Look up in Google
              </Button>
            </a>
            <a
              href={generateAppleMapsUrl({
                ...currentPlace,
                latitude: undefined,
                longitude: undefined,
              } as Place)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full">
                <ExternalLink className="w-4 h-4 mr-2" />
                Look up in Apple
              </Button>
            </a>
          </div>

          <p className="text-sm text-muted-foreground">
            Open the place in a maps app, find the coordinates, and enter them below.
          </p>

          {/* Coordinate inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Latitude</label>
              <input
                type="text"
                placeholder="e.g., 40.7128"
                value={editLat}
                onChange={(e) => setEditLat(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Longitude</label>
              <input
                type="text"
                placeholder="e.g., -74.0060"
                value={editLng}
                onChange={(e) => setEditLng(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Tip: In Google Maps, right-click on a location to copy coordinates. In Apple Maps, tap and hold to drop a pin and see coordinates.
          </p>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-3">
        <Button
          size="lg"
          onClick={handleSave}
          disabled={!editLat || !editLng}
          className="flex-col h-auto py-4"
        >
          <Check className="w-6 h-6 mb-1" />
          <span>Save</span>
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={handleSkip}
          className="flex-col h-auto py-4"
        >
          <SkipForward className="w-6 h-6 mb-1" />
          <span>Skip</span>
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={handleDelete}
          className="flex-col h-auto py-4 text-red-600 hover:text-red-700"
        >
          <Trash2 className="w-6 h-6 mb-1" />
          <span>Delete</span>
        </Button>
      </div>
    </div>
  );
}
