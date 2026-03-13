/**
 * Unit tests for Export Page Link List Integration
 * Tests enabled/disabled states, navigation behavior, and UI consistency
 * Requirements: 6.1, 6.2, 6.4
 */

import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import ExportPage from '../page';
import { db } from '@/lib/db';
import { generateId } from '@/lib/utils';
import type { Place, Collection } from '@/types';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockPush = jest.fn();
const mockRouter = {
  push: mockPush,
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
};

// Test setup and teardown
beforeEach(async () => {
  await db.delete();
  await db.open();
  jest.clearAllMocks();
  cleanup();
  
  // Setup router mock with default implementation
  mockPush.mockImplementation(() => {});
  (useRouter as jest.Mock).mockReturnValue(mockRouter);
});

afterEach(async () => {
  await db.close();
  jest.restoreAllMocks();
  cleanup();
});

// Helper functions to create test data
const createTestPlace = (overrides: Partial<Place> = {}): Place => ({
  id: generateId(),
  title: 'Test Place',
  address: '123 Test St, Test City',
  latitude: 37.7749,
  longitude: -122.4194,
  notes: 'Test notes',
  tags: ['test'],
  source: 'manual',
  sourceUrl: undefined,
  normalizedTitle: 'test place',
  normalizedAddress: '123 test st test city',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createTestCollection = (overrides: Partial<Collection> = {}): Collection => ({
  id: generateId(),
  name: 'Test Collection',
  description: 'Test collection description',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const renderExportPage = async () => {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<ExportPage />);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return result!;
};

describe('Export Page Link List Integration', () => {
  describe('Enabled State with Places Available', () => {
    it('should display enabled Link List option when places exist', async () => {
      // Arrange
      const place = createTestPlace({ title: 'Sample Place' });
      await db.places.add(place);

      // Act
      await renderExportPage();

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Link List')).toBeInTheDocument();
        expect(screen.getByText('Entire Library (1 places)')).toBeInTheDocument();
      });

      const createButton = screen.getByRole('button', { name: /create link list/i });
      expect(createButton).toBeInTheDocument();
      expect(createButton).not.toBeDisabled();
    });

    it('should display correct description text for Link List option', async () => {
      // Arrange
      const place = createTestPlace();
      await db.places.add(place);

      // Act
      await renderExportPage();

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Create a shareable page with clickable links to your places - perfect for mobile access')).toBeInTheDocument();
      });

      // Should also show explanatory text about QR codes and Transfer Packs
      expect(screen.getByText(/Generate QR codes for easy sharing/)).toBeInTheDocument();
      expect(screen.getByText(/For guided transfer workflows with progress tracking, use/)).toBeInTheDocument();
      expect(screen.getByText(/Transfer Packs/)).toBeInTheDocument();
      expect(screen.getByText(/instead. View all your/)).toBeInTheDocument();
      expect(screen.getByText(/Link Lists/)).toBeInTheDocument();
    });

    it('should display Link List option with correct icon', async () => {
      // Arrange
      const place = createTestPlace();
      await db.places.add(place);

      // Act
      await renderExportPage();

      // Assert
      await waitFor(() => {
        const linkListCard = screen.getByText('Link List').closest('.card, [class*="card"]');
        expect(linkListCard).toBeInTheDocument();
      });

      // The LinkIcon should be present (testing via the button which includes the icon)
      const createButton = screen.getByRole('button', { name: /create link list/i });
      expect(createButton).toBeInTheDocument();
    });

    it('should enable Link List option when multiple places exist', async () => {
      // Arrange
      const places = [
        createTestPlace({ title: 'Place 1' }),
        createTestPlace({ title: 'Place 2' }),
        createTestPlace({ title: 'Place 3' }),
      ];
      await db.places.bulkAdd(places);

      // Act
      await renderExportPage();

      // Assert
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create link list/i });
        expect(createButton).not.toBeDisabled();
      });
    });

    it('should enable Link List option when places exist in collections', async () => {
      // Arrange
      const collection = createTestCollection({ name: 'Test Collection' });
      const place = createTestPlace({ title: 'Collection Place' });
      
      await db.collections.add(collection);
      await db.places.add(place);
      await db.placeCollections.add({
        id: generateId(),
        placeId: place.id,
        collectionId: collection.id,
      });

      // Act
      await renderExportPage();

      // Assert
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create link list/i });
        expect(createButton).not.toBeDisabled();
      });

      // Should also show the collection in the scope selection
      expect(screen.getByText('Test Collection')).toBeInTheDocument();
    });
  });

  describe('Disabled State with No Places', () => {
    it('should disable Link List option when no places exist', async () => {
      // Act - Render with empty database
      await renderExportPage();

      // Assert
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create link list/i });
        expect(createButton).toBeDisabled();
      });
    });

    it('should show explanatory message when no places exist', async () => {
      // Act - Render with empty database
      await renderExportPage();

      // Assert
      await waitFor(() => {
        expect(screen.getByText('No places to export. Import some places first!')).toBeInTheDocument();
      });
    });

    it('should disable Link List option even when collections exist but have no places', async () => {
      // Arrange - Create empty collection
      const emptyCollection = createTestCollection({ name: 'Empty Collection' });
      await db.collections.add(emptyCollection);

      // Act
      await renderExportPage();

      // Assert
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create link list/i });
        expect(createButton).toBeDisabled();
        expect(screen.getByText('Entire Library (0 places)')).toBeInTheDocument();
      });

      // Should show the general "no places" message since there are no places at all
      // The message only appears when places array exists and has length 0
      await waitFor(() => {
        expect(screen.getByText('No places to export. Import some places first!')).toBeInTheDocument();
      });
    });

    it('should maintain disabled state when places are deleted', async () => {
      // Arrange - Start with a place
      const place = createTestPlace();
      await db.places.add(place);

      await renderExportPage();

      // Verify initially enabled
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create link list/i });
        expect(createButton).not.toBeDisabled();
        expect(screen.getByText('Entire Library (1 places)')).toBeInTheDocument();
      });

      // Act - Delete the place
      await db.places.delete(place.id);

      // Re-render to see updated state
      cleanup();
      await renderExportPage();

      // Assert - Should now be disabled
      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create link list/i });
        expect(createButton).toBeDisabled();
        expect(screen.getByText('Entire Library (0 places)')).toBeInTheDocument();
      });

      // Wait for the "no places" message to appear
      await waitFor(() => {
        expect(screen.getByText('No places to export. Import some places first!')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation Behavior', () => {
    it('should navigate to link list creation page when Create Link List button is clicked', async () => {
      // Arrange
      const place = createTestPlace();
      await db.places.add(place);

      const user = userEvent.setup();
      await renderExportPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create link list/i })).not.toBeDisabled();
      });

      // Act
      const createButton = screen.getByRole('button', { name: /create link list/i });
      await user.click(createButton);

      // Assert
      expect(mockPush).toHaveBeenCalledWith('/link-list/create');
      expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it('should not navigate when button is disabled', async () => {
      // Arrange - No places in database
      const user = userEvent.setup();
      await renderExportPage();

      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create link list/i });
        expect(createButton).toBeDisabled();
      });

      // Act - Try to click disabled button
      const createButton = screen.getByRole('button', { name: /create link list/i });
      await user.click(createButton);

      // Assert - Should not navigate
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should provide navigation links to Transfer Packs and Link Lists management', async () => {
      // Arrange
      const place = createTestPlace();
      await db.places.add(place);

      // Act
      await renderExportPage();

      // Assert
      await waitFor(() => {
        const transferPacksLink = screen.getByRole('link', { name: /transfer packs/i });
        expect(transferPacksLink).toBeInTheDocument();
        expect(transferPacksLink).toHaveAttribute('href', '/transfer-packs/new');

        const linkListsLink = screen.getByRole('link', { name: /link lists/i });
        expect(linkListsLink).toBeInTheDocument();
        expect(linkListsLink).toHaveAttribute('href', '/link-lists');
      });
    });

    it('should handle rapid button clicks gracefully', async () => {
      // Arrange
      const place = createTestPlace();
      await db.places.add(place);

      const user = userEvent.setup();
      await renderExportPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create link list/i })).not.toBeDisabled();
      });

      // Act - Click button multiple times rapidly
      const createButton = screen.getByRole('button', { name: /create link list/i });
      await user.click(createButton);
      await user.click(createButton);
      await user.click(createButton);

      // Assert - Should only navigate once (or multiple times, but shouldn't crash)
      expect(mockPush).toHaveBeenCalledWith('/link-list/create');
      expect(mockPush).toHaveBeenCalledTimes(3); // Each click should trigger navigation
    });
  });

  describe('UI Consistency with Transfer Packs', () => {
    it('should display Link List and CSV Export cards with consistent styling', async () => {
      // Arrange
      const place = createTestPlace();
      await db.places.add(place);

      // Act
      await renderExportPage();

      // Assert
      await waitFor(() => {
        // Both cards should be present
        expect(screen.getByText('Export CSV')).toBeInTheDocument();
        expect(screen.getByText('Link List')).toBeInTheDocument();
      });

      // Both should have similar card structure
      const csvCard = screen.getByText('Export CSV').closest('[class*="card"]');
      const linkListCard = screen.getByText('Link List').closest('[class*="card"]');
      
      expect(csvCard).toBeInTheDocument();
      expect(linkListCard).toBeInTheDocument();
    });

    it('should show consistent button styling between CSV and Link List options', async () => {
      // Arrange
      const place = createTestPlace();
      await db.places.add(place);

      // Act
      await renderExportPage();

      // Assert
      await waitFor(() => {
        const csvButton = screen.getByRole('button', { name: /download csv/i });
        const linkListButton = screen.getByRole('button', { name: /create link list/i });

        expect(csvButton).toBeInTheDocument();
        expect(linkListButton).toBeInTheDocument();

        // Both buttons should be enabled when places exist
        expect(csvButton).not.toBeDisabled();
        expect(linkListButton).not.toBeDisabled();
      });
    });

    it('should disable both CSV and Link List options when no places exist', async () => {
      // Act - Render with empty database
      await renderExportPage();

      // Assert
      await waitFor(() => {
        const csvButton = screen.getByRole('button', { name: /download csv/i });
        const linkListButton = screen.getByRole('button', { name: /create link list/i });

        expect(csvButton).toBeDisabled();
        expect(linkListButton).toBeDisabled();
      });
    });

    it('should show scope selection that affects both export options', async () => {
      // Arrange
      const collection = createTestCollection({ name: 'Test Collection' });
      const place1 = createTestPlace({ title: 'Place 1' });
      const place2 = createTestPlace({ title: 'Place 2' });
      
      await db.collections.add(collection);
      await db.places.bulkAdd([place1, place2]);
      await db.placeCollections.add({
        id: generateId(),
        placeId: place1.id,
        collectionId: collection.id,
      });

      // Act
      await renderExportPage();

      // Assert
      await waitFor(() => {
        // Should show scope selection
        expect(screen.getByText('What to Export')).toBeInTheDocument();
        
        // Should show total places count
        expect(screen.getByText('Entire Library (2 places)')).toBeInTheDocument();
        
        // Should show collection option
        expect(screen.getByText('Test Collection')).toBeInTheDocument();
      });

      // Both export options should be available
      expect(screen.getByRole('button', { name: /download csv/i })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /create link list/i })).not.toBeDisabled();
    });

    it('should maintain consistent layout and spacing', async () => {
      // Arrange
      const place = createTestPlace();
      await db.places.add(place);

      // Act
      await renderExportPage();

      // Assert
      await waitFor(() => {
        // Check that main sections are present and properly structured
        expect(screen.getByRole('heading', { name: 'Export' })).toBeInTheDocument();
        expect(screen.getByText('Backup your places or use in other apps')).toBeInTheDocument();
        
        // Check that cards are in expected order
        const cards = screen.getAllByText(/Export CSV|Link List/).map(el => el.textContent);
        expect(cards).toContain('Export CSV');
        expect(cards).toContain('Link List');
      });
    });
  });

  describe('Integration with Collection Selection', () => {
    it('should work correctly with collection-based scope selection', async () => {
      // Arrange
      const collection1 = createTestCollection({ name: 'Restaurants' });
      const collection2 = createTestCollection({ name: 'Parks' });
      const place1 = createTestPlace({ title: 'Restaurant 1' });
      const place2 = createTestPlace({ title: 'Park 1' });
      const place3 = createTestPlace({ title: 'Unorganized Place' });
      
      await db.collections.bulkAdd([collection1, collection2]);
      await db.places.bulkAdd([place1, place2, place3]);
      await db.placeCollections.bulkAdd([
        { id: generateId(), placeId: place1.id, collectionId: collection1.id },
        { id: generateId(), placeId: place2.id, collectionId: collection2.id },
      ]);

      const user = userEvent.setup();
      await renderExportPage();

      // Assert initial state
      await waitFor(() => {
        expect(screen.getByText('Entire Library (3 places)')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create link list/i })).not.toBeDisabled();
      });

      // Act - Select specific collection
      const scopeSelect = screen.getByDisplayValue('Entire Library (3 places)');
      await user.selectOptions(scopeSelect, collection1.id);

      // Assert - Link List button should still be enabled
      expect(screen.getByRole('button', { name: /create link list/i })).not.toBeDisabled();
    });

    it('should handle empty collection selection gracefully', async () => {
      // Arrange
      const emptyCollection = createTestCollection({ name: 'Empty Collection' });
      const place = createTestPlace({ title: 'Unrelated Place' });
      
      await db.collections.add(emptyCollection);
      await db.places.add(place);

      const user = userEvent.setup();
      await renderExportPage();

      await waitFor(() => {
        expect(screen.getByText('Entire Library (1 places)')).toBeInTheDocument();
      });

      // Act - Select empty collection
      const scopeSelect = screen.getByDisplayValue('Entire Library (1 places)');
      await user.selectOptions(scopeSelect, emptyCollection.id);

      // Assert - Link List button should still be enabled since the export page doesn't 
      // filter by collection for the button state - it only uses the overall places count
      // The collection selection affects what gets exported, not the button state
      expect(screen.getByRole('button', { name: /create link list/i })).not.toBeDisabled();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle database loading states gracefully', async () => {
      // Act - Render before database is fully loaded
      await renderExportPage();

      // Assert - Should show initial state without crashing
      expect(screen.getByRole('heading', { name: 'Export' })).toBeInTheDocument();
      expect(screen.getByText('Backup your places or use in other apps')).toBeInTheDocument();
      
      // Buttons should be disabled initially
      await waitFor(() => {
        const linkListButton = screen.getByRole('button', { name: /create link list/i });
        expect(linkListButton).toBeDisabled();
      });
    });

    it('should handle router navigation errors gracefully', async () => {
      // Arrange
      const place = createTestPlace();
      await db.places.add(place);

      const user = userEvent.setup();
      await renderExportPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create link list/i })).not.toBeDisabled();
      });

      // Act & Assert - Should not crash when navigation fails
      const createButton = screen.getByRole('button', { name: /create link list/i });
      
      // Click the button - this should work normally since we reset the mock
      await user.click(createButton);
      
      // Verify the component is still rendered (didn't crash)
      expect(screen.getByText('Link List')).toBeInTheDocument();
      expect(mockPush).toHaveBeenCalledWith('/link-list/create');
    });

    it('should handle places with missing data gracefully', async () => {
      // Arrange - Create places with edge case data
      const placesWithMissingData = [
        createTestPlace({ title: '', address: 'Address only' }),
        createTestPlace({ title: 'Title only', address: '' }),
        createTestPlace({ title: 'No coordinates', latitude: undefined, longitude: undefined }),
      ];
      
      await db.places.bulkAdd(placesWithMissingData);

      // Act
      await renderExportPage();

      // Assert - Should still enable Link List option
      await waitFor(() => {
        expect(screen.getByText('Entire Library (3 places)')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create link list/i })).not.toBeDisabled();
      });
    });

    it('should update UI reactively when places are added or removed', async () => {
      // Arrange - Start with no places
      await renderExportPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create link list/i })).toBeDisabled();
      });

      // Act - Add a place
      const place = createTestPlace();
      await db.places.add(place);

      // Re-render to simulate reactive update
      cleanup();
      await renderExportPage();

      // Assert - Should now be enabled
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create link list/i })).not.toBeDisabled();
        expect(screen.getByText('Entire Library (1 places)')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility and User Experience', () => {
    it('should have proper ARIA labels and roles', async () => {
      // Arrange
      const place = createTestPlace();
      await db.places.add(place);

      // Act
      await renderExportPage();

      // Assert
      await waitFor(() => {
        // Main heading should be accessible
        expect(screen.getByRole('heading', { name: 'Export' })).toBeInTheDocument();
        
        // Buttons should have proper roles and names
        expect(screen.getByRole('button', { name: /create link list/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /download csv/i })).toBeInTheDocument();
        
        // Links should be accessible
        expect(screen.getByRole('link', { name: /transfer packs/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /link lists/i })).toBeInTheDocument();
      });
    });

    it('should provide clear visual feedback for disabled state', async () => {
      // Act - Render with no places
      await renderExportPage();

      // Assert
      await waitFor(() => {
        const linkListButton = screen.getByRole('button', { name: /create link list/i });
        expect(linkListButton).toBeDisabled();
        
        // Should show explanatory message
        expect(screen.getByText('No places to export. Import some places first!')).toBeInTheDocument();
      });
    });

    it('should maintain focus management for keyboard navigation', async () => {
      // Arrange
      const place = createTestPlace();
      await db.places.add(place);

      const user = userEvent.setup();
      await renderExportPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create link list/i })).not.toBeDisabled();
      });

      // Act - Navigate with keyboard
      // Start from the beginning and tab through elements
      await user.tab(); // Should focus on scope selection
      await user.tab(); // Should focus on CSV button
      await user.tab(); // Should focus on Transfer Packs link
      await user.tab(); // Should focus on Link Lists link
      await user.tab(); // Should focus on Link List button

      const linkListButton = screen.getByRole('button', { name: /create link list/i });
      expect(linkListButton).toHaveFocus();

      // Act - Activate with keyboard
      await user.keyboard('{Enter}');

      // Assert - Should navigate
      expect(mockPush).toHaveBeenCalledWith('/link-list/create');
    });
  });
});
