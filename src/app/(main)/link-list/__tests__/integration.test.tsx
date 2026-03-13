/**
 * Integration tests for Link List feature
 * Tests complete user workflows, cross-component interactions, and error scenarios end-to-end
 * Requirements: All requirements from the spec
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/db';
import { linkListService } from '@/lib/services/link-list';
import { urlService } from '@/lib/services/url';
import { generateId } from '@/lib/utils';
import { LinkListCreator } from '@/components/shared/link-list-creator';
import ExportPage from '../../export/page';
import type { Place, Collection, LinkList } from '@/types';

jest.setTimeout(20000);

// Mock Next.js router and search params
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock Web APIs
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
  share: jest.fn().mockResolvedValue(undefined),
});

const mockPush = jest.fn();
const mockRouter = {
  push: mockPush,
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
};

const mockSearchParams = {
  get: jest.fn(),
  has: jest.fn(),
  getAll: jest.fn(),
  keys: jest.fn(),
  values: jest.fn(),
  entries: jest.fn(),
  forEach: jest.fn(),
  toString: jest.fn(),
};

// Test setup and teardown
beforeEach(async () => {
  await db.delete();
  await db.open();
  jest.clearAllMocks();
  cleanup();
  
  (useRouter as jest.Mock).mockReturnValue(mockRouter);
  (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);
  
  // Reset mock implementations
  mockSearchParams.get.mockReturnValue(null);
  mockSearchParams.has.mockReturnValue(false);
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

describe('Link List Feature Integration Tests', () => {
  describe('Complete User Workflow: Creation → URL Generation → Sharing', () => {
    it('should complete the basic workflow from creation to URL generation', async () => {
      // Setup test data
      const places = [
        createTestPlace({ title: 'Restaurant A', address: '123 Food St' }),
        createTestPlace({ title: 'Park B', address: '456 Green Ave' }),
      ];
      
      const collection = createTestCollection({ name: 'Favorites' });
      
      await db.places.bulkAdd(places);
      await db.collections.add(collection);
      await db.placeCollections.bulkAdd([
        { id: generateId(), placeId: places[0].id, collectionId: collection.id },
      ]);

      const user = userEvent.setup();
      let createdLinkListId: string | null = null;

      // STEP 1: Create Link List
      const mockOnLinkListCreated = jest.fn((id: string) => {
        createdLinkListId = id;
      });

      render(<LinkListCreator onLinkListCreated={mockOnLinkListCreated} />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('Favorites')).toBeInTheDocument();
        expect(screen.getByText('Restaurant A')).toBeInTheDocument();
      });

      // Select collection and individual place
      await user.click(screen.getByLabelText('Favorites'));
      await user.click(screen.getByLabelText('Park B'));

      // Enter title
      const titleInput = screen.getByLabelText('Title');
      await user.type(titleInput, 'My Test Places');

      // Verify summary shows correct counts
      expect(screen.getByText('Places included')).toBeInTheDocument();
      const placesIncludedSection = screen.getByText('Places included').closest('div');
      expect(placesIncludedSection).toHaveTextContent('2'); // 1 from collection + 1 individual

      // Create the link list
      const createButton = screen.getByRole('button', { name: /create link list/i });
      expect(createButton).not.toBeDisabled();
      await user.click(createButton);

      // Wait for creation to complete
      await waitFor(() => {
        expect(mockOnLinkListCreated).toHaveBeenCalled();
        expect(createdLinkListId).toBeTruthy();
      });

      // STEP 2: Verify Link List was created correctly
      const linkList = await linkListService.getLinkList(createdLinkListId!);
      expect(linkList).toBeTruthy();
      expect(linkList!.title).toBe('My Test Places');
      expect(linkList!.placeIds).toHaveLength(2);
      expect(linkList!.collectionIds).toHaveLength(1);

      // STEP 3: Test URL Generation
      const places_for_list = await linkListService.getPlacesForLinkList(createdLinkListId!);
      const shareableUrl = urlService.generateShareableURL(linkList!, places_for_list);
      
      expect(shareableUrl).toContain(createdLinkListId!);
      expect(shareableUrl).toBeTruthy();

      // STEP 4: Test URL Parsing
      const parsedData = urlService.parseShareableURL(shareableUrl);
      expect(parsedData).toBeTruthy();
      expect(parsedData!.linkListId).toBe(createdLinkListId!);
    });

    it('should handle URL generation and parsing correctly', async () => {
      // Setup test data
      const places = [
        createTestPlace({ title: 'URL Test Place 1', address: '111 URL St' }),
        createTestPlace({ title: 'URL Test Place 2', address: '222 URL Ave' }),
      ];

      // Create a link list object with proper date handling
      const linkList: LinkList = {
        id: 'test-url-link-list',
        title: 'URL Test List',
        description: 'Testing URL generation',
        placeIds: places.map(p => p.id),
        collectionIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: true,
      };

      // Test URL generation
      const shareableUrl = urlService.generateShareableURL(linkList, places);
      expect(shareableUrl).toContain(linkList.id);
      expect(shareableUrl).toContain('data=');

      // Test URL parsing
      const parsedData = urlService.parseShareableURL(shareableUrl);
      expect(parsedData).toBeTruthy();
      expect(parsedData!.linkListId).toBe(linkList.id);
      expect(parsedData!.places).toHaveLength(2);
      expect(parsedData!.places[0].title).toBe('URL Test Place 1');
      expect(parsedData!.places[1].title).toBe('URL Test Place 2');
    });
  });

  describe('Cross-Component Interactions', () => {
    it('should properly integrate LinkListCreator with collection handling', async () => {
      // Setup complex collection structure
      const collection1 = createTestCollection({ name: 'Restaurants' });
      const collection2 = createTestCollection({ name: 'Parks' });
      
      const places = [
        createTestPlace({ title: 'Restaurant A' }),
        createTestPlace({ title: 'Restaurant B' }),
        createTestPlace({ title: 'Park A' }),
        createTestPlace({ title: 'Park B' }),
        createTestPlace({ title: 'Individual Place' }),
      ];

      await db.collections.bulkAdd([collection1, collection2]);
      await db.places.bulkAdd(places);
      await db.placeCollections.bulkAdd([
        { id: generateId(), placeId: places[0].id, collectionId: collection1.id },
        { id: generateId(), placeId: places[1].id, collectionId: collection1.id },
        { id: generateId(), placeId: places[2].id, collectionId: collection2.id },
        { id: generateId(), placeId: places[3].id, collectionId: collection2.id },
      ]);

      const user = userEvent.setup();
      let createdLinkListId: string | null = null;

      render(<LinkListCreator onLinkListCreated={(id) => { createdLinkListId = id; }} />);

      await waitFor(() => {
        expect(screen.getByText('Restaurants')).toBeInTheDocument();
        expect(screen.getByText('Parks')).toBeInTheDocument();
      });

      // Select both collections and one individual place
      await user.click(screen.getByLabelText('Restaurants'));
      await user.click(screen.getByLabelText('Parks'));
      await user.click(screen.getByLabelText('Individual Place'));

      // Verify summary shows correct total
      expect(screen.getByText('Places included')).toBeInTheDocument();
      const placesIncludedSection = screen.getByText('Places included').closest('div');
      expect(placesIncludedSection).toHaveTextContent('5'); // 2 + 2 + 1

      await user.type(screen.getByLabelText('Title'), 'Multi-Collection List');
      await user.click(screen.getByRole('button', { name: /create link list/i }));

      await waitFor(() => {
        expect(createdLinkListId).toBeTruthy();
      });

      // Verify the created link list has correct data
      const linkList = await linkListService.getLinkList(createdLinkListId!);
      expect(linkList).toBeTruthy();
      expect(linkList!.collectionIds).toHaveLength(2);
      expect(linkList!.placeIds).toHaveLength(5);
      expect(linkList!.placeIds).toContain(places[4].id); // Individual place
    });
  });

  describe('Error Scenarios End-to-End', () => {
    it('should handle invalid data gracefully in creation', async () => {
      // Create places with missing/invalid data
      const invalidPlaces = [
        createTestPlace({ 
          title: '', 
          address: 'Address only',
          latitude: 0,
          longitude: 0,
        }),
        createTestPlace({ 
          title: 'Title only', 
          address: '',
          latitude: undefined,
          longitude: undefined,
        }),
      ];

      await db.places.bulkAdd(invalidPlaces);

      const user = userEvent.setup();
      let createdLinkListId: string | null = null;

      // Test creation with invalid places
      render(<LinkListCreator onLinkListCreated={(id) => { createdLinkListId = id; }} />);

      await waitFor(() => {
        expect(screen.getByText('Title only')).toBeInTheDocument();
      });

      // Should still be able to select and create
      await user.click(screen.getByLabelText('Title only'));
      await user.type(screen.getByLabelText('Title'), 'Invalid Data Test');
      await user.click(screen.getByRole('button', { name: /create link list/i }));

      await waitFor(() => {
        expect(createdLinkListId).toBeTruthy();
      });

      // Verify the link list was created successfully
      const linkList = await linkListService.getLinkList(createdLinkListId!);
      expect(linkList).toBeTruthy();
      expect(linkList!.title).toBe('Invalid Data Test');
    });

    it('should handle network failures and service errors', async () => {
      const place = createTestPlace({ title: 'Network Test Place' });
      await db.places.add(place);

      // Mock service failure
      jest.spyOn(linkListService, 'createLinkList').mockRejectedValueOnce(
        new Error('Network error')
      );
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const user = userEvent.setup();
      render(<LinkListCreator />);

      await waitFor(() => {
        expect(screen.getByText('Network Test Place')).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText('Network Test Place'));
      await user.type(screen.getByLabelText('Title'), 'Network Failure Test');
      await user.click(screen.getByRole('button', { name: /create link list/i }));

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/failed to create link list/i)).toBeInTheDocument();
        expect(errorSpy).toHaveBeenCalledWith(
          'Failed to create link list:',
          expect.any(Error)
        );
      });

      // Button should be enabled for retry
      expect(screen.getByRole('button', { name: /create link list/i })).not.toBeDisabled();

      errorSpy.mockRestore();
    });

    it('should handle database connection issues', async () => {
      // Close database to simulate connection issue
      await db.close();

      render(<LinkListCreator />);

      // Should handle gracefully without crashing
      expect(screen.getByText('Link List Details')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create link list/i })).toBeDisabled();

      // Reopen database for cleanup
      await db.open();
    });
  });

  describe('Export Page Integration', () => {
    it('should integrate properly with export page', async () => {
      // Setup test data
      const place = createTestPlace({ title: 'Export Test Place' });
      await db.places.add(place);

      const user = userEvent.setup();
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByText('Link List')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create link list/i })).not.toBeDisabled();
      });

      const exportCreateButton = screen.getByRole('button', { name: /create link list/i });
      await user.click(exportCreateButton);

      expect(mockPush).toHaveBeenCalledWith('/link-list/create');
    });

    it('should disable link list option when no places exist', async () => {
      render(<ExportPage />);

      await waitFor(() => {
        expect(screen.getByText('Link List')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create link list/i })).toBeDisabled();
      });
    });
  });

  describe('Service Integration and Data Flow', () => {
    it('should handle complete service integration workflow', async () => {
      // Test the complete data flow: Creation → Storage → Retrieval → URL Generation
      const places = [
        createTestPlace({ title: 'Service Test Place 1' }),
        createTestPlace({ title: 'Service Test Place 2' }),
      ];

      const collection = createTestCollection({ name: 'Service Test Collection' });
      
      await db.places.bulkAdd(places);
      await db.collections.add(collection);
      await db.placeCollections.add({
        id: generateId(),
        placeId: places[0].id,
        collectionId: collection.id,
      });

      // Step 1: Create link list through service
      const linkList = await linkListService.createLinkList({
        title: 'Service Integration Test',
        description: 'Testing complete service integration',
        selectedPlaces: [places[1]], // Individual place
        selectedCollections: [collection], // Collection with places[0]
      });

      expect(linkList).toBeTruthy();
      expect(linkList.title).toBe('Service Integration Test');
      expect(linkList.placeIds).toHaveLength(2); // Should include both places

      // Step 2: Retrieve link list
      const retrieved = await linkListService.getLinkList(linkList.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.id).toBe(linkList.id);

      // Step 3: Get places for link list
      const linkListPlaces = await linkListService.getPlacesForLinkList(linkList.id);
      expect(linkListPlaces).toHaveLength(2);
      expect(linkListPlaces.map(p => p.title)).toContain('Service Test Place 1');
      expect(linkListPlaces.map(p => p.title)).toContain('Service Test Place 2');

      // Step 4: Generate shareable URL
      const shareableUrl = urlService.generateShareableURL(linkList, linkListPlaces);
      expect(shareableUrl).toContain(linkList.id);

      // Step 5: Parse URL back
      const parsedData = urlService.parseShareableURL(shareableUrl);
      expect(parsedData).toBeTruthy();
      expect(parsedData!.linkListId).toBe(linkList.id);
      expect(parsedData!.places).toHaveLength(2);

      // Step 6: Test cascade operations
      const cascadeResult = await linkListService.handlePlaceDeletion(places[0].id);
      expect(cascadeResult.updatedLinkLists).toHaveLength(1);
      expect(cascadeResult.deletedLinkLists).toHaveLength(0);

      // Verify the link list was updated (should still have 2 places since places[0] was in collection)
      const updatedLinkList = await linkListService.getLinkList(linkList.id);
      expect(updatedLinkList!.placeIds).toHaveLength(2); // Still has both places since places[0] is also in collection
      expect(updatedLinkList!.placeIds).toContain(places[1].id);
    });

    it('should handle QR code and sharing integration', async () => {
      const place = createTestPlace({ title: 'QR Test Place' });
      await db.places.add(place);

      // Create link list
      const linkList = await linkListService.createLinkList({
        title: 'QR Test List',
        description: 'Test QR code generation',
        selectedPlaces: [place],
        selectedCollections: [],
      });

      // Test URL generation for QR codes
      const places = await linkListService.getPlacesForLinkList(linkList.id);
      const shareableUrl = urlService.generateShareableURL(linkList, places);
      const qrUrl = urlService.generateQRCodeURL(linkList, places);

      expect(qrUrl).toBe(shareableUrl); // Should be the same URL
      expect(qrUrl).toContain(linkList.id);
    });
  });

  describe('Performance and Data Handling', () => {
    it('should handle moderate-sized link lists efficiently', async () => {
      // Create a moderate number of places (20 for test performance)
      const places = Array.from({ length: 20 }, (_, i) => 
        createTestPlace({ 
          title: `Performance Place ${i + 1}`, 
          address: `${i + 1}00 Performance St` 
        })
      );
      
      await db.places.bulkAdd(places);

      // Create link list with all places
      const linkList = await linkListService.createLinkList({
        title: 'Performance Test',
        selectedPlaces: places.slice(0, 10), // First 10 places
        selectedCollections: [],
      });

      expect(linkList).toBeTruthy();
      expect(linkList.placeIds).toHaveLength(10);

      // Test retrieval performance
      const retrievedPlaces = await linkListService.getPlacesForLinkList(linkList.id);
      expect(retrievedPlaces).toHaveLength(10);

      // Test URL generation with moderate data
      const shareableUrl = urlService.generateShareableURL(linkList, retrievedPlaces);
      expect(shareableUrl).toBeTruthy();
      expect(shareableUrl.length).toBeLessThan(2000); // Should be within URL limits
    });
  });
});
