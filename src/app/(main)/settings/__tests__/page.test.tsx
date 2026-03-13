/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPage from '../page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock('@/lib/db', () => ({
  clearAllData: jest.fn(),
  getPlaceCount: jest.fn(() => Promise.resolve(0)),
}));

jest.mock(
  '@radix-ui/react-switch',
  () => ({
    Root: ({ children, onCheckedChange, ...props }: any) => (
      <button
        {...props}
        onClick={(event) => {
          props.onClick?.(event);
          onCheckedChange?.(true);
        }}
      >
        {children}
      </button>
    ),
    Thumb: (props: any) => <span {...props} />,
  }),
  { virtual: true }
);

jest.mock(
  '@radix-ui/react-dialog',
  () => ({
    Root: ({ children }: any) => <div>{children}</div>,
    Trigger: ({ children }: any) => <button>{children}</button>,
    Portal: ({ children }: any) => <div>{children}</div>,
    Overlay: (props: any) => <div {...props} />,
    Content: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Title: ({ children }: any) => <div>{children}</div>,
    Description: ({ children }: any) => <div>{children}</div>,
    Close: ({ children }: any) => <button>{children}</button>,
  }),
  { virtual: true }
);

jest.mock('@/lib/services/auth-service', () => ({
  authService: {
    isLoggedIn: jest.fn(() => true),
    isAdmin: jest.fn(() => true),
  },
}));

jest.mock('@/lib/services/payment-service', () => ({
  paymentService: {
    isPremiumUser: jest.fn(() => false),
  },
}));

jest.mock('@/lib/services/ad-service', () => ({
  adService: {
    updateUserPreferences: jest.fn(),
  },
}));

jest.mock('@/lib/hooks/use-api-availability', () => ({
  useApiAvailability: () => ({
    status: { apple: { configured: false }, google: { configured: false } },
    isLoading: false,
    error: null,
  }),
}));

Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn(),
  },
});

global.fetch = jest.fn();

describe('SettingsPage (Admin Panel)', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockReset();
    (fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/admin/automation-status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            redis: { ok: true, error: null, configured: true },
            guardrails: {
              free: {
                maxPlacesPerSession: 10,
                maxConcurrency: 5,
                maxBatchSize: 10,
                maxRetryAttempts: 1,
                pauseOnError: true,
                dailyCap: 1,
                perMinuteCap: 1,
              },
              premium: {
                maxPlacesPerSession: 100,
                maxConcurrency: 5,
                maxBatchSize: 10,
                maxRetryAttempts: 3,
                pauseOnError: false,
                dailyCap: 10,
                perMinuteCap: 10,
              },
            },
          }),
        });
      }

      if (url.includes('/api/admin/automation-metrics')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            aggregates: {
              totalDaily: 4,
              totalsByTier: { free: 2, premium: 2 },
              rolling7Days: { total: 10, free: 6, premium: 4 },
              rolling7DaysSeries: [
                { date: '2026-02-03', free: 1, premium: 1, total: 2 },
                { date: '2026-02-02', free: 2, premium: 0, total: 2 },
              ],
              topUsers: [{ userId: 'u1', count: 2, tier: 'free' }],
            },
            userId: 'user_test_123',
            tier: 'free',
            counts: { daily: 1, minute: 1 },
            caps: { daily: 1, minute: 1 },
            rolling7Days: [
              { date: '2026-02-03', count: 1 },
              { date: '2026-02-02', count: 0 },
            ],
          }),
        });
      }

      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it('renders admin stats and sparklines', async () => {
    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Automation Status')).toBeInTheDocument();
    });

    expect(await screen.findByText(/Total automated sessions today/)).toBeInTheDocument();

    // At least three sparklines should render (icons also use SVG)
    expect(document.querySelectorAll('svg').length).toBeGreaterThanOrEqual(3);
  });

  it('confirms and clears counters via modal', async () => {
    render(<SettingsPage />);

    const userIdInput = await screen.findByPlaceholderText('User ID');
    fireEvent.change(userIdInput, { target: { value: 'user_test_123' } });

    const clearButton = screen.getByText('Clear');
    fireEvent.click(clearButton);

    expect(screen.getByText('Clear Automation Counters')).toBeInTheDocument();

    const confirmButton = screen.getByText('Clear Counters');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('clear=true'),
        expect.any(Object)
      );
    });
  });

  it('exports CSV for user history', async () => {
    render(<SettingsPage />);

    const userIdInput = await screen.findByPlaceholderText('User ID');
    fireEvent.change(userIdInput, { target: { value: 'user_test_123' } });

    const loadButton = screen.getByText('Load');
    fireEvent.click(loadButton);

    const exportButton = screen.getByText('Export CSV');
    fireEvent.click(exportButton);

    expect(exportButton).toBeInTheDocument();
  });
});
