'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, 
  Crown, 
  ArrowRightLeft,
  Zap, 
  Shield, 
  Star, 
  Users,
  TrendingUp,
  X,
  Loader2
} from 'lucide-react';
import { paymentService } from '@/lib/services/payment-service';
import type { SubscriptionPlan } from '@/lib/services/payment-service';

const PREMIUM_FEATURES = [
  {
    icon: X,
    title: 'Ad-Free Experience',
    description: 'Enjoy PinBridge without any advertisements',
    color: 'text-green-600'
  },
  {
    icon: ArrowRightLeft,
    title: 'Automated Transfer',
    description: 'Smart matching with bulk verification for faster transfers',
    color: 'text-blue-600'
  },
  {
    icon: Zap,
    title: 'Unlimited Transfers',
    description: 'Transfer unlimited places with no restrictions',
    color: 'text-blue-600'
  },
  {
    icon: TrendingUp,
    title: 'Priority Processing',
    description: 'Your transfers get processed first in the queue',
    color: 'text-purple-600'
  },
  {
    icon: Shield,
    title: 'Advanced Privacy',
    description: 'Enhanced privacy controls and data protection',
    color: 'text-indigo-600'
  },
  {
    icon: Star,
    title: 'Premium Support',
    description: '24/7 priority customer support via email',
    color: 'text-yellow-600'
  },
  {
    icon: Users,
    title: 'Team Features',
    description: 'Share transfer packs with team members',
    color: 'text-pink-600'
  }
];

