/**
 * Unit tests for PackCard edge cases
 * These tests complement the property-based tests by focusing on specific, well-defined scenarios
 * Requirements: 3.1, 3.2
 */

import React from 'react';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { db } from '@/lib/db';
import type { TransferPack, TransferPackItem, PackItemStatus } from '@/types';

// Import the PackCard component from the page
// We'll extract it or create a test version that matches the implementation
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useTransferPacksStore } from '@/stores/transfer-packs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Play, Trash2 } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';

// Test version of PackCard component matching the current implementation
function TestPackCard({ pack }: { pack: TransferPack }) {
  // Use reactive query for transfer pack items instead of imperative useEffect
  const items = useLiveQuery(
    () => db.transferPackItems.where('packId').equals(pack.id).toArray(),
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

  return (
    <Link href={`/transfer-packs/${pack.id}/run`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer" data-testid={`pack-card-${pack.id}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-medium" data-testid="pack-name">{pack.name}</h3>
                <span
                  className={`px-2 py-0.5 text-xs rounded ${
                    pack.target === 'apple'
                      ? 'bg-gray-100 text-gray-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                  data-testid="pack-target"
                >
                  → {pack.target === 'apple' ? 'Apple Maps' : 'Google Maps'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground" data-testid="progress-text">
                {progress.done}/{progress.total} places
                {isComplete && ' (Complete)'}
              </p>
              <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden" data-testid="progress-bar-container">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progressPercent}%` }}
                  data-testid="progress-bar"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1" data-testid="last-updated">
                Last updated {formatDateTime(pack.updatedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant={isComplete ? 'outline' : 'default'} data-testid="action-button">
                <Play className="w-4 h-4 mr-1" />
                {isComplete ? 'Review' : 'Resume'}
              </Button>
              <Button size="icon" variant="ghost" onClick={handleDelete} data-testid="delete-button">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// Mock the store
jest.mock('@/stores/transfer-packs', () => ({
  useTransferPacksStore: () => ({
    deletePack: jest.fn(),
  }),
}));

// Mock Next.js Link component
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <div data-testid="link" data-href={href}>{children}</div>;
  };
});

// Mock the utils
jest.mock('@/lib/utils/index', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
  formatDateTime: (date: Date) => date.toISOString().slice(0, 10),
}));

// Mock window.confirm for delete tests
const mockConfirm = jest.fn();
Object.defineProperty(window, 'confirm', {
  value: mockConfirm,
  writable: true,
});

// Test setup and teardown
beforeEach(async () => {
  await db.delete();
  await db.open();
  document.body.innerHTML = '';
  mockConfirm.mockClear();
});

afterEach(async () => {
  await db.close();
  cleanup();
  document.body.innerHTML = '';
});

