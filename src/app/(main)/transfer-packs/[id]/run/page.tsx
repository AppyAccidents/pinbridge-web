'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { generateAppleMapsUrl, generateGoogleMapsUrl } from '@/lib/links';
import { useTransferPacksStore } from '@/stores/transfer-packs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  ExternalLink,
  Check,
  SkipForward,
  Flag,
  MapPin,
  AlertCircle,
  PartyPopper,
} from 'lucide-react';
import type { TransferPack, TransferPackItem, Place } from '@/types';

export default function RunTransferPackPage() {
  const params = useParams();
  const router = useRouter();
  const packId = params.id as string;

  const [currentItem, setCurrentItem] = useState<TransferPackItem | null>(null);
  const [currentPlace, setCurrentPlace] = useState<Place | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [showMismatchForm, setShowMismatchForm] = useState(false);
  const [mismatchReason, setMismatchReason] = useState('');
  const [mismatchNotes, setMismatchNotes] = useState('');

  const pack = useLiveQuery(() => db.transferPacks.get(packId), [packId]);
  const { updateItemStatus, getNextPendingItem, getPackProgress, getPackItems } =
    useTransferPacksStore();

  const loadNextItem = useCallback(async () => {
    const next = await getNextPendingItem(packId);
    setCurrentItem(next);

    if (next) {
      const place = await db.places.get(next.placeId);
      setCurrentPlace(place ?? null);
    } else {
      setCurrentPlace(null);
    }

    const prog = await getPackProgress(packId);
    setProgress(prog);
  }, [packId, getNextPendingItem, getPackProgress]);

  useEffect(() => {
    loadNextItem();
  }, [loadNextItem]);

  if (!pack) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Transfer pack not found</p>
      </div>
    );
  }

  const handleMarkDone = async () => {
    if (!currentItem) return;
    await updateItemStatus(currentItem.id, 'done');
    await loadNextItem();
  };

  const handleSkip = async () => {
    if (!currentItem) return;
    await updateItemStatus(currentItem.id, 'skipped');
    await loadNextItem();
  };

  const handleFlag = async () => {
    if (!currentItem) return;
    await updateItemStatus(currentItem.id, 'flagged', mismatchReason, mismatchNotes);
    setShowMismatchForm(false);
    setMismatchReason('');
    setMismatchNotes('');
    await loadNextItem();
  };

  const openLink = () => {
    if (!currentPlace || !pack) return;
    const url =
      pack.target === 'apple'
        ? generateAppleMapsUrl(currentPlace)
        : generateGoogleMapsUrl(currentPlace);
    window.open(url, '_blank');
  };

  const progressPercent = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  const isComplete = progress.done === progress.total && progress.total > 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/transfer-packs')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{pack.name}</h1>
          <p className="text-sm text-muted-foreground">
            → {pack.target === 'apple' ? 'Apple Maps' : 'Google Maps'}
          </p>
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-sm text-muted-foreground">
              {progress.done} / {progress.total}
            </span>
          </div>
          <div className="h-3 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Complete State */}
      {isComplete && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-8 text-center">
            <PartyPopper className="w-12 h-12 mx-auto text-green-600 mb-4" />
            <h2 className="text-xl font-bold text-green-800 mb-2">Transfer Complete!</h2>
            <p className="text-green-700 mb-4">
              You&apos;ve gone through all {progress.total} places in this pack.
            </p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => router.push('/transfer-packs')}>Back to Packs</Button>
              <Button variant="outline" onClick={() => router.push('/')}>
                View Library
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Item */}
      {!isComplete && currentPlace && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Current Place
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{currentPlace.title}</h3>
                <p className="text-muted-foreground">{currentPlace.address}</p>
                {currentPlace.latitude === undefined && (
                  <p className="text-sm text-amber-600 mt-1">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    Missing coordinates - using address query
                  </p>
                )}
              </div>

              {currentPlace.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {currentPlace.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs rounded-full bg-secondary text-secondary-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Open Button */}
              <Button size="lg" className="w-full" onClick={openLink}>
                <ExternalLink className="w-5 h-5 mr-2" />
                Open in {pack.target === 'apple' ? 'Apple Maps' : 'Google Maps'}
              </Button>

              <p className="text-sm text-center text-muted-foreground">
                Open the place, then tap &quot;Save&quot; in the app. Come back here when done.
              </p>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-3">
            <Button size="lg" onClick={handleMarkDone} className="flex-col h-auto py-4">
              <Check className="w-6 h-6 mb-1" />
              <span>Done</span>
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
              onClick={() => setShowMismatchForm(true)}
              className="flex-col h-auto py-4"
            >
              <Flag className="w-6 h-6 mb-1" />
              <span>Flag</span>
            </Button>
          </div>

          {/* Mismatch Form */}
          {showMismatchForm && (
            <Card>
              <CardHeader>
                <CardTitle>Flag Mismatch</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Reason</label>
                  <select
                    className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
                    value={mismatchReason}
                    onChange={(e) => setMismatchReason(e.target.value)}
                  >
                    <option value="">Select a reason</option>
                    <option value="wrong_place">Wrong place shown</option>
                    <option value="ambiguous">Ambiguous / multiple results</option>
                    <option value="closed">Place is closed/gone</option>
                    <option value="duplicate">Duplicate of another place</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Notes (optional)</label>
                  <textarea
                    className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
                    rows={2}
                    value={mismatchNotes}
                    onChange={(e) => setMismatchNotes(e.target.value)}
                    placeholder="Any additional details..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleFlag} disabled={!mismatchReason}>
                    Flag & Continue
                  </Button>
                  <Button variant="ghost" onClick={() => setShowMismatchForm(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* No current item but not complete */}
      {!isComplete && !currentPlace && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Loading next place...</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