export default function PremiumPage() {
  const [selectedPlan, setSelectedPlan] = useState('yearly');
  const [isLoading, setIsLoading] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState(paymentService.getSubscriptionStatus());

  useEffect(() => {
    setPlans(paymentService.getPlans());
    
    // Listen for subscription updates
    const handleSubscriptionUpdate = () => {
      setSubscriptionStatus(paymentService.getSubscriptionStatus());
    };

    window.addEventListener('subscription-updated', handleSubscriptionUpdate);
    return () => window.removeEventListener('subscription-updated', handleSubscriptionUpdate);
  }, []);

  const handleUpgrade = async (planId: string) => {
    setIsLoading(true);
    
    try {
      const result = await paymentService.createCheckoutSession(planId);
      
      if (result.success) {
        // If we have a subscription ID, the payment was processed (demo mode)
        if (result.subscriptionId) {
          setSubscriptionStatus(paymentService.getSubscriptionStatus());
          alert('Welcome to PinBridge Premium! 🎉');
        }
        // Otherwise, user was redirected to Stripe Checkout
      } else {
        alert(`Payment failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // If user is already premium, show management interface
  if (subscriptionStatus.isActive) {
    return <PremiumManagementView subscriptionStatus={subscriptionStatus} />;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center space-x-2">
          <Crown className="h-8 w-8 text-yellow-500" />
          <h1 className="text-4xl font-bold">PinBridge Premium</h1>
        </div>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Unlock the full potential of PinBridge with premium features designed for power users
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PREMIUM_FEATURES.map((feature, index) => (
          <Card key={index} className="border-2 hover:border-blue-200 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-start space-x-3">
                <feature.icon className={`h-6 w-6 ${feature.color} mt-1`} />
                <div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-gray-600 text-sm">{feature.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pricing Plans */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-2">Choose Your Plan</h2>
          <p className="text-gray-600">Start your premium experience today</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <Card 
              key={plan.id}
              className={`relative cursor-pointer transition-all ${
                plan.popular 
                  ? 'border-2 border-blue-500 shadow-lg scale-105' 
                  : selectedPlan === plan.id 
                    ? 'border-2 border-blue-300' 
                    : 'border hover:border-gray-300'
              }`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-blue-600 text-white px-3 py-1">
                    Most Popular
                  </Badge>
                </div>
              )}
              
              {plan.savings && (
                <div className="absolute -top-2 -right-2">
                  <Badge variant="destructive" className="text-xs">
                    {plan.savings}
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-4">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <div className="space-y-1">
                  <div className="text-3xl font-bold">
                    ${plan.price}
                    <span className="text-lg font-normal text-gray-600">
                      {plan.interval === 'lifetime' ? ' one-time' : `/${plan.interval}`}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {plan.interval === 'year' ? 'Best value - 2 months free!' :
                     plan.interval === 'lifetime' ? 'Pay once, use forever' :
                     'Perfect for trying premium features'}
                  </p>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <Button 
                  className={`w-full ${
                    plan.popular 
                      ? 'bg-blue-600 hover:bg-blue-700' 
                      : selectedPlan === plan.id
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : ''
                  }`}
                  variant={selectedPlan === plan.id ? 'default' : 'outline'}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUpgrade(plan.id);
                  }}
                  disabled={isLoading}
                >
                  {isLoading && selectedPlan === plan.id ? (
                    <>
                      <Loader2 className="animate-spin h-4 w-4 mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Crown className="h-4 w-4 mr-2" />
                      Upgrade Now
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Testimonials */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <h3 className="text-2xl font-bold text-blue-900">
              Join 10,000+ Happy Premium Users
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
              <div className="text-center">
                <div className="flex justify-center space-x-1 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 text-yellow-500 fill-current" />
                  ))}
                </div>
                <p className="text-sm text-blue-800 italic">
                  "PinBridge Premium saved me hours of manual work. The ad-free experience is amazing!"
                </p>
                <p className="text-xs text-blue-600 mt-2">- Sarah K., Travel Blogger</p>
              </div>
              
              <div className="text-center">
                <div className="flex justify-center space-x-1 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 text-yellow-500 fill-current" />
                  ))}
                </div>
                <p className="text-sm text-blue-800 italic">
                  "The unlimited transfers and priority processing are game-changers for my business."
                </p>
                <p className="text-xs text-blue-600 mt-2">- Mike R., Real Estate Agent</p>
              </div>
              
              <div className="text-center">
                <div className="flex justify-center space-x-1 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 text-yellow-500 fill-current" />
                  ))}
                </div>
                <p className="text-sm text-blue-800 italic">
                  "Premium support is fantastic. They helped me migrate 500+ locations seamlessly."
                </p>
                <p className="text-xs text-blue-600 mt-2">- Jennifer L., Event Planner</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-1">Can I cancel anytime?</h4>
            <p className="text-sm text-gray-600">
              Yes, you can cancel your subscription at any time. You'll continue to have premium access until the end of your billing period.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-1">What payment methods do you accept?</h4>
            <p className="text-sm text-gray-600">
              We accept all major credit cards, PayPal, and Apple Pay for your convenience.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-1">Is there a free trial?</h4>
            <p className="text-sm text-gray-600">
              We offer a 7-day free trial for new premium subscribers. No credit card required to start.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-1">What happens to my data if I cancel?</h4>
            <p className="text-sm text-gray-600">
              Your data remains safe and accessible. You'll simply lose access to premium features but keep all your places and transfer packs.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Money Back Guarantee */}
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-6">
          <div className="text-center">
            <Shield className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-green-900 mb-2">
              30-Day Money-Back Guarantee
            </h3>
            <p className="text-green-800">
              Not satisfied? Get a full refund within 30 days, no questions asked.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PremiumManagementView({ subscriptionStatus }: { subscriptionStatus: any }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your premium subscription?')) {
      return;
    }

    setIsLoading(true);
    try {
      const success = await paymentService.cancelSubscription();
      if (success) {
        alert('Your subscription has been cancelled. You\'ll continue to have premium access until the end of your billing period.');
        // The component will re-render due to the subscription-updated event
      } else {
        alert('Failed to cancel subscription. Please try again or contact support.');
      }
    } catch (error) {
      console.error('Cancel error:', error);
      alert('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    const portalUrl = await paymentService.getCustomerPortalUrl();
    if (portalUrl) {
      window.open(portalUrl, '_blank');
    } else {
      alert('Unable to open customer portal. Please contact support.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Premium Status */}
      <Card className="border-green-200 bg-gradient-to-r from-green-50 to-emerald-50">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-2">
              <Crown className="h-12 w-12 text-yellow-500" />
              <div>
                <h1 className="text-3xl font-bold text-green-900">Premium Active</h1>
                <p className="text-green-800">You're enjoying the full PinBridge experience</p>
              </div>
            </div>
            
            {subscriptionStatus.plan && (
              <div className="space-y-2">
                <Badge className="bg-green-600 text-white px-4 py-2 text-lg">
                  {subscriptionStatus.plan.name} Plan
                </Badge>
                {subscriptionStatus.expiresAt && (
                  <p className="text-sm text-green-700">
                    {subscriptionStatus.cancelAtPeriodEnd ? 'Expires' : 'Renews'} on{' '}
                    {subscriptionStatus.expiresAt.toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Premium Features */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PREMIUM_FEATURES.map((feature, index) => (
          <Card key={index} className="border-green-200">
            <CardContent className="pt-6">
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-6 w-6 text-green-600 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-gray-600 text-sm">{feature.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Subscription Management */}
      <Card>
        <CardHeader>
          <CardTitle>Manage Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={handleManageSubscription}
              className="flex-1"
            >
              <Shield className="h-4 w-4 mr-2" />
              Update Payment Method
            </Button>
            
            <Button
              variant="outline"
              onClick={() => window.open('mailto:support@pinbridge.app', '_blank')}
              className="flex-1"
            >
              <Star className="h-4 w-4 mr-2" />
              Contact Premium Support
            </Button>
          </div>

          {subscriptionStatus.plan?.interval !== 'lifetime' && (
            <div className="pt-4 border-t">
              <Button
                variant="destructive"
                onClick={handleCancelSubscription}
                disabled={isLoading}
                className="w-full sm:w-auto"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    Cancelling...
                  </>
                ) : (
                  'Cancel Subscription'
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                You'll keep premium access until the end of your billing period
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Premium Benefits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">∞</div>
              <div className="text-sm text-muted-foreground">Unlimited Transfers</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">0</div>
              <div className="text-sm text-muted-foreground">Ads Shown</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">1st</div>
              <div className="text-sm text-muted-foreground">Priority Queue</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">24/7</div>
              <div className="text-sm text-muted-foreground">Premium Support</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
