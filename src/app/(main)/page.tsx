'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdNative } from '@/components/ads/ad-native';
import {
  Search,
  MapPin,
  AlertCircle,
  ArrowRightLeft,
  Import,
  ExternalLink,
  FolderOpen,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adService } from '@/lib/services/ad-service';
import type { Place, Collection } from '@/types';

export default function LibraryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMissingCoords, setFilterMissingCoords] = useState(false);

  const places = useLiveQuery(() => db.places.toArray(), []);
  const collections = useLiveQuery(() => db.collections.toArray(), []);
  const placeCount = places?.length ?? 0;
  const missingCoordsCount =
    places?.filter((p) => p.latitude === undefined || p.longitude === undefined).length ?? 0;

  // Filter places
  const filteredPlaces =
    places?.filter((place) => {
      if (filterMissingCoords && place.latitude !== undefined && place.longitude !== undefined) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          place.title.toLowerCase().includes(query) ||
          place.address.toLowerCase().includes(query) ||
          place.tags.some((t) => t.toLowerCase().includes(query))
        );
      }
      return true;
    }) ?? [];

  // Show onboarding if no places
  if (places && places.length === 0) {
    return <OnboardingView />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Library</h1>
          <p className="text-muted-foreground">
            {placeCount} places
            {missingCoordsCount > 0 && (
              <span className="text-amber-600"> ({missingCoordsCount} missing coordinates)</span>
            )}
          </p>
        </div>
        <Link href="/transfer-packs/new">
          <Button>
            <ArrowRightLeft className="w-4 h-4 mr-2" />
            New Transfer Pack
          </Button>
        </Link>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search places..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-md bg-background"
          />
        </div>
        <Button
          variant={filterMissingCoords ? 'default' : 'outline'}
          onClick={() => setFilterMissingCoords(!filterMissingCoords)}
          className="whitespace-nowrap"
        >
          <AlertCircle className="w-4 h-4 mr-2" />
          Missing coords ({missingCoordsCount})
        </Button>
      </div>

      {/* Collections sidebar would go here on desktop */}
      <div className="flex flex-wrap gap-2">
        {collections?.map((collection) => (
          <Link key={collection.id} href={`/collections/${collection.id}`}>
            <Button variant="outline" size="sm">
              <FolderOpen className="w-4 h-4 mr-1" />
              {collection.name}
            </Button>
          </Link>
        ))}
      </div>

      {/* Places list */}
      <div className="space-y-2">
        {filteredPlaces.map((place, index) => (
          <div key={place.id}>
            <PlaceRow place={place} />
            {/* Show native ad after every 5th place */}
            {(index + 1) % 5 === 0 && adService.shouldShowAds() && !adService.isPremiumUser() && (
              <div className="mt-2">
                <AdNative 
                  placement={{
                    id: 'library-native',
                    type: 'native',
                    size: 'responsive',
                    position: 'content',
                    priority: 6,
                    minViewTime: 5,
                    frequency: 'once-per-session',
                    targetPages: ['/'],
                    excludePages: []
                  }}
                  variant="travel"
                  className="mb-2"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredPlaces.length === 0 && places && places.length > 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No places match your filters.</p>
          <Button
            variant="link"
            onClick={() => {
              setSearchQuery('');
              setFilterMissingCoords(false);
            }}
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}

function PlaceRow({ place }: { place: Place }) {
  const hasCoords = place.latitude !== undefined && place.longitude !== undefined;

  return (
    <Link href={`/place/${place.id}`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium truncate">{place.title}</h3>
                {!hasCoords && (
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">{place.address}</p>
              {place.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {place.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                  {place.tags.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{place.tags.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'px-2 py-1 text-xs rounded',
                  place.source === 'google'
                    ? 'bg-blue-100 text-blue-700'
                    : place.source === 'apple'
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-green-100 text-green-700'
                )}
              >
                {place.source}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function OnboardingView() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-6">
        <ArrowRightLeft className="w-8 h-8 text-primary-foreground" />
      </div>
      <h1 className="text-3xl font-bold mb-3">Move your saved places between maps apps</h1>
      <p className="text-muted-foreground max-w-md mb-8">
        Import your Google Takeout saved lists, then create transfer packs to open and save each
        place in your target app.
      </p>

      <div className="space-y-4 w-full max-w-sm">
        <Link href="/import?mode=takeout" className="block">
          <Button size="lg" className="w-full">
            <Import className="w-5 h-5 mr-2" />
            Import Google Takeout
          </Button>
        </Link>
        <Link href="/import" className="block">
          <Button variant="outline" size="lg" className="w-full">
            Paste a link or Import CSV
          </Button>
        </Link>
      </div>

      <details className="mt-8 text-left max-w-md">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
          Why isn&apos;t this automatic sync?
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Neither Apple Maps nor Google Maps provide public APIs to add places to your saved lists.
          PinBridge creates &quot;open in app&quot; links so you can manually save each place. This
          is a guided migration, not automatic syncing.
        </p>
      </details>

      {/* Native ad for onboarding users */}
      {adService.shouldShowAds() && !adService.isPremiumUser() && (
        <div className="mt-8 max-w-md">
          <AdNative 
            placement={{
              id: 'onboarding-native',
              type: 'native',
              size: 'responsive',
              position: 'content',
              priority: 7,
              minViewTime: 3,
              frequency: 'once-per-session',
              targetPages: ['/'],
              excludePages: []
            }}
            variant="travel"
          />
        </div>
      )}
    </div>
  );
}
