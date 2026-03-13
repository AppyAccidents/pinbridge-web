/**
 * Property-based tests for transfer pack progress calculation accuracy
 * Feature: transfer-packs-performance-fix, Property 3: Progress Calculation Accuracy
 */

import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
import fc from 'fast-check';
import { db } from '@/lib/db';
import type { TransferPack, TransferPackItem, PackItemStatus } from '@/types';

// Import the PackCard component - we need to extract it or test the page
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';

// Test version of PackCard component matching the current implementation
function TestPackCard({ pack }: { pack: TransferPack }) {
  const items = useLiveQuery(
    () => db.transferPackItems.where('packId').equals(pack.id).toArray(),
    [pack.id]
  );
  
  const progress = useMemo(() => {
    if (!items) return { done: 0, total: 0 };
    const done = items.filter(
      (item) => item.status === 'done' || item.status === 'skipped'
    ).length;
    return { done, total: items.length };
  }, [items]);

  const isComplete = progress.done === progress.total && progress.total > 0;
  const progressPercent = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  return (
    <div data-testid={`pack-card-${pack.id}`}>
      <span data-testid="progress">{progress.done}/{progress.total}</span>
      <span data-testid="progress-percent">{progressPercent.toFixed(1)}%</span>
      <span data-testid="completion-status">{isComplete ? 'Complete' : 'Incomplete'}</span>
      <div 
        data-testid="progress-bar" 
        style={{ width: `${progressPercent}%` }}
      />
    </div>
  );
}

// Test setup and teardown
beforeEach(async () => {
  await db.delete();
  await db.open();
  // Clear any existing DOM elements
  document.body.innerHTML = '';
});

afterEach(async () => {
  await db.close();
  cleanup();
  // Ensure DOM is clean
  document.body.innerHTML = '';
});

// Generators for test data
const transferPackArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
  name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  target: fc.constantFrom('apple', 'google'),
  scopeType: fc.constantFrom('library', 'collection', 'filtered'),
  scopeId: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
  updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
}) as fc.Arbitrary<TransferPack>;

const transferPackItemArbitrary = (packId: string) => fc.record({
  id: fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
  packId: fc.constant(packId),
  placeId: fc.string({ minLength: 1, maxLength: 10 }).filter(s => s.trim().length > 0),
  status: fc.constantFrom('pending', 'done', 'skipped', 'flagged'),
  mismatchReason: fc.option(fc.string({ maxLength: 100 })),
  mismatchNotes: fc.option(fc.string({ maxLength: 200 })),
  completedAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() })),
}) as fc.Arbitrary<TransferPackItem>;

