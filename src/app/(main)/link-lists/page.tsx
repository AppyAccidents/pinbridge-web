'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { linkListService } from '@/lib/services/link-list';
import { urlService } from '@/lib/services/url';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Plus, 
  MoreVertical, 
  ExternalLink, 
  Share2, 
  Trash2, 
  MapPin, 
  Calendar,
  QrCode,
  Copy,
  Check
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { QRCodeGenerator } from '@/components/shared/qr-code-generator';
import type { LinkList } from '@/types';

export default function LinkListsPage() {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showQRCode, setShowQRCode] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Load link lists from database
  const linkLists = useLiveQuery(() => db.linkLists.orderBy('createdAt').reverse().toArray(), []);

  const handleCreateNew = () => {
    router.push('/link-list/create');
  };

  const handleView = (linkListId: string) => {
    router.push(`/link-list/${linkListId}`);
  };

  const handleShare = async (linkList: LinkList) => {
    try {
      const places = await linkListService.getPlacesForLinkList(linkList.id);
      const shareableUrl = urlService.generateShareableURL(linkList, places);

      if (navigator.share) {
        await navigator.share({
          title: linkList.title,
          text: linkList.description || 'Check out these places',
          url: shareableUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareableUrl);
        setCopiedUrl(linkList.id);
        setTimeout(() => setCopiedUrl(null), 2000);
      }
    } catch (error) {
      console.error('Failed to share link list:', error);
    }
  };

  const handleShowQRCode = (linkListId: string) => {
    setShowQRCode(linkListId);
  };

  const handleDelete = async (linkListId: string) => {
    try {
      await linkListService.deleteLinkList(linkListId);
      setDeletingId(null);
    } catch (error) {
      console.error('Failed to delete link list:', error);
    }
  };

  const getPlaceCount = (linkList: LinkList): number => {
    return linkList.placeIds.length;
  };

  if (!linkLists) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Loading link lists...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Link Lists</h1>
          <p className="text-muted-foreground">
            Manage your shareable place collections
          </p>
        </div>
        <Button onClick={handleCreateNew} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create New
        </Button>
      </div>

      {/* Link Lists Grid */}
      {linkLists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                <MapPin className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-medium">No Link Lists Yet</h3>
                <p className="text-muted-foreground">
                  Create your first link list to share places with others
                </p>
              </div>
              <Button onClick={handleCreateNew} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create Link List
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {linkLists.map((linkList) => (
            <Card key={linkList.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">
                      {linkList.title}
                    </CardTitle>
                    {linkList.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {linkList.description}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        aria-label="More options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleView(linkList.id)}>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShare(linkList)}>
                        {copiedUrl === linkList.id ? (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Share2 className="w-4 h-4 mr-2" />
                            Share
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShowQRCode(linkList.id)}>
                        <QrCode className="w-4 h-4 mr-2" />
                        QR Code
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => setDeletingId(linkList.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      {getPlaceCount(linkList)} place{getPlaceCount(linkList) !== 1 ? 's' : ''}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {linkList.isPublic ? 'Public' : 'Private'}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    Created {formatDateTime(linkList.createdAt)}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleView(linkList.id)}
                      className="flex-1"
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      View
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleShare(linkList)}
                      aria-label="Share"
                    >
                      {copiedUrl === linkList.id ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Share2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Link List</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this link list? This action cannot be undone.
              The shareable links will no longer work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && handleDelete(deletingId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR Code Dialog */}
      {showQRCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">QR Code</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowQRCode(null)}
                  aria-label="Close"
                >
                  ×
                </Button>
              </div>
              <QRCodeDisplay linkListId={showQRCode} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Component to display QR code for a specific link list
function QRCodeDisplay({ linkListId }: { linkListId: string }) {
  const [shareableUrl, setShareableUrl] = useState<string>('');
  const [linkList, setLinkList] = useState<LinkList | null>(null);

  // Load link list and generate URL
  React.useEffect(() => {
    const loadData = async () => {
      try {
        const ll = await linkListService.getLinkList(linkListId);
        if (ll) {
          setLinkList(ll);
          const places = await linkListService.getPlacesForLinkList(linkListId);
          const url = urlService.generateShareableURL(ll, places);
          setShareableUrl(url);
        }
      } catch (error) {
        console.error('Failed to load link list for QR code:', error);
      }
    };

    loadData();
  }, [linkListId]);

  if (!shareableUrl || !linkList) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-muted-foreground">Loading QR code...</p>
      </div>
    );
  }

  return (
    <QRCodeGenerator
      url={shareableUrl}
      title={`QR Code for ${linkList.title}`}
      size={200}
      downloadable={true}
      showCopyButton={true}
      showSettings={true}
    />
  );
}