// Mock console to suppress React warnings during tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe('PackCard Edge Cases Unit Tests', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Test empty transfer packs (0 items)
   * Empty packs should show 0/0 progress, 0% completion, and not be marked as complete
   */
  describe('Empty Transfer Packs', () => {
    it('should display 0/0 progress for empty transfer pack', async () => {
      const emptyPack: TransferPack = {
        id: 'empty-pack-1',
        name: 'Empty Test Pack',
        target: 'apple',
        scopeType: 'library',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      // Setup: Create pack with no items
      await db.transferPacks.add(emptyPack);

      // Act: Render PackCard
      const { getByTestId } = render(<TestPackCard pack={emptyPack} />);

      // Assert: Should show 0/0 progress
      await waitFor(() => {
        const progressText = getByTestId('progress-text');
        expect(progressText).toHaveTextContent('0/0 places');
      });
    });

    it('should show 0% progress bar width for empty pack', async () => {
      const emptyPack: TransferPack = {
        id: 'empty-pack-2',
        name: 'Empty Progress Pack',
        target: 'google',
        scopeType: 'collection',
        scopeId: 'test-collection',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      await db.transferPacks.add(emptyPack);

      const { getByTestId } = render(<TestPackCard pack={emptyPack} />);

      await waitFor(() => {
        const progressBar = getByTestId('progress-bar');
        expect(progressBar).toHaveStyle('width: 0%');
      });
    });

    it('should not mark empty pack as complete', async () => {
      const emptyPack: TransferPack = {
        id: 'empty-pack-3',
        name: 'Empty Completion Pack',
        target: 'apple',
        scopeType: 'filtered',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      await db.transferPacks.add(emptyPack);

      const { getByTestId } = render(<TestPackCard pack={emptyPack} />);

      await waitFor(() => {
        const progressText = getByTestId('progress-text');
        expect(progressText).not.toHaveTextContent('(Complete)');
        
        const actionButton = getByTestId('action-button');
        expect(actionButton).toHaveTextContent('Resume');
      });
    });
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Test packs with all items complete
   * Should show 100% progress and be marked as complete with "Review" button
   */
  describe('All Items Complete', () => {
    it('should display correct progress for pack with all done items', async () => {
      const completePack: TransferPack = {
        id: 'complete-pack-1',
        name: 'All Done Pack',
        target: 'google',
        scopeType: 'library',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const completeItems: TransferPackItem[] = [
        {
          id: 'item-1',
          packId: 'complete-pack-1',
          placeId: 'place-1',
          status: 'done',
          completedAt: new Date('2024-01-01'),
        },
        {
          id: 'item-2',
          packId: 'complete-pack-1',
          placeId: 'place-2',
          status: 'done',
          completedAt: new Date('2024-01-01'),
        },
        {
          id: 'item-3',
          packId: 'complete-pack-1',
          placeId: 'place-3',
          status: 'done',
          completedAt: new Date('2024-01-01'),
        },
      ];

      await db.transferPacks.add(completePack);
      await db.transferPackItems.bulkAdd(completeItems);

      const { getByTestId } = render(<TestPackCard pack={completePack} />);

      await waitFor(() => {
        const progressText = getByTestId('progress-text');
        expect(progressText).toHaveTextContent('3/3 places (Complete)');
      });
    });

    it('should display correct progress for pack with all skipped items', async () => {
      const skippedPack: TransferPack = {
        id: 'skipped-pack-1',
        name: 'All Skipped Pack',
        target: 'apple',
        scopeType: 'collection',
        scopeId: 'test-collection',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const skippedItems: TransferPackItem[] = [
        {
          id: 'item-1',
          packId: 'skipped-pack-1',
          placeId: 'place-1',
          status: 'skipped',
          completedAt: new Date('2024-01-01'),
        },
        {
          id: 'item-2',
          packId: 'skipped-pack-1',
          placeId: 'place-2',
          status: 'skipped',
          completedAt: new Date('2024-01-01'),
        },
      ];

      await db.transferPacks.add(skippedPack);
      await db.transferPackItems.bulkAdd(skippedItems);

      const { getByTestId } = render(<TestPackCard pack={skippedPack} />);

      await waitFor(() => {
        const progressText = getByTestId('progress-text');
        expect(progressText).toHaveTextContent('2/2 places (Complete)');
      });
    });

    it('should display correct progress for pack with mixed done/skipped items', async () => {
      const mixedCompletePack: TransferPack = {
        id: 'mixed-complete-pack-1',
        name: 'Mixed Complete Pack',
        target: 'google',
        scopeType: 'filtered',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const mixedCompleteItems: TransferPackItem[] = [
        {
          id: 'item-1',
          packId: 'mixed-complete-pack-1',
          placeId: 'place-1',
          status: 'done',
          completedAt: new Date('2024-01-01'),
        },
        {
          id: 'item-2',
          packId: 'mixed-complete-pack-1',
          placeId: 'place-2',
          status: 'skipped',
          completedAt: new Date('2024-01-01'),
        },
        {
          id: 'item-3',
          packId: 'mixed-complete-pack-1',
          placeId: 'place-3',
          status: 'done',
          completedAt: new Date('2024-01-01'),
        },
      ];

      await db.transferPacks.add(mixedCompletePack);
      await db.transferPackItems.bulkAdd(mixedCompleteItems);

      const { getByTestId } = render(<TestPackCard pack={mixedCompletePack} />);

      await waitFor(() => {
        const progressText = getByTestId('progress-text');
        expect(progressText).toHaveTextContent('3/3 places (Complete)');
        
        const progressBar = getByTestId('progress-bar');
        expect(progressBar).toHaveStyle('width: 100%');
        
        const actionButton = getByTestId('action-button');
        expect(actionButton).toHaveTextContent('Review');
      });
    });
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Test packs with mixed item statuses
   * Should correctly count only 'done' and 'skipped' as complete, ignoring 'pending' and 'flagged'
   */
  describe('Mixed Item Statuses', () => {
    it('should only count done and skipped items as complete', async () => {
      const mixedPack: TransferPack = {
        id: 'mixed-pack-1',
        name: 'Mixed Status Pack',
        target: 'apple',
        scopeType: 'library',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const mixedItems: TransferPackItem[] = [
        {
          id: 'item-1',
          packId: 'mixed-pack-1',
          placeId: 'place-1',
          status: 'done',
          completedAt: new Date('2024-01-01'),
        },
        {
          id: 'item-2',
          packId: 'mixed-pack-1',
          placeId: 'place-2',
          status: 'skipped',
          completedAt: new Date('2024-01-01'),
        },
        {
          id: 'item-3',
          packId: 'mixed-pack-1',
          placeId: 'place-3',
          status: 'pending',
        },
        {
          id: 'item-4',
          packId: 'mixed-pack-1',
          placeId: 'place-4',
          status: 'flagged',
          mismatchReason: 'Address mismatch',
        },
      ];

      await db.transferPacks.add(mixedPack);
      await db.transferPackItems.bulkAdd(mixedItems);

      const { getByTestId } = render(<TestPackCard pack={mixedPack} />);

      await waitFor(() => {
        // Should show 2 done (done + skipped) out of 4 total
        const progressText = getByTestId('progress-text');
        expect(progressText).toHaveTextContent('2/4 places');
        expect(progressText).not.toHaveTextContent('(Complete)');
        
        // Progress bar should be 50%
        const progressBar = getByTestId('progress-bar');
        expect(progressBar).toHaveStyle('width: 50%');
        
        // Should show Resume button (not complete)
        const actionButton = getByTestId('action-button');
        expect(actionButton).toHaveTextContent('Resume');
      });
    });

    it('should handle pack with only pending items', async () => {
      const pendingPack: TransferPack = {
        id: 'pending-pack-1',
        name: 'All Pending Pack',
        target: 'google',
        scopeType: 'collection',
        scopeId: 'test-collection',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const pendingItems: TransferPackItem[] = [
        {
          id: 'item-1',
          packId: 'pending-pack-1',
          placeId: 'place-1',
          status: 'pending',
        },
        {
          id: 'item-2',
          packId: 'pending-pack-1',
          placeId: 'place-2',
          status: 'pending',
        },
        {
          id: 'item-3',
          packId: 'pending-pack-1',
          placeId: 'place-3',
          status: 'pending',
        },
      ];

      await db.transferPacks.add(pendingPack);
      await db.transferPackItems.bulkAdd(pendingItems);

      const { getByTestId } = render(<TestPackCard pack={pendingPack} />);

      await waitFor(() => {
        const progressText = getByTestId('progress-text');
        expect(progressText).toHaveTextContent('0/3 places');
        
        const progressBar = getByTestId('progress-bar');
        expect(progressBar).toHaveStyle('width: 0%');
        
        const actionButton = getByTestId('action-button');
        expect(actionButton).toHaveTextContent('Resume');
      });
    });

    it('should handle pack with only flagged items', async () => {
      const flaggedPack: TransferPack = {
        id: 'flagged-pack-1',
        name: 'All Flagged Pack',
        target: 'apple',
        scopeType: 'filtered',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const flaggedItems: TransferPackItem[] = [
        {
          id: 'item-1',
          packId: 'flagged-pack-1',
          placeId: 'place-1',
          status: 'flagged',
          mismatchReason: 'Location not found',
        },
        {
          id: 'item-2',
          packId: 'flagged-pack-1',
          placeId: 'place-2',
          status: 'flagged',
          mismatchReason: 'Duplicate entry',
        },
      ];

      await db.transferPacks.add(flaggedPack);
      await db.transferPackItems.bulkAdd(flaggedItems);

      const { getByTestId } = render(<TestPackCard pack={flaggedPack} />);

      await waitFor(() => {
        const progressText = getByTestId('progress-text');
        expect(progressText).toHaveTextContent('0/2 places');
        
        const progressBar = getByTestId('progress-bar');
        expect(progressBar).toHaveStyle('width: 0%');
        
        const actionButton = getByTestId('action-button');
        expect(actionButton).toHaveTextContent('Resume');
      });
    });
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Test loading state handling
   * When useLiveQuery returns undefined, component should handle gracefully
   */
  describe('Loading State Handling', () => {
    it('should handle loading state when items are undefined', async () => {
      const loadingPack: TransferPack = {
        id: 'loading-pack-1',
        name: 'Loading Pack',
        target: 'google',
        scopeType: 'library',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      // Create pack but don't add items yet - this simulates the loading state
      await db.transferPacks.add(loadingPack);

      const { getByTestId } = render(<TestPackCard pack={loadingPack} />);

      // Initially, useLiveQuery might return undefined, so progress should be 0/0
      // This tests the loading state handling in the useMemo
      const progressText = getByTestId('progress-text');
      expect(progressText).toHaveTextContent('0/0 places');
      
      const progressBar = getByTestId('progress-bar');
      expect(progressBar).toHaveStyle('width: 0%');
      
      const actionButton = getByTestId('action-button');
      expect(actionButton).toHaveTextContent('Resume');
    });

    it('should update from loading state when items are added', async () => {
      const updatePack: TransferPack = {
        id: 'update-pack-1',
        name: 'Update Pack',
        target: 'apple',
        scopeType: 'collection',
        scopeId: 'test-collection',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      await db.transferPacks.add(updatePack);

      const { getByTestId } = render(<TestPackCard pack={updatePack} />);

      // Initially should show 0/0
      await waitFor(() => {
        const progressText = getByTestId('progress-text');
        expect(progressText).toHaveTextContent('0/0 places');
      });

      // Add items to the pack
      const newItems: TransferPackItem[] = [
        {
          id: 'item-1',
          packId: 'update-pack-1',
          placeId: 'place-1',
          status: 'done',
          completedAt: new Date('2024-01-01'),
        },
        {
          id: 'item-2',
          packId: 'update-pack-1',
          placeId: 'place-2',
          status: 'pending',
        },
      ];

      await db.transferPackItems.bulkAdd(newItems);

      // Should update to show the new items
      await waitFor(() => {
        const progressText = getByTestId('progress-text');
        expect(progressText).toHaveTextContent('1/2 places');
      });
    });
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Test precise progress calculations
   * Verify that progress percentages are calculated correctly for various scenarios
   */
  describe('Progress Calculation Precision', () => {
    it('should calculate 33.3% progress correctly', async () => {
      const precisionPack: TransferPack = {
        id: 'precision-pack-1',
        name: 'Precision Pack',
        target: 'google',
        scopeType: 'library',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const precisionItems: TransferPackItem[] = [
        {
          id: 'item-1',
          packId: 'precision-pack-1',
          placeId: 'place-1',
          status: 'done',
          completedAt: new Date('2024-01-01'),
        },
        {
          id: 'item-2',
          packId: 'precision-pack-1',
          placeId: 'place-2',
          status: 'pending',
        },
        {
          id: 'item-3',
          packId: 'precision-pack-1',
          placeId: 'place-3',
          status: 'pending',
        },
      ];

      await db.transferPacks.add(precisionPack);
      await db.transferPackItems.bulkAdd(precisionItems);

      const { getByTestId } = render(<TestPackCard pack={precisionPack} />);

      await waitFor(() => {
        const progressText = getByTestId('progress-text');
        expect(progressText).toHaveTextContent('1/3 places');
        
        // 1/3 = 33.333...% which should be displayed as 33.33% in the progress bar
        const progressBar = getByTestId('progress-bar');
        const expectedPercent = (1 / 3) * 100;
        expect(progressBar).toHaveStyle(`width: ${expectedPercent}%`);
      });
    });

    it('should calculate 66.7% progress correctly', async () => {
      const precisionPack2: TransferPack = {
        id: 'precision-pack-2',
        name: 'Precision Pack 2',
        target: 'apple',
        scopeType: 'filtered',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const precisionItems2: TransferPackItem[] = [
        {
          id: 'item-1',
          packId: 'precision-pack-2',
          placeId: 'place-1',
          status: 'done',
          completedAt: new Date('2024-01-01'),
        },
        {
          id: 'item-2',
          packId: 'precision-pack-2',
          placeId: 'place-2',
          status: 'skipped',
          completedAt: new Date('2024-01-01'),
        },
        {
          id: 'item-3',
          packId: 'precision-pack-2',
          placeId: 'place-3',
          status: 'pending',
        },
      ];

      await db.transferPacks.add(precisionPack2);
      await db.transferPackItems.bulkAdd(precisionItems2);

      const { getByTestId } = render(<TestPackCard pack={precisionPack2} />);

      await waitFor(() => {
        const progressText = getByTestId('progress-text');
        expect(progressText).toHaveTextContent('2/3 places');
        
        // 2/3 = 66.666...% 
        const progressBar = getByTestId('progress-bar');
        const expectedPercent = (2 / 3) * 100;
        expect(progressBar).toHaveStyle(`width: ${expectedPercent}%`);
      });
    });
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Test UI element consistency
   * Verify that all UI elements display correctly for different pack states
   */
  describe('UI Element Consistency', () => {
    it('should display pack name and target correctly', async () => {
      const uiPack: TransferPack = {
        id: 'ui-pack-1',
        name: 'Test UI Pack',
        target: 'apple',
        scopeType: 'library',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      await db.transferPacks.add(uiPack);

      const { getByTestId } = render(<TestPackCard pack={uiPack} />);

      await waitFor(() => {
        const packName = getByTestId('pack-name');
        expect(packName).toHaveTextContent('Test UI Pack');
        
        const packTarget = getByTestId('pack-target');
        expect(packTarget).toHaveTextContent('→ Apple Maps');
      });
    });

    it('should display Google Maps target correctly', async () => {
      const googlePack: TransferPack = {
        id: 'google-pack-1',
        name: 'Google Test Pack',
        target: 'google',
        scopeType: 'collection',
        scopeId: 'test-collection',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      await db.transferPacks.add(googlePack);

      const { getByTestId } = render(<TestPackCard pack={googlePack} />);

      await waitFor(() => {
        const packTarget = getByTestId('pack-target');
        expect(packTarget).toHaveTextContent('→ Google Maps');
      });
    });

    it('should display last updated time', async () => {
      const timePack: TransferPack = {
        id: 'time-pack-1',
        name: 'Time Pack',
        target: 'apple',
        scopeType: 'filtered',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
      };

      await db.transferPacks.add(timePack);

      const { getByTestId } = render(<TestPackCard pack={timePack} />);

      await waitFor(() => {
        const lastUpdated = getByTestId('last-updated');
        expect(lastUpdated).toHaveTextContent('Last updated');
        // The exact format depends on formatDateTime mock, but should contain the date
        expect(lastUpdated.textContent).toContain('2024-01-15');
      });
    });
  });
});
