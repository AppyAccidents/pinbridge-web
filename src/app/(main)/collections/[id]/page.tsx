'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getPlacesInCollection } from '@/lib/db';
import { usePlacesStore } from '@/stores/places';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ArrowRightLeft, Trash2, AlertCircle, Edit2, Check, X } from 'lucide-react';
import type { Place, Collection } from '@/types';

export default function CollectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const collectionId = params.id as string;

  const collection = useLiveQuery(() => db.collections.get(collectionId), [collectionId]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');

  const { updateCollection, deleteCollection } = usePlacesStore();

  useEffect(() => {
    getPlacesInCollection(collectionId).then(setPlaces);
  }, [collectionId]);

  useEffect(() => {
    if (collection) {
      setEditName(collection.name);
    }
  }, [collection]);

  if (!collection) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Collection not found</p>
      </div>
    );
  }

  const missingCoordsCount = places.filter(
    (p) => p.latitude === undefined || p.longitude === undefined
  ).length;

  const handleSave = async () => {
    await updateCollection(collection.id, { name: editName });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm('Delete this collection? (Places will not be deleted)')) {
      await deleteCollection(collection.id);
      router.push('/');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-2xl font-bold bg-transparent border-b border-primary focus:outline-none"
                autoFocus
              />
              <Button size="icon" variant="ghost" onClick={handleSave}>
                <Check className="w-5 h-5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setIsEditing(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{collection.name}</h1>
              <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)}>
                <Edit2 className="w-4 h-4" />
              </Button>
            </div>
          )}
          <p className="text-muted-foreground">
            {places.length} places
            {missingCoordsCount > 0 && (
              <span className="text-amber-600"> ({missingCoordsCount} missing coordinates)</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/transfer-packs/new?collection=${collection.id}`}>
            <Button>
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Transfer Pack
            </Button>
          </Link>
          <Button variant="ghost" size="icon" onClick={handleDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Places list */}
      <div className="space-y-2">
        {places.map((place) => (
          <Link key={place.id} href={`/place/${place.id}`}>
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{place.title}</h3>
                      {place.latitude === undefined && (
                        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{place.address}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {places.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>No places in this collection</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
