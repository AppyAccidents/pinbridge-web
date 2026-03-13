'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Crown, Loader2, ArrowRight } from 'lucide-react';
import { paymentService } from '@/lib/services/payment-service';

export default function PremiumSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    
    if (!sessionId) {
      setError('No session ID found');
      setIsLoading(false);
      return;
    }

    // Handle successful payment
    const handleSuccess = async () => {
      try {
        paymentService.handlePaymentSuccess(sessionId);
        
        // Simulate activation (in real app, this would be handled by webhook)
        setTimeout(() => {
          // Trigger subscription update
          localStorage.setItem('pinbridge_premium', 'true');
          localStorage.setItem('pinbridge_subscription', JSON.stringify({
            planId: 'yearly', // This would come from the session
            isActive: true,
            startDate: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          }));
          
          window.dispatchEvent(new CustomEvent('subscription-updated'));
          setIsLoading(false);
        }, 2000);
      } catch (error) {
        console.error('Success handling error:', error);
        setError('Failed to activate premium subscription');
        setIsLoading(false);
      }
    };

    handleSuccess();
  }, [searchParams]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
              <h1 className="text-2xl font-bold">Activating Premium...</h1>
              <p className="text-muted-foreground">
                Please wait while we set up your premium account
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <span className="text-red-600 text-xl">!</span>
              </div>
              <h1 className="text-2xl font-bold text-red-900">Activation Failed</h1>
              <p className="text-red-700">{error}</p>
              <div className="space-y-2">
                <Button onClick={() => router.push('/premium')} className="w-full">
                  Try Again
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => window.open('mailto:support@pinbridge.app', '_blank')}
                  className="w-full"
                >
                  Contact Support
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="w-full max-w-md border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
        <CardContent className="pt-6">
          <div className="text-center space-y-6">
            <div className="relative">
              <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
              <Crown className="h-8 w-8 text-yellow-500 absolute -top-2 -right-2" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-green-900">Welcome to Premium!</h1>
              <p className="text-green-800">
                Your subscription is now active. Enjoy the full PinBridge experience!
              </p>
            </div>

            <div className="bg-white/50 rounded-lg p-4 space-y-2">
              <h3 className="font-semibold text-green-900">What's New:</h3>
              <ul className="text-sm text-green-800 space-y-1">
                <li>✨ Ad-free experience</li>
                <li>🚀 Unlimited transfers</li>
                <li>⚡ Priority processing</li>
                <li>🛡️ Premium support</li>
              </ul>
            </div>

            <div className="space-y-3">
              <Button 
                onClick={() => router.push('/')} 
                className="w-full bg-green-600 hover:bg-green-700"
              >
                Start Using Premium
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => router.push('/premium')}
                className="w-full border-green-300 text-green-700 hover:bg-green-100"
              >
                Manage Subscription
              </Button>
            </div>

            <p className="text-xs text-green-600">
              A confirmation email has been sent to your inbox
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}