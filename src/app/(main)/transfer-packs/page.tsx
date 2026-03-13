'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useTransferPacksStore } from '@/stores/transfer-packs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdNative } from '@/components/ads/ad-native';
import { Plus, Play, Trash2, MoreHorizontal } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { adService } from '@/lib/services/ad-service';
import type { TransferPack } from '@/types';

export default function TransferPacksPage() {
  const packs = useLiveQuery(() => db.transferPacks.orderBy('updatedAt').reverse().toArray(), []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transfer Packs</h1>
          <p className="text-muted-foreground">Guided migrations to your target map app</p>
        </div>
        <Link href="/transfer-packs/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Pack
          </Button>
        </Link>
      </div>

      {packs && packs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No transfer packs yet</p>
            <Link href="/transfer-packs/new">
              <Button>Create your first pack</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {packs?.map((pack, index) => (
            <div key={pack.id}>
              <PackCard pack={pack} />
              {/* Show native ad after every 3rd pack */}
              {(index + 1) % 3 === 0 && adService.shouldShowAds() && !adService.isPremiumUser() && (
                <div className="mt-3">
                  <AdNative 
                    placement={{
                      id: 'content-native',
                      type: 'native',
                      size: 'responsive',
                      position: 'content',
                      priority: 6,
                      minViewTime: 10,
                      frequency: 'once-per-session',
                      targetPages: ['/transfer-packs'],
                      excludePages: []
                    }}
                    variant="travel"
                    className="mb-3"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PackCard({ pack }: { pack: TransferPack }) {
  // Use reactive query for transfer pack items instead of imperative useEffect
  const items = useLiveQuery(
    () => {
      try {
        return db.transferPackItems.where('packId').equals(pack.id).toArray();
      } catch (error) {
        console.error('Failed to load transfer pack items', error);
        return [];
      }
    },
    [pack.id]
  );

  // Check for automated transfer session
  const session = useLiveQuery(
    () => {
      try {
        return db.transferPackSessions.where('packId').equals(pack.id).first();
      } catch (error) {
        console.error('Failed to load transfer pack session', error);
        return undefined;
      }
    },
    [pack.id]
  );
  
  // Calculate progress from live query results
  const progress = useMemo(() => {
    if (!items) return { done: 0, total: 0 };
    const done = items.filter(
      (item) => item.status === 'done' || item.status === 'skipped'
    ).length;
    return { done, total: items.length };
  }, [items]);

  const { deletePack } = useTransferPacksStore();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (confirm('Delete this transfer pack?')) {
      await deletePack(pack.id);
    }
  };

  const isComplete = progress.done === progress.total && progress.total > 0;
  const progressPercent = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  // Determine if this is an automated transfer pack
  const isAutomated = !!session;
  const automatedStatus = session?.status;

  // Determine the appropriate action and route
  const getActionInfo = (): { text: string; route: string; variant: 'default' | 'outline' | 'destructive' } => {
    if (isAutomated) {
      switch (automatedStatus) {
        case 'pending':
          return { text: 'Start Processing', route: `/transfer-packs/${pack.id}/verify`, variant: 'default' };
        case 'processing':
          return { text: 'View Progress', route: `/transfer-packs/${pack.id}/verify`, variant: 'default' };
        case 'verifying':
        case 'paused':
          return { text: 'Continue Verification', route: `/transfer-packs/${pack.id}/verify`, variant: 'default' };
        case 'completed':
          return { text: 'View Results', route: `/transfer-packs/${pack.id}/verify`, variant: 'outline' };
        case 'failed':
          return { text: 'Retry', route: `/transfer-packs/${pack.id}/verify`, variant: 'destructive' };
        default:
          return { text: 'Open', route: `/transfer-packs/${pack.id}/verify`, variant: 'default' };
      }
    } else {
      return { 
        text: isComplete ? 'Review' : 'Resume', 
        route: `/transfer-packs/${pack.id}/run`, 
        variant: isComplete ? 'outline' : 'default',
      };
    }
  };

  const actionInfo = getActionInfo();

  return (
    <Link href={actionInfo.route}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium">{pack.name}</h3>
                <span
                  className={`px-2 py-0.5 text-xs rounded ${
                    pack.target === 'apple'
                      ? 'bg-gray-100 text-gray-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  → {pack.target === 'apple' ? 'Apple Maps' : 'Google Maps'}
                </span>
                {isAutomated && (
                  <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                    Automated
                  </span>
                )}
              </div>
              
              {isAutomated ? (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {session?.totalPlaces || 0} places • Status: {automatedStatus || 'pending'}
                  </p>
                  {session && session.processedPlaces > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{session.processedPlaces}/{session.totalPlaces} processed</span>
                      <span>•</span>
                      <span>{session.verifiedPlaces} verified</span>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">
                    {progress.done}/{progress.total} places
                    {isComplete && ' (Complete)'}
                  </p>
                  <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
              
              <p className="text-xs text-muted-foreground mt-1">
                Last updated {formatDateTime(pack.updatedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant={actionInfo.variant}>
                <Play className="w-4 h-4 mr-1" />
                {actionInfo.text}
              </Button>
              <Button size="icon" variant="ghost" onClick={handleDelete}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
