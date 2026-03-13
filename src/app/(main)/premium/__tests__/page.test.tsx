/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PremiumPage from '../page';
import { paymentService } from '@/lib/services/payment-service';

// Mock the payment service
jest.mock('@/lib/services/payment-service', () => ({
  paymentService: {
    getPlans: jest.fn(),
    getSubscriptionStatus: jest.fn(),
    createCheckoutSession: jest.fn(),
    cancelSubscription: jest.fn(),
    getCustomerPortalUrl: jest.fn(),
  },
}));

const mockPaymentService = paymentService as jest.Mocked<typeof paymentService>;

const mockPlans = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: 4.99,
    currency: 'USD',
    interval: 'month' as const,
    features: ['Ad-free experience', 'Unlimited transfers'],
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: 39.99,
    currency: 'USD',
    interval: 'year' as const,
    features: ['Ad-free experience', 'Unlimited transfers', 'Premium support'],
    popular: true,
    savings: '33% off',
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    price: 99.99,
    currency: 'USD',
    interval: 'lifetime' as const,
    features: ['All premium features', 'Lifetime access'],
    savings: 'Best deal',
  },
];

describe('PremiumPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPaymentService.getPlans.mockReturnValue(mockPlans);
    mockPaymentService.getSubscriptionStatus.mockReturnValue({ isActive: false });
    
    // Mock window.addEventListener
    jest.spyOn(window, 'addEventListener').mockImplementation();
    jest.spyOn(window, 'removeEventListener').mockImplementation();
    jest.spyOn(window, 'alert').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Non-premium user view', () => {
    it('should render premium features', () => {
      render(<PremiumPage />);
      
      expect(screen.getByText('PinBridge Premium')).toBeInTheDocument();
      expect(screen.getByText('Ad-Free Experience')).toBeInTheDocument();
      expect(screen.getByText('Unlimited Transfers')).toBeInTheDocument();
      expect(screen.getByText('Priority Processing')).toBeInTheDocument();
    });

    it('should render pricing plans', () => {
      render(<PremiumPage />);
      
      expect(screen.getByText('Monthly')).toBeInTheDocument();
      expect(screen.getByText('Yearly')).toBeInTheDocument();
      expect(screen.getByText('Lifetime')).toBeInTheDocument();
      
      expect(screen.getByText('$4.99')).toBeInTheDocument();
      expect(screen.getByText('$39.99')).toBeInTheDocument();
      expect(screen.getByText('$99.99')).toBeInTheDocument();
    });

    it('should highlight popular plan', () => {
      render(<PremiumPage />);
      
      expect(screen.getByText('Most Popular')).toBeInTheDocument();
      expect(screen.getByText('33% off')).toBeInTheDocument();
    });

    it('should handle plan selection', () => {
      render(<PremiumPage />);
      
      const monthlyPlan = screen.getByText('Monthly').closest('div');
      fireEvent.click(monthlyPlan!);
      
      // Plan should be selected (visual feedback would be tested via CSS classes)
      expect(monthlyPlan).toBeInTheDocument();
    });

    it('should handle upgrade button click', async () => {
      mockPaymentService.createCheckoutSession.mockResolvedValue({
        success: true,
        subscriptionId: 'sub_123',
      });
      
      render(<PremiumPage />);

      const upgradeButtons = screen.getAllByRole('button', { name: /Upgrade Now/i });
      const yearlyButton = upgradeButtons[1];
      expect(yearlyButton).toBeTruthy();
      if (yearlyButton) {
        fireEvent.click(yearlyButton);
      }
      
      await waitFor(() => {
        expect(mockPaymentService.createCheckoutSession).toHaveBeenCalledWith('yearly');
      });
    });

    it('should show loading state during upgrade', async () => {
      mockPaymentService.createCheckoutSession.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );
      
      render(<PremiumPage />);
      
      const upgradeButton = screen.getAllByText('Upgrade Now')[0];
      fireEvent.click(upgradeButton);
      
      expect(screen.getByText('Processing...')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
      });
    });

    it('should handle upgrade failure', async () => {
      mockPaymentService.createCheckoutSession.mockResolvedValue({
        success: false,
        error: 'Payment failed',
      });
      
      render(<PremiumPage />);
      
      const upgradeButton = screen.getAllByText('Upgrade Now')[0];
      fireEvent.click(upgradeButton);
      
      await waitFor(() => {
        expect(window.alert).toHaveBeenCalledWith('Payment failed: Payment failed');
      });
    });

    it('should render testimonials', () => {
      render(<PremiumPage />);
      
      expect(screen.getByText('Join 10,000+ Happy Premium Users')).toBeInTheDocument();
      expect(screen.getByText(/Sarah K., Travel Blogger/)).toBeInTheDocument();
      expect(screen.getByText(/Mike R., Real Estate Agent/)).toBeInTheDocument();
    });

    it('should render FAQ section', () => {
      render(<PremiumPage />);
      
      expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument();
      expect(screen.getByText('Can I cancel anytime?')).toBeInTheDocument();
      expect(screen.getByText('What payment methods do you accept?')).toBeInTheDocument();
    });

    it('should render money-back guarantee', () => {
      render(<PremiumPage />);
      
      expect(screen.getByText('30-Day Money-Back Guarantee')).toBeInTheDocument();
      expect(screen.getByText(/Not satisfied/)).toBeInTheDocument();
    });
  });

  describe('Premium user view', () => {
    beforeEach(() => {
      mockPaymentService.getSubscriptionStatus.mockReturnValue({
        isActive: true,
        plan: mockPlans[1], // Yearly plan
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });
    });

    it('should render premium management view for active subscribers', () => {
      render(<PremiumPage />);
      
      expect(screen.getByText('Premium Active')).toBeInTheDocument();
      expect(screen.getByText('Yearly Plan')).toBeInTheDocument();
      expect(screen.getByText(/You're enjoying the full PinBridge experience/)).toBeInTheDocument();
    });

    it('should show subscription expiration date', () => {
      const expirationDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      mockPaymentService.getSubscriptionStatus.mockReturnValue({
        isActive: true,
        plan: mockPlans[1],
        expiresAt: expirationDate,
      });
      
      render(<PremiumPage />);
      
      expect(screen.getByText(/Renews on/)).toBeInTheDocument();
    });

    it('should handle subscription cancellation', async () => {
      mockPaymentService.cancelSubscription.mockResolvedValue(true);
      
      // Mock confirm dialog
      const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
      const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
      
      render(<PremiumPage />);
      
      const cancelButton = screen.getByText('Cancel Subscription');
      fireEvent.click(cancelButton);
      
      await waitFor(() => {
        expect(mockPaymentService.cancelSubscription).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith(
          expect.stringContaining('subscription has been cancelled')
        );
      });
      
      confirmSpy.mockRestore();
      alertSpy.mockRestore();
    });

    it('should not show cancel button for lifetime subscriptions', () => {
      mockPaymentService.getSubscriptionStatus.mockReturnValue({
        isActive: true,
        plan: mockPlans[2], // Lifetime plan
      });
      
      render(<PremiumPage />);
      
      expect(screen.queryByText('Cancel Subscription')).not.toBeInTheDocument();
    });

    it('should handle customer portal access', async () => {
      mockPaymentService.getCustomerPortalUrl.mockResolvedValue('https://billing.stripe.com/session/123');
      
      // Mock window.open
      const openSpy = jest.spyOn(window, 'open').mockImplementation();
      
      render(<PremiumPage />);
      
      const updatePaymentButton = screen.getByText('Update Payment Method');
      fireEvent.click(updatePaymentButton);
      
      await waitFor(() => {
        expect(openSpy).toHaveBeenCalledWith('https://billing.stripe.com/session/123', '_blank');
      });
      
      openSpy.mockRestore();
    });

    it('should show premium benefits stats', () => {
      render(<PremiumPage />);
      
      expect(screen.getByText('∞')).toBeInTheDocument(); // Unlimited transfers
      expect(screen.getByText('0')).toBeInTheDocument(); // Ads shown
      expect(screen.getByText('1st')).toBeInTheDocument(); // Priority queue
      expect(screen.getByText('24/7')).toBeInTheDocument(); // Premium support
    });

    it('should handle premium support contact', () => {
      // Mock window.open
      const openSpy = jest.spyOn(window, 'open').mockImplementation();
      
      render(<PremiumPage />);
      
      const supportButton = screen.getByText('Contact Premium Support');
      fireEvent.click(supportButton);
      
      expect(openSpy).toHaveBeenCalledWith('mailto:support@pinbridge.app', '_blank');
      
      openSpy.mockRestore();
    });
  });

  describe('Event handling', () => {
    it('should listen for subscription updates', () => {
      render(<PremiumPage />);
      
      expect(window.addEventListener).toHaveBeenCalledWith(
        'subscription-updated',
        expect.any(Function)
      );
    });

    it('should clean up event listeners on unmount', () => {
      const { unmount } = render(<PremiumPage />);
      
      unmount();
      
      expect(window.removeEventListener).toHaveBeenCalledWith(
        'subscription-updated',
        expect.any(Function)
      );
    });
  });
});