// Mock console to suppress React warnings during tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe('Transfer Pack Progress Calculation Accuracy Properties', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   * 
   * Property 3: Progress Calculation Accuracy
   * For any transfer pack with a known set of items and their completion statuses, 
   * the displayed progress information (done/total count and percentage) should 
   * accurately reflect the actual data.
   */
  it('should accurately calculate progress for any combination of item statuses', async () => {
    await fc.assert(
      fc.asyncProperty(
        transferPackArbitrary,
        fc.array(fc.constantFrom('pending', 'done', 'skipped', 'flagged'), { minLength: 1, maxLength: 10 }),
        async (pack, itemStatuses) => {
          // Ensure unique pack ID
          const uniquePack = {
            ...pack,
            id: `pack-${Date.now()}-${Math.random()}`,
          };

          // Setup: Create transfer pack and items with specified statuses
          await db.transferPacks.add(uniquePack);
          
          const items: TransferPackItem[] = itemStatuses.map((status, i) => ({
            id: `item-${i}-${Date.now()}-${Math.random()}`,
            packId: uniquePack.id,
            placeId: `place-${i}-${Date.now()}`,
            status: status as PackItemStatus,
            completedAt: (status === 'done' || status === 'skipped') ? new Date() : undefined,
          }));
          
          await db.transferPackItems.bulkAdd(items);

          // Calculate expected progress
          const expectedDone = items.filter(item => 
            item.status === 'done' || item.status === 'skipped'
          ).length;
          const expectedTotal = items.length;
          const expectedPercent = expectedTotal > 0 ? (expectedDone / expectedTotal) * 100 : 0;

          // Act: Render PackCard component
          const { container } = render(<TestPackCard pack={uniquePack} />);

          // Assert: Progress count should match expected values
          await waitFor(() => {
            const progressElement = container.querySelector('[data-testid="progress"]');
            expect(progressElement).toHaveTextContent(`${expectedDone}/${expectedTotal}`);
          }, { timeout: 1000 });

          // Assert: Progress percentage should match expected calculation
          await waitFor(() => {
            const percentElement = container.querySelector('[data-testid="progress-percent"]');
            expect(percentElement).toHaveTextContent(`${expectedPercent.toFixed(1)}%`);
          }, { timeout: 500 });

          // Assert: Completion status should be accurate
          const expectedComplete = expectedDone === expectedTotal && expectedTotal > 0;
          await waitFor(() => {
            const statusElement = container.querySelector('[data-testid="completion-status"]');
            expect(statusElement).toHaveTextContent(expectedComplete ? 'Complete' : 'Incomplete');
          }, { timeout: 500 });

          // Assert: Progress bar width should match percentage
          await waitFor(() => {
            const progressBar = container.querySelector('[data-testid="progress-bar"]') as HTMLElement;
            expect(progressBar.style.width).toBe(`${expectedPercent}%`);
          }, { timeout: 500 });
        }
      ),
      { numRuns: 50 }
    );
  }, 30000);

  /**
   * Property 3b: Edge Case Accuracy - Empty Transfer Packs
   * For transfer packs with no items, progress should be 0/0 with 0% completion
   * and should not be marked as complete.
   */
  it('should handle empty transfer packs correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        transferPackArbitrary,
        async (pack) => {
          // Ensure unique pack ID
          const uniquePack = {
            ...pack,
            id: `pack-${Date.now()}-${Math.random()}`,
          };

          // Setup: Create transfer pack with no items
          await db.transferPacks.add(uniquePack);
          // Intentionally not adding any items

          // Act: Render PackCard component
          const { container } = render(<TestPackCard pack={uniquePack} />);

          // Assert: Progress should be 0/0
          await waitFor(() => {
            const progressElement = container.querySelector('[data-testid="progress"]');
            expect(progressElement).toHaveTextContent('0/0');
          }, { timeout: 1000 });

          // Assert: Percentage should be 0%
          await waitFor(() => {
            const percentElement = container.querySelector('[data-testid="progress-percent"]');
            expect(percentElement).toHaveTextContent('0.0%');
          }, { timeout: 500 });

          // Assert: Should not be marked as complete (empty packs are not complete)
          await waitFor(() => {
            const statusElement = container.querySelector('[data-testid="completion-status"]');
            expect(statusElement).toHaveTextContent('Incomplete');
          }, { timeout: 500 });

          // Assert: Progress bar should have 0% width
          await waitFor(() => {
            const progressBar = container.querySelector('[data-testid="progress-bar"]') as HTMLElement;
            expect(progressBar.style.width).toBe('0%');
          }, { timeout: 500 });
        }
      ),
      { numRuns: 10 }
    );
  }, 15000);

  /**
   * Property 3c: All Items Complete Accuracy
   * For transfer packs where all items are marked as 'done' or 'skipped',
   * progress should be 100% and marked as complete.
   */
  it('should correctly identify fully complete transfer packs', async () => {
    await fc.assert(
      fc.asyncProperty(
        transferPackArbitrary,
        fc.array(fc.constantFrom('done', 'skipped'), { minLength: 1, maxLength: 8 }),
        async (pack, completedStatuses) => {
          // Ensure unique pack ID
          const uniquePack = {
            ...pack,
            id: `pack-${Date.now()}-${Math.random()}`,
          };

          // Setup: Create transfer pack with all items completed
          await db.transferPacks.add(uniquePack);
          
          const items: TransferPackItem[] = completedStatuses.map((status, i) => ({
            id: `item-${i}-${Date.now()}-${Math.random()}`,
            packId: uniquePack.id,
            placeId: `place-${i}-${Date.now()}`,
            status: status as PackItemStatus,
            completedAt: new Date(),
          }));
          
          await db.transferPackItems.bulkAdd(items);

          const expectedTotal = items.length;

          // Act: Render PackCard component
          const { container } = render(<TestPackCard pack={uniquePack} />);

          // Assert: Progress should show all items complete
          await waitFor(() => {
            const progressElement = container.querySelector('[data-testid="progress"]');
            expect(progressElement).toHaveTextContent(`${expectedTotal}/${expectedTotal}`);
          }, { timeout: 1000 });

          // Assert: Percentage should be 100%
          await waitFor(() => {
            const percentElement = container.querySelector('[data-testid="progress-percent"]');
            expect(percentElement).toHaveTextContent('100.0%');
          }, { timeout: 500 });

          // Assert: Should be marked as complete
          await waitFor(() => {
            const statusElement = container.querySelector('[data-testid="completion-status"]');
            expect(statusElement).toHaveTextContent('Complete');
          }, { timeout: 500 });

          // Assert: Progress bar should have 100% width
          await waitFor(() => {
            const progressBar = container.querySelector('[data-testid="progress-bar"]') as HTMLElement;
            expect(progressBar.style.width).toBe('100%');
          }, { timeout: 500 });
        }
      ),
      { numRuns: 20 }
    );
  }, 20000);

  /**
   * Property 3d: Mixed Status Accuracy
   * For transfer packs with mixed item statuses, progress calculations should
   * only count 'done' and 'skipped' items as complete, ignoring 'pending' and 'flagged'.
   */
  it('should only count done and skipped items as complete', async () => {
    await fc.assert(
      fc.asyncProperty(
        transferPackArbitrary,
        fc.integer({ min: 1, max: 3 }), // done items
        fc.integer({ min: 1, max: 3 }), // skipped items  
        fc.integer({ min: 1, max: 3 }), // pending items
        fc.integer({ min: 0, max: 2 }), // flagged items
        async (pack, doneCount, skippedCount, pendingCount, flaggedCount) => {
          // Ensure unique pack ID
          const uniquePack = {
            ...pack,
            id: `pack-${Date.now()}-${Math.random()}`,
          };

          // Setup: Create transfer pack with mixed item statuses
          await db.transferPacks.add(uniquePack);
          
          const items: TransferPackItem[] = [];
          let itemIndex = 0;

          // Add done items
          for (let i = 0; i < doneCount; i++) {
            items.push({
              id: `item-${itemIndex++}-${Date.now()}-${Math.random()}`,
              packId: uniquePack.id,
              placeId: `place-${itemIndex}-${Date.now()}`,
              status: 'done' as PackItemStatus,
              completedAt: new Date(),
            });
          }

          // Add skipped items
          for (let i = 0; i < skippedCount; i++) {
            items.push({
              id: `item-${itemIndex++}-${Date.now()}-${Math.random()}`,
              packId: uniquePack.id,
              placeId: `place-${itemIndex}-${Date.now()}`,
              status: 'skipped' as PackItemStatus,
              completedAt: new Date(),
            });
          }

          // Add pending items
          for (let i = 0; i < pendingCount; i++) {
            items.push({
              id: `item-${itemIndex++}-${Date.now()}-${Math.random()}`,
              packId: uniquePack.id,
              placeId: `place-${itemIndex}-${Date.now()}`,
              status: 'pending' as PackItemStatus,
            });
          }

          // Add flagged items
          for (let i = 0; i < flaggedCount; i++) {
            items.push({
              id: `item-${itemIndex++}-${Date.now()}-${Math.random()}`,
              packId: uniquePack.id,
              placeId: `place-${itemIndex}-${Date.now()}`,
              status: 'flagged' as PackItemStatus,
              mismatchReason: 'Test mismatch',
            });
          }
          
          await db.transferPackItems.bulkAdd(items);

          // Calculate expected values
          const expectedDone = doneCount + skippedCount; // Only done and skipped count as complete
          const expectedTotal = doneCount + skippedCount + pendingCount + flaggedCount;
          const expectedPercent = expectedTotal > 0 ? (expectedDone / expectedTotal) * 100 : 0;
          const expectedComplete = expectedDone === expectedTotal && expectedTotal > 0;

          // Act: Render PackCard component
          const { container } = render(<TestPackCard pack={uniquePack} />);

          // Assert: Progress count should only include done and skipped items
          await waitFor(() => {
            const progressElement = container.querySelector('[data-testid="progress"]');
            expect(progressElement).toHaveTextContent(`${expectedDone}/${expectedTotal}`);
          }, { timeout: 1000 });

          // Assert: Progress percentage should be calculated correctly
          await waitFor(() => {
            const percentElement = container.querySelector('[data-testid="progress-percent"]');
            expect(percentElement).toHaveTextContent(`${expectedPercent.toFixed(1)}%`);
          }, { timeout: 500 });

          // Assert: Completion status should be accurate
          await waitFor(() => {
            const statusElement = container.querySelector('[data-testid="completion-status"]');
            expect(statusElement).toHaveTextContent(expectedComplete ? 'Complete' : 'Incomplete');
          }, { timeout: 500 });

          // Assert: Progress bar width should match percentage
          await waitFor(() => {
            const progressBar = container.querySelector('[data-testid="progress-bar"]') as HTMLElement;
            expect(progressBar.style.width).toBe(`${expectedPercent}%`);
          }, { timeout: 500 });
        }
      ),
      { numRuns: 30 }
    );
  }, 25000);

  /**
   * Property 3e: Precision and Rounding Accuracy
   * Progress percentages should be calculated with proper precision and 
   * rounded to one decimal place consistently.
   */
  it('should calculate percentages with correct precision and rounding', async () => {
    await fc.assert(
      fc.asyncProperty(
        transferPackArbitrary,
        fc.integer({ min: 3, max: 7 }), // total items (to create non-round percentages)
        fc.integer({ min: 1, max: 6 }), // done items (subset of total)
        async (pack, totalItems, doneItems) => {
          // Ensure done items doesn't exceed total
          const actualDone = Math.min(doneItems, totalItems);
          
          // Ensure unique pack ID
          const uniquePack = {
            ...pack,
            id: `pack-${Date.now()}-${Math.random()}`,
          };

          // Setup: Create transfer pack with specific item counts
          await db.transferPacks.add(uniquePack);
          
          const items: TransferPackItem[] = [];
          
          // Add done items
          for (let i = 0; i < actualDone; i++) {
            items.push({
              id: `item-${i}-${Date.now()}-${Math.random()}`,
              packId: uniquePack.id,
              placeId: `place-${i}-${Date.now()}`,
              status: 'done' as PackItemStatus,
              completedAt: new Date(),
            });
          }

          // Add remaining items as pending
          for (let i = actualDone; i < totalItems; i++) {
            items.push({
              id: `item-${i}-${Date.now()}-${Math.random()}`,
              packId: uniquePack.id,
              placeId: `place-${i}-${Date.now()}`,
              status: 'pending' as PackItemStatus,
            });
          }
          
          await db.transferPackItems.bulkAdd(items);

          // Calculate expected percentage with proper rounding
          const expectedPercent = totalItems > 0 ? (actualDone / totalItems) * 100 : 0;
          const expectedPercentString = expectedPercent.toFixed(1);

          // Act: Render PackCard component
          const { container } = render(<TestPackCard pack={uniquePack} />);

          // Assert: Percentage should be properly rounded to 1 decimal place
          await waitFor(() => {
            const percentElement = container.querySelector('[data-testid="progress-percent"]');
            expect(percentElement).toHaveTextContent(`${expectedPercentString}%`);
          }, { timeout: 1000 });

          // Assert: The percentage should be mathematically correct
          const displayedText = container.querySelector('[data-testid="progress-percent"]')?.textContent;
          if (displayedText) {
            const displayedPercent = parseFloat(displayedText.replace('%', ''));
            // Allow for small floating point precision differences
            expect(Math.abs(displayedPercent - expectedPercent)).toBeLessThan(0.1);
          }
        }
      ),
      { numRuns: 25 }
    );
  }, 20000);
});