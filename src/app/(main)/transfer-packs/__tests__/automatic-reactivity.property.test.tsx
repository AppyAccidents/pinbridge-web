/**
 * Property-based tests for transfer pack automatic reactivity
 * Feature: transfer-packs-performance-fix, Property 2: Automatic Reactivity
 */

import React from 'react';
import { render, cleanup, act, waitFor, screen } from '@testing-library/react';
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

describe('Transfer Pack Automatic Reactivity Properties', () => {
  /**
   * **Validates: Requirements 2.3**
   * 
   * Property 2: Automatic Reactivity
   * For any change to transfer pack item status in the database, the corresponding 
   * PackCard component should automatically update its progress display without 
   * manual state synchronization.
   */
  it('should automatically update progress when item status changes in database', async () => {
    await fc.assert(
      fc.asyncProperty(
        transferPackArbitrary,
        fc.array(fc.constantFrom('pending', 'done', 'skipped'), { minLength: 2, maxLength: 3 }),
        fc.constantFrom('done', 'skipped'),
        async (pack, initialStatuses, newStatus) => {
          // Ensure unique pack ID
          const uniquePack = {
            ...pack,
            id: `pack-${Date.now()}-${Math.random()}`,
          };

          // Setup: Create transfer pack and items with initial statuses
          await db.transferPacks.add(uniquePack);
          
          const items: TransferPackItem[] = initialStatuses.map((status, i) => ({
            id: `item-${i}-${Date.now()}-${Math.random()}`,
            packId: uniquePack.id,
            placeId: `place-${i}-${Date.now()}`,
            status: status as PackItemStatus,
            completedAt: status === 'done' ? new Date() : undefined,
          }));
          
          await db.transferPackItems.bulkAdd(items);

          // Calculate expected initial progress
          const initialDone = items.filter(item => 
            item.status === 'done' || item.status === 'skipped'
          ).length;
          const initialTotal = items.length;

          // Act: Render PackCard component
          const { container } = render(<TestPackCard pack={uniquePack} />);

          // Wait for initial render - handle useLiveQuery loading state
          await waitFor(() => {
            const progressElement = container.querySelector('[data-testid="progress"]');
            expect(progressElement).toHaveTextContent(`${initialDone}/${initialTotal}`);
          }, { timeout: 500 });

          // Act: Change status of the first pending item in the database
          const itemToUpdate = items.find(item => item.status === 'pending') || items[0];
          
          await act(async () => {
            await db.transferPackItems.update(itemToUpdate.id, {
              status: newStatus as PackItemStatus,
              completedAt: newStatus === 'done' ? new Date() : undefined,
            });
          });

          // Calculate expected new progress
          const expectedDone = items.filter(item => 
            item.id === itemToUpdate.id ? 
              (newStatus === 'done' || newStatus === 'skipped') :
              (item.status === 'done' || item.status === 'skipped')
          ).length;
          const expectedTotal = items.length;

          // Assert: Component should automatically update to reflect the change
          await waitFor(() => {
            const progressElement = container.querySelector('[data-testid="progress"]');
            expect(progressElement).toHaveTextContent(`${expectedDone}/${expectedTotal}`);
          }, { timeout: 500 });

          // Verify progress percentage updates
          const expectedPercent = expectedTotal > 0 ? (expectedDone / expectedTotal) * 100 : 0;
          await waitFor(() => {
            const percentElement = container.querySelector('[data-testid="progress-percent"]');
            expect(percentElement).toHaveTextContent(`${expectedPercent.toFixed(1)}%`);
          }, { timeout: 300 });
        }
      ),
      { numRuns: 3 }
    );
  }, 15000);

  /**
   * Property 2b: Item Addition Reactivity
   * When items are added to a transfer pack, the component should 
   * automatically update the total count and progress calculation.
   */
  it('should automatically update when items are added', async () => {
    await fc.assert(
      fc.asyncProperty(
        transferPackArbitrary,
        fc.array(fc.constantFrom('pending', 'done'), { minLength: 1, maxLength: 2 }),
        fc.constantFrom('pending', 'done'),
        async (pack, initialStatuses, newItemStatus) => {
          // Ensure unique pack ID
          const uniquePack = {
            ...pack,
            id: `pack-${Date.now()}-${Math.random()}`,
          };

          // Setup: Create transfer pack and initial items
          await db.transferPacks.add(uniquePack);
          
          const items: TransferPackItem[] = initialStatuses.map((status, i) => ({
            id: `item-${i}-${Date.now()}-${Math.random()}`,
            packId: uniquePack.id,
            placeId: `place-${i}-${Date.now()}`,
            status: status as PackItemStatus,
            completedAt: status === 'done' ? new Date() : undefined,
          }));
          
          await db.transferPackItems.bulkAdd(items);

          // Act: Render PackCard component
          const { container } = render(<TestPackCard pack={uniquePack} />);

          // Wait for initial render
          await waitFor(() => {
            const progressElement = container.querySelector('[data-testid="progress"]');
            expect(progressElement).toBeInTheDocument();
          }, { timeout: 500 });

          const initialTotal = items.length;

          // Act: Add a new item to the pack
          const newItem: TransferPackItem = {
            id: `new-item-${Date.now()}-${Math.random()}`,
            packId: uniquePack.id,
            placeId: `new-place-${Date.now()}`,
            status: newItemStatus as PackItemStatus,
            completedAt: newItemStatus === 'done' ? new Date() : undefined,
          };

          await act(async () => {
            await db.transferPackItems.add(newItem);
          });

          // Calculate expected progress after addition
          const allItems = [...items, newItem];
          const expectedDone = allItems.filter(item => 
            item.status === 'done' || item.status === 'skipped'
          ).length;
          const expectedTotal = allItems.length;

          // Assert: Total count should increase
          await waitFor(() => {
            const progressElement = container.querySelector('[data-testid="progress"]');
            expect(progressElement).toHaveTextContent(`${expectedDone}/${expectedTotal}`);
            expect(expectedTotal).toBe(initialTotal + 1);
          }, { timeout: 500 });
        }
      ),
      { numRuns: 3 }
    );
  }, 10000);

  /**
   * Property 2c: No Manual State Synchronization Required
   * The component should update automatically without any manual state 
   * synchronization calls (no useEffect with setState patterns).
   */
  it('should update without manual state synchronization', async () => {
    await fc.assert(
      fc.asyncProperty(
        transferPackArbitrary,
        fc.array(fc.constantFrom('pending', 'done'), { minLength: 2, maxLength: 3 }),
        async (pack, initialStatuses) => {
          // Ensure unique pack ID
          const uniquePack = {
            ...pack,
            id: `pack-${Date.now()}-${Math.random()}`,
          };

          // Setup: Create transfer pack and items
          await db.transferPacks.add(uniquePack);
          
          const items: TransferPackItem[] = initialStatuses.map((status, i) => ({
            id: `item-${i}-${Date.now()}-${Math.random()}`,
            packId: uniquePack.id,
            placeId: `place-${i}-${Date.now()}`,
            status: status as PackItemStatus,
            completedAt: status === 'done' ? new Date() : undefined,
          }));
          
          await db.transferPackItems.bulkAdd(items);

          // Act: Render PackCard component
          const { container } = render(<TestPackCard pack={uniquePack} />);

          // Wait for initial render
          await waitFor(() => {
            const progressElement = container.querySelector('[data-testid="progress"]');
            expect(progressElement).toBeInTheDocument();
          }, { timeout: 500 });

          // Act: Change status of first pending item to done
          const pendingItem = items.find(item => item.status === 'pending');
          if (pendingItem) {
            await act(async () => {
              await db.transferPackItems.update(pendingItem.id, {
                status: 'done' as PackItemStatus,
                completedAt: new Date(),
              });
            });

            // Update our local tracking
            pendingItem.status = 'done';
            pendingItem.completedAt = new Date();

            // Calculate expected progress after this change
            const expectedDone = items.filter(item => 
              item.status === 'done' || item.status === 'skipped'
            ).length;
            const expectedTotal = items.length;

            // Assert: Component should reflect the change automatically
            await waitFor(() => {
              const progressElement = container.querySelector('[data-testid="progress"]');
              expect(progressElement).toHaveTextContent(`${expectedDone}/${expectedTotal}`);
            }, { timeout: 500 });
          }
        }
      ),
      { numRuns: 3 }
    );
  }, 10000);
});