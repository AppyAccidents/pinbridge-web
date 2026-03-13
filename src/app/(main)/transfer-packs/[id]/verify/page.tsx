'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { transferSessionService } from '@/lib/services/transfer-session';
import { batchProcessingEngine } from '@/lib/services/batch-processing-engine';
import { VerificationInterface } from '@/components/verification/verification-interface';
import { ProcessingStatus } from '@/components/verification/processing-status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, Pause, RotateCcw, Crown, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { paymentService } from '@/lib/services/payment-service';
import { useApiAvailability } from '@/lib/hooks/use-api-availability';
import { PremiumUpsellDialog } from '@/components/shared/premium-upsell-dialog';
import type { 
  TransferPackSession, 
  PlaceMatchRecord, 
  TransferSessionStatus 
} from '@/types';
import type { ProcessingProgress } from '@/lib/services/batch-processing-engine';

export default function VerifyTransferPackPage() {
  const params = useParams();
  const packId = params.id as string;

  // State management
  const [session, setSession] = useState<TransferPackSession | null>(null);
  const [matches, setMatches] = useState<PlaceMatchRecord[]>([]);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(paymentService.isPremiumUser());
  const [showUpsell, setShowUpsell] = useState(false);
  const { status: apiStatus, isLoading: apiStatusLoading } = useApiAvailability();

  // Live queries for reactive updates
  const transferPack = useLiveQuery(() => db.transferPacks.get(packId), [packId]);
  const sessionData = useLiveQuery(async () => {
    if (!packId) return null;
    return transferSessionService.getSessionForPack(packId);
  }, [packId]);

  const matchRecords = useLiveQuery(async () => {
    if (!session?.id) return [];
    return transferSessionService.getMatchRecordsForSession(session.id);
  }, [session?.id]);

  // Update local state when live queries change
  useEffect(() => {
    if (sessionData) {
      setSession(sessionData);
    }
  }, [sessionData]);

  useEffect(() => {
    if (matchRecords) {
      setMatches(matchRecords);
    }
  }, [matchRecords]);

  useEffect(() => {
    const handleSubscriptionUpdate = () => {
      setIsPremium(paymentService.isPremiumUser());
    };

    window.addEventListener('subscription-updated', handleSubscriptionUpdate);
    return () => window.removeEventListener('subscription-updated', handleSubscriptionUpdate);
  }, []);

  // Progress callback for batch processing
  const handleProgressUpdate = useCallback((progress: ProcessingProgress) => {
    setProcessingProgress(progress);
    setIsProcessing(progress.status === 'processing');
  }, []);

  // Start automated processing
  const startProcessing = async () => {
    if (!packId) return;

    try {
      if (!isPremium) {
        setShowUpsell(true);
        return;
      }

      if (apiStatusLoading) {
        setError('Checking automated transfer availability...');
        return;
      }

      const targetApiConfigured =
        transferPack?.target === 'apple'
          ? apiStatus?.apple.configured
          : apiStatus?.google.configured;

      if (!targetApiConfigured) {
        setError('Automated transfer is temporarily unavailable.');
        return;
      }

      setIsProcessing(true);
      setError(null);

      await batchProcessingEngine.startProcessing(
        packId,
        {
          concurrency: 3,
          batchSize: 10,
          retryAttempts: 3,
          pauseOnError: false,
        },
        handleProgressUpdate
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
      setIsProcessing(false);
    }
  };

  // Pause processing
  const pauseProcessing = async () => {
    if (!session?.id) return;

    try {
      await batchProcessingEngine.pauseProcessing(session.id);
      setIsProcessing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause processing');
    }
  };

  // Resume processing
  const resumeProcessing = async () => {
    if (!session?.id) return;

    try {
      if (!isPremium) {
        setShowUpsell(true);
        return;
      }

      if (apiStatusLoading) {
        setError('Checking automated transfer availability...');
        return;
      }

      const targetApiConfigured =
        transferPack?.target === 'apple'
          ? apiStatus?.apple.configured
          : apiStatus?.google.configured;

      if (!targetApiConfigured) {
        setError('Automated transfer is temporarily unavailable.');
        return;
      }

      setIsProcessing(true);
      setError(null);

      await batchProcessingEngine.resumeProcessing(
        session.id,
        {
          concurrency: 3,
          batchSize: 10,
          retryAttempts: 3,
          pauseOnError: false,
        },
        handleProgressUpdate
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume processing');
      setIsProcessing(false);
    }
  };

  // Get current processing status
  useEffect(() => {
    const updateStatus = async () => {
      if (!session?.id) return;

      try {
        const status = await batchProcessingEngine.getProcessingStatus(session.id);
        if (status) {
          setProcessingProgress(status);
          setIsProcessing(status.status === 'processing');
        }
      } catch (err) {
        console.error('Failed to get processing status:', err);
      }
    };

    updateStatus();
    
    // Update status every 2 seconds during processing
    const interval = setInterval(updateStatus, 2000);
    return () => clearInterval(interval);
  }, [session?.id]);

  // Loading state
  if (!transferPack) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading transfer pack...</p>
          </div>
        </div>
      </div>
    );
  }

  // Determine current phase
  const getPhase = (): 'setup' | 'processing' | 'verifying' | 'completed' => {
    if (!session) return 'setup';
    if (session.status === 'processing') return 'processing';
    if (session.status === 'verifying' || session.status === 'paused') return 'verifying';
    if (session.status === 'completed') return 'completed';
    return 'setup';
  };

  const currentPhase = getPhase();

  return (
    <div className="container mx-auto py-8 space-y-6">
      <PremiumUpsellDialog open={showUpsell} onOpenChange={setShowUpsell} />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href={`/transfer-packs/${packId}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Pack
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Automated Transfer</h1>
            <p className="text-gray-600">{transferPack.name}</p>
          </div>
        </div>

        {/* Phase indicator */}
        <div className="flex items-center space-x-2">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            currentPhase === 'setup' ? 'bg-gray-100 text-gray-700' :
            currentPhase === 'processing' ? 'bg-blue-100 text-blue-700' :
            currentPhase === 'verifying' ? 'bg-yellow-100 text-yellow-700' :
            'bg-green-100 text-green-700'
          }`}>
            {currentPhase === 'setup' && 'Ready to Start'}
            {currentPhase === 'processing' && 'Processing Places'}
            {currentPhase === 'verifying' && 'Ready for Verification'}
            {currentPhase === 'completed' && 'Transfer Completed'}
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-red-700">
              <div className="font-medium">Error:</div>
              <div>{error}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isPremium && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 text-yellow-900">
              <Crown className="h-5 w-5 mt-0.5" />
              <div>
                <p className="font-medium">Automated Transfer requires Premium</p>
                <p className="text-sm text-yellow-800">
                  Start your free trial to unlock smart matching, bulk verification, and faster transfers.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isPremium && apiStatus && transferPack && (
        !(transferPack.target === 'apple' ? apiStatus.apple.configured : apiStatus.google.configured) && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-amber-900">
                <AlertCircle className="h-5 w-5 mt-0.5" />
                <div>
                  <p className="font-medium">Automated Transfer is temporarily unavailable</p>
                  <p className="text-sm text-amber-800">
                    We&apos;re missing API keys for {transferPack.target === 'apple' ? 'Apple Maps' : 'Google Maps'}.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {/* Main content based on phase */}
      {currentPhase === 'setup' && (
        <Card>
          <CardHeader>
            <CardTitle>Start Automated Transfer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              This will automatically search for your places in {transferPack.target === 'apple' ? 'Apple Maps' : 'Google Maps'} 
              and find the best matches. You'll then be able to review and verify the matches before completing the transfer.
            </p>
            
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-medium text-blue-900 mb-2">What happens next:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Search for each place in the target mapping service</li>
                <li>• Use intelligent matching to find the best candidates</li>
                <li>• Calculate confidence scores for each match</li>
                <li>• Present matches for your review and verification</li>
              </ul>
            </div>

            <Button 
              onClick={startProcessing} 
              disabled={isProcessing}
              className="w-full"
            >
              <Play className="h-4 w-4 mr-2" />
              Start Automated Processing
            </Button>
          </CardContent>
        </Card>
      )}

      {currentPhase === 'processing' && (
        <ProcessingStatus
          progress={processingProgress}
          onPause={pauseProcessing}
          onResume={resumeProcessing}
          isProcessing={isProcessing}
        />
      )}

      {currentPhase === 'verifying' && (
        <VerificationInterface
          session={session!}
          matches={matches}
          transferPack={transferPack}
          onProcessingResume={resumeProcessing}
        />
      )}

      {currentPhase === 'completed' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-green-700">Transfer Completed!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              Your automated transfer has been completed successfully. All verified matches 
              have been processed and are ready for use in {transferPack.target === 'apple' ? 'Apple Maps' : 'Google Maps'}.
            </p>
            
            <div className="flex space-x-4">
              <Link href={`/transfer-packs/${packId}`}>
                <Button>
                  View Transfer Pack
                </Button>
              </Link>
              <Link href="/transfer-packs">
                <Button variant="outline">
                  Back to Transfer Packs
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
