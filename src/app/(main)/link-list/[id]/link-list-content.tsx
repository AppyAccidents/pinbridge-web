'use client';

import { useState, useEffect } from 'react';
import { ReadonlyURLSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { linkListService } from '@/lib/services/link-list';
import { urlService } from '@/lib/services/url';
import { linkListCache, cacheUtils } from '@/lib/services/cache';
import { LazyPlaceList } from '@/components/shared/lazy-place-list';
import { LazyQRCode } from '@/components/shared/lazy-qr-code';
import { PerformanceMonitor } from '@/components/shared/performance-monitor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Share2, QrCode, MapPin, Calendar, Wifi, WifiOff } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { Place, LinkList } from '@/types';

interface LinkListPageContentProps {
  linkListId: string;
  searchParams: ReadonlyURLSearchParams;
}

export function LinkListPageContent({ linkListId, searchParams }: LinkListPageContentProps) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [linkList, setLinkList] = useState<LinkList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [shareableUrl, setShareableUrl] = useState<string>('');
  const [isSlowConnection, setIsSlowConnection] = useState(false);

  // Try to get link list from database (for local access)
  const dbLinkList = useLiveQuery(() => db.linkLists.get(linkListId), [linkListId]);

  // Detect connection speed
  useEffect(() => {
    setIsSlowConnection(cacheUtils.isSlowConnection());
  }, []);

  useEffect(() => {
    const loadLinkListData = async () => {
      setLoading(true);
      setError(null);

      try {
        // First, try to parse data from URL parameters (for cross-device sharing)
        const encodedData = searchParams.get('data');
        if (encodedData) {
          const currentUrl = window.location.href;
          const parsedData = urlService.parseShareableURL(currentUrl);
          
          if (parsedData && parsedData.places.length > 0) {
            setPlaces(parsedData.places);
            // Create a temporary LinkList object for display
            setLinkList({
              id: linkListId,
              title: 'Shared Places',
              description: undefined,
              placeIds: parsedData.places.map(p => p.id),
              collectionIds: [],
              createdAt: new Date(),
              updatedAt: new Date(),
              isPublic: true,
            });
            setShareableUrl(currentUrl);
            
            // Cache the places for better performance
            linkListCache.cachePlaces(parsedData.places);
            
            setLoading(false);
            return;
          }
        }

        // Fallback: try to load from local database with caching
        if (dbLinkList) {
          // Cache the link list
          linkListCache.cacheLinkList(linkListId, dbLinkList);
          
          const linkListPlaces = await linkListService.getPlacesForLinkList(linkListId);
          setLinkList(dbLinkList);
          setPlaces(linkListPlaces);
          
          // Generate shareable URL with caching
          const url = urlService.generateShareableURL(dbLinkList, linkListPlaces);
          setShareableUrl(url);
          
          // Preload places for better performance on slow connections
          if (isSlowConnection && linkListPlaces.length > 10) {
            linkListCache.preloadPlaces(linkListPlaces);
          }
        } else {
          setError('Link list not found');
        }
      } catch (err) {
        console.error('Failed to load link list:', err);
        setError('Failed to load link list');
      } finally {
        setLoading(false);
      }
    };

    loadLinkListData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkListId, searchParams, dbLinkList, isSlowConnection]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-2 text-muted-foreground">
          {isSlowConnection && <WifiOff className="w-4 h-4" />}
          <p>Loading link list...</p>
        </div>
      </div>
    );
  }

  if (error || !linkList) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground mb-4">
              {error || 'Link list not found'}
            </p>
            <p className="text-sm text-muted-foreground">
              The link may be invalid or expired.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">{linkList.title}</h1>
        {linkList.description && (
          <p className="text-muted-foreground text-lg">{linkList.description}</p>
        )}
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            {places.length} place{places.length !== 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {formatDateTime(linkList.createdAt)}
          </div>
          {isSlowConnection && (
            <div className="flex items-center gap-1 text-amber-600">
              <WifiOff className="w-4 h-4" />
              <span>Slow connection</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-center gap-3">
        <Button
          variant="outline"
          onClick={() => setShowQRCode(!showQRCode)}
          className="flex items-center gap-2 min-h-[44px]"
        >
          <QrCode className="w-4 h-4" />
          {showQRCode ? 'Hide QR Code' : 'Show QR Code'}
        </Button>
        
        <Button
          variant="outline"
          onClick={() => {
            if (navigator.share) {
              navigator.share({
                title: linkList.title,
                text: linkList.description || 'Check out these places',
                url: shareableUrl,
              });
            } else {
              navigator.clipboard.writeText(shareableUrl);
            }
          }}
          className="flex items-center gap-2 min-h-[44px]"
        >
          <Share2 className="w-4 h-4" />
          Share
        </Button>
      </div>

      {/* QR Code Display */}
      {showQRCode && shareableUrl && (
        <div className="flex justify-center">
          <LazyQRCode
            url={shareableUrl}
            title={`QR Code for ${linkList.title}`}
            size={200}
            autoLoad={true}
          />
        </div>
      )}

      {/* Places List with Lazy Loading */}
      <LazyPlaceList 
        places={places}
        initialLoadCount={isSlowConnection ? 5 : 10}
        loadMoreCount={isSlowConnection ? 5 : 10}
        compact={isSlowConnection}
      />

      {/* Footer */}
      <div className="text-center text-sm text-muted-foreground pt-8 border-t">
        <p>
          Created with{' '}
          <a 
            href="/" 
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            PinBridge
          </a>
        </p>
      </div>

      {/* Performance Monitor (development only) */}
      <PerformanceMonitor />
    </div>
  );
}