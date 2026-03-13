'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getCollectionsForPlace } from '@/lib/db';
import { generateAppleMapsUrl, generateGoogleMapsUrl } from '@/lib/links';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  MapPin,
  ExternalLink,
  Copy,
  AlertCircle,
  Tag,
  FolderOpen,
  Trash2,
  Check,
} from 'lucide-react';
import { usePlacesStore } from '@/stores/places';
import type { Place, Collection } from '@/types';

export default function PlaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const placeId = params.id as string;

  const place = useLiveQuery(() => db.places.get(placeId), [placeId]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [copiedLink, setCopiedLink] = useState<'apple' | 'google' | null>(null);

  const { updatePlace, deletePlace } = usePlacesStore();

  useEffect(() => {
    if (place) {
      setEditTitle(place.title);
      setEditAddress(place.address);
      getCollectionsForPlace(place.id).then(setCollections);
    }
  }, [place]);

  if (!place) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Place not found</p>
      </div>
    );
  }

  const hasCoords = place.latitude !== undefined && place.longitude !== undefined;
  const appleMapsUrl = generateAppleMapsUrl(place);
  const googleMapsUrl = generateGoogleMapsUrl(place);

  const handleSave = async () => {
    await updatePlace(place.id, {
      title: editTitle,
      address: editAddress,
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this place?')) {
      await deletePlace(place.id);
      router.push('/');
    }
  };

  const copyLink = (type: 'apple' | 'google') => {
    const url = type === 'apple' ? appleMapsUrl : googleMapsUrl;
    navigator.clipboard.writeText(url);
    setCopiedLink(type);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{place.title}</h1>
            {!hasCoords && <AlertCircle className="w-5 h-5 text-amber-500" />}
          </div>
          <p className="text-muted-foreground">{place.address}</p>
        </div>
      </div>

      {/* Open-in Links */}
      <Card>
        <CardHeader>
          <CardTitle>Open in Maps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <a href={appleMapsUrl} target="_blank" rel="noopener noreferrer">
              <Button className="w-full" variant="outline">
                <ExternalLink className="w-4 h-4 mr-2" />
                Apple Maps
              </Button>
            </a>
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
              <Button className="w-full" variant="outline">
                <ExternalLink className="w-4 h-4 mr-2" />
                Google Maps
              </Button>
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="ghost" size="sm" onClick={() => copyLink('apple')}>
              {copiedLink === 'apple' ? (
                <Check className="w-4 h-4 mr-2" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              Copy Apple link
            </Button>
            <Button variant="ghost" size="sm" onClick={() => copyLink('google')}>
              {copiedLink === 'google' ? (
                <Check className="w-4 h-4 mr-2" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              Copy Google link
            </Button>
          </div>
          {!hasCoords && (
            <p className="text-sm text-amber-600">
              <AlertCircle className="w-4 h-4 inline mr-1" />
              Missing coordinates - links will use address query (may be less accurate)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Location Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Location</CardTitle>
          {!isEditing && (
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <>
              <div>
                <label className="text-sm font-medium">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Address</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave}>Save</Button>
                <Button variant="ghost" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm text-muted-foreground">Address</p>
                <p>{place.address || 'No address'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Coordinates</p>
                {hasCoords ? (
                  <p>
                    {place.latitude}, {place.longitude}
                  </p>
                ) : (
                  <p className="text-amber-600">Missing - consider resolving</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Source */}
      <Card>
        <CardHeader>
          <CardTitle>Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <p className="text-sm text-muted-foreground">Provider</p>
            <p className="capitalize">{place.source}</p>
          </div>
          {place.sourceUrl && (
            <div>
              <p className="text-sm text-muted-foreground">Original URL</p>
              <a
                href={place.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {place.sourceUrl}
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tags */}
      {place.tags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {place.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 text-sm rounded-full bg-secondary text-secondary-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Collections */}
      {collections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              Collections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {collections.map((collection) => (
                <Button
                  key={collection.id}
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/collections/${collection.id}`)}
                >
                  {collection.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {place.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{place.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-600">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Place
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
