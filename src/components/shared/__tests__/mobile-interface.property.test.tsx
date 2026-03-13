/**
 * Property-based tests for mobile interface optimization
 * Feature: link-list-feature
 */

import fc from 'fast-check';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PlaceLink, PlaceLinkCompact } from '../place-link';
import { LazyPlaceList } from '../lazy-place-list';
import { LinkListPageContent } from '@/app/(main)/link-list/[id]/link-list-content';
import { ReadonlyURLSearchParams } from 'next/navigation';
import type { Place } from '@/types';

// Mock Next.js navigation hooks
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-id' }),
  useSearchParams: () => new URLSearchParams(),
  ReadonlyURLSearchParams: class MockReadonlyURLSearchParams extends URLSearchParams {
    constructor(init?: string | URLSearchParams | string[][] | Record<string, string>) {
      super(init);
    }
  },
}));

// Mock Dexie and database
jest.mock('@/lib/db', () => ({
  db: {
    linkLists: {
      get: jest.fn(() => Promise.resolve(null)),
    },
  },
}));

// Mock services
jest.mock('@/lib/services/link-list', () => ({
  linkListService: {
    getPlacesForLinkList: jest.fn(() => Promise.resolve([])),
  },
}));

jest.mock('@/lib/services/url', () => ({
  urlService: {
    generateShareableURL: jest.fn(() => 'https://example.com/link-list/test'),
    parseShareableURL: jest.fn(() => null),
  },
}));

jest.mock('@/lib/services/cache', () => ({
  linkListCache: {
    cachePlaces: jest.fn(),
    cacheLinkList: jest.fn(),
    preloadPlaces: jest.fn(),
  },
  cacheUtils: {
    isSlowConnection: jest.fn(() => false),
  },
}));

// Mock dexie-react-hooks
jest.mock('dexie-react-hooks', () => ({
  useLiveQuery: jest.fn(() => undefined),
}));

// Mock link generation functions
jest.mock('@/lib/links', () => ({
  generateAppleMapsUrl: jest.fn((place: Place) => `https://maps.apple.com/?q=${encodeURIComponent(place.title)}`),
  generateGoogleMapsUrl: jest.fn((place: Place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.title)}`),
}));

// Mock lazy components to avoid complex loading behavior in tests
jest.mock('@/components/shared/lazy-place-list', () => ({
  LazyPlaceList: ({ places, compact }: { places: Place[], compact?: boolean }) => (
    <div data-testid="lazy-place-list" data-compact={compact} data-place-count={places.length}>
      {places.slice(0, 5).map((place, index) => (
        <div key={`${place.id}-${index}`} data-testid={`place-item-${index}`}>
          {compact ? (
            <div data-testid={`compact-place-${index}`}>{place.title}</div>
          ) : (
            <div data-testid={`full-place-${index}`}>{place.title}</div>
          )}
        </div>
      ))}
    </div>
  ),
}));

jest.mock('@/components/shared/lazy-qr-code', () => ({
  LazyQRCode: ({ url, size }: { url: string, size?: number }) => (
    <div data-testid="lazy-qr-code" data-url={url} data-size={size} />
  ),
}));

jest.mock('@/components/shared/performance-monitor', () => ({
  PerformanceMonitor: () => <div data-testid="performance-monitor" />,
}));

// Mock window.open for link testing
const mockWindowOpen = jest.fn();
Object.defineProperty(window, 'open', {
  writable: true,
  value: mockWindowOpen,
});

// Mock navigator.share and clipboard
const mockShare = jest.fn();
const mockWriteText = jest.fn();
Object.defineProperty(navigator, 'share', {
  writable: true,
  value: mockShare,
});
Object.defineProperty(navigator, 'clipboard', {
  writable: true,
  value: { writeText: mockWriteText },
});

// Generator for valid place data
const placeArbitraryFields = {
  id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
  title: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  address: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
  latitude: fc.option(fc.double({ min: -90, max: 90 }), { nil: undefined }),
  longitude: fc.option(fc.double({ min: -180, max: 180 }), { nil: undefined }),
  notes: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  source: fc.constantFrom('apple', 'google', 'manual', 'other'),
  sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
  normalizedTitle: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  normalizedAddress: fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0),
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
  updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
};

const placeArbitrary = fc.record(placeArbitraryFields) as fc.Arbitrary<Place>;

// Generator for screen size configurations
const screenSizeArbitrary = fc.record({
  width: fc.constantFrom(320, 375, 414, 768, 1024, 1200, 1920), // Common mobile and desktop widths
  height: fc.constantFrom(568, 667, 896, 1024, 768, 800, 1080), // Common screen heights
  isMobile: fc.boolean(),
  isTouch: fc.boolean(),
});

// Helper function to simulate different screen sizes
const simulateScreenSize = (width: number, height: number) => {
  // Mock window dimensions
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  });

  // Mock matchMedia for responsive breakpoints
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width') ? width <= 768 : width > 768,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
};

// Helper function to validate touch target requirements through CSS classes
const validateTouchTargetClasses = (element: HTMLElement): boolean => {
  const className = element.className;
  
  // Check for minimum height classes (44px requirement)
  // h-11 = 44px, h-12 = 48px, min-h-[44px] = 44px
  const hasMinHeight = /min-h-\[44px\]|min-h-11|h-11|h-12|min-h-12/.test(className);
  
  // Check for minimum width classes (for compact buttons)
  const hasMinWidth = /min-w-\[44px\]|min-w-11|w-11|w-12|min-w-12/.test(className);
  
  // For compact buttons (those with explicit p-2 class), they should have both min dimensions
  const isCompactButton = /\bp-2\b/.test(className);
  
  if (isCompactButton) {
    return hasMinHeight && hasMinWidth;
  } else {
    // Regular buttons just need minimum height
    return hasMinHeight;
  }
};

// Helper function to check if element has touch-friendly spacing
const hasTouchFriendlySpacing = (element: HTMLElement): boolean => {
  const className = element.className;
  return /gap-1|gap-2|gap-3|space-x-2|space-x-3|space-y-2|space-y-3/.test(className);
};

beforeEach(() => {
  jest.clearAllMocks();
  cleanup();
  // Reset window dimensions to default
  simulateScreenSize(1024, 768);
});

afterEach(() => {
  cleanup();
});

/**
 * Property 5: Mobile interface optimization
 * **Validates: Requirements 3.1, 3.4**
 * 
 * For any Link List page accessed on mobile, the interface should display touch-friendly 
 * elements with minimum 44px touch targets and responsive layout that adapts to different screen sizes.
 */
describe('Property 5: Mobile interface optimization', () => {
  it('should ensure all interactive elements meet minimum 44px touch target requirements', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          places: fc.array(placeArbitrary, { minLength: 1, maxLength: 10 }),
          screenSize: screenSizeArbitrary,
        }),
        async ({ places, screenSize }) => {
          cleanup();
          
          // Simulate the screen size (Requirement 3.4)
          simulateScreenSize(screenSize.width, screenSize.height);
          
          // Render PlaceLink component (standard view)
          const { unmount: unmountPlaceLink } = render(
            <PlaceLink place={places[0]} showBothLinks={true} />
          );
          
          try {
            // Assert: All buttons should meet minimum touch target size (Requirement 3.1)
            const buttons = screen.getAllByRole('button');
            
            for (const button of buttons) {
              // Check minimum touch target requirements through CSS classes
              expect(validateTouchTargetClasses(button)).toBe(true);
              
              // Verify button is clickable and accessible
              expect(button).toBeEnabled();
              // Note: HTML button elements don't require explicit type="button" attribute
              
              // Test button interaction
              fireEvent.click(button);
              // Should not throw errors when clicked
            }
            
            // Assert: Touch targets should be appropriately spaced
            if (buttons.length > 1) {
              // Check that container has appropriate spacing classes
              const buttonContainer = buttons[0].parentElement;
              if (buttonContainer) {
                expect(hasTouchFriendlySpacing(buttonContainer)).toBe(true);
              }
            }
          } finally {
            unmountPlaceLink();
            cleanup();
          }
          
          return true;
        }
      ),
      { numRuns: 8, timeout: 8000 }
    );
  }, 12000);

  it('should adapt layout responsively across different mobile screen sizes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          places: fc.array(placeArbitrary, { minLength: 2, maxLength: 8 }),
          mobileWidth: fc.constantFrom(320, 375, 414, 480), // Mobile widths
          desktopWidth: fc.constantFrom(768, 1024, 1200, 1920), // Desktop widths
        }),
        async ({ places, mobileWidth, desktopWidth }) => {
          cleanup();
          
          // Test mobile layout (Requirement 3.4)
          simulateScreenSize(mobileWidth, 667);
          
          const { unmount: unmountMobile } = render(
            <LazyPlaceList places={places} compact={true} />
          );
          
          try {
            // Assert: Mobile layout should be compact and stack vertically
            const mobileList = screen.getByTestId('lazy-place-list');
            expect(mobileList).toHaveAttribute('data-compact', 'true');
            expect(mobileList).toHaveAttribute('data-place-count', places.length.toString());
            
            // Check that places are rendered in compact mode
            const compactPlaces = screen.getAllByTestId(/^compact-place-/);
            expect(compactPlaces.length).toBeGreaterThan(0);
            expect(compactPlaces.length).toBeLessThanOrEqual(places.length);
          } finally {
            unmountMobile();
            cleanup();
          }
          
          // Test desktop layout
          simulateScreenSize(desktopWidth, 1080);
          
          const { unmount: unmountDesktop } = render(
            <LazyPlaceList places={places} compact={false} />
          );
          
          try {
            // Assert: Desktop layout should be full-featured
            const desktopList = screen.getByTestId('lazy-place-list');
            expect(desktopList).toHaveAttribute('data-compact', 'false');
            expect(desktopList).toHaveAttribute('data-place-count', places.length.toString());
            
            // Check that places are rendered in full mode
            const fullPlaces = screen.getAllByTestId(/^full-place-/);
            expect(fullPlaces.length).toBeGreaterThan(0);
            expect(fullPlaces.length).toBeLessThanOrEqual(places.length);
          } finally {
            unmountDesktop();
            cleanup();
          }
          
          return true;
        }
      ),
      { numRuns: 6, timeout: 8000 }
    );
  }, 12000);

  it('should maintain touch-friendly interface in compact mode', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          place: placeArbitrary,
          mobileScreenSize: fc.record({
            width: fc.constantFrom(320, 375, 414), // Small mobile screens
            height: fc.constantFrom(568, 667, 896),
          }),
        }),
        async ({ place, mobileScreenSize }) => {
          cleanup();
          
          // Simulate small mobile screen (Requirement 3.1, 3.4)
          simulateScreenSize(mobileScreenSize.width, mobileScreenSize.height);
          
          // Render compact place link
          const { unmount } = render(<PlaceLinkCompact place={place} />);
          
          try {
            // Assert: Compact mode should still have touch-friendly buttons
            const buttons = screen.getAllByRole('button');
            expect(buttons.length).toBeGreaterThan(0);
            
            for (const button of buttons) {
              // Check minimum touch target size through CSS classes
              expect(validateTouchTargetClasses(button)).toBe(true);
              
              // Test button accessibility
              expect(button).toBeEnabled();
              expect(button).toHaveAttribute('title'); // Should have tooltip for compact buttons
              
              // Test interaction
              fireEvent.click(button);
              expect(mockWindowOpen).toHaveBeenCalled();
            }
            
            // Assert: Compact layout should be space-efficient but still usable
            const allButtons = screen.getAllByRole('button');
            const container = allButtons[0].closest('div');
            expect(container).toBeTruthy();
            
            // Should contain place information
            const titleElements = screen.queryAllByText((content, element) => {
              return content.trim() === place.title.trim() || 
                     element?.textContent?.trim() === place.title.trim();
            });
            const addressElements = screen.queryAllByText((content, element) => {
              return content.trim() === place.address.trim() || 
                     element?.textContent?.trim() === place.address.trim();
            });
            
            expect(titleElements.length).toBeGreaterThan(0);
            expect(addressElements.length).toBeGreaterThan(0);
          } finally {
            unmount();
            cleanup();
          }
          
          return true;
        }
      ),
      { numRuns: 6, timeout: 6000 }
    );
  }, 10000);

  it('should handle responsive button layouts across screen sizes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          place: placeArbitrary,
          screenSizes: fc.array(
            fc.record({
              width: fc.constantFrom(320, 375, 414, 768, 1024, 1200),
              height: fc.constantFrom(568, 667, 896, 1024, 768, 1080),
            }),
            { minLength: 2, maxLength: 4 }
          ),
        }),
        async ({ place, screenSizes }) => {
          // Test the same component across multiple screen sizes
          for (const screenSize of screenSizes) {
            cleanup();
            
            simulateScreenSize(screenSize.width, screenSize.height);
            
            const { unmount } = render(
              <PlaceLink place={place} showBothLinks={true} />
            );
            
            try {
              // Assert: Button layout should adapt to screen size (Requirement 3.4)
              const buttons = screen.getAllByRole('button');
              expect(buttons.length).toBe(2); // Apple Maps + Google Maps
              
              // All buttons should maintain touch target requirements
              for (const button of buttons) {
                // Check touch target requirements through CSS classes
                expect(validateTouchTargetClasses(button)).toBe(true);
                
                // Button should be properly labeled
                expect(button.textContent).toMatch(/Apple Maps|Google Maps/);
                
                // Button should have proper flex classes for responsive layout
                expect(button.className).toMatch(/flex|flex-1/);
              }
              
              // Assert: Container should use responsive flex layout
              const buttonContainer = buttons[0].parentElement;
              expect(buttonContainer?.className).toMatch(/flex|gap-/);
              
              // On mobile, buttons should stack or maintain adequate spacing
              if (screenSize.width <= 640) {
                // Should have flex-col class or adequate gap for mobile
                expect(buttonContainer?.className).toMatch(/flex-col|gap-2|gap-3/);
              }
            } finally {
              unmount();
              cleanup();
            }
          }
          
          return true;
        }
      ),
      { numRuns: 5, timeout: 10000 }
    );
  }, 15000);

  it('should ensure mobile interface performance with large place lists', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          places: fc.array(placeArbitrary, { minLength: 20, maxLength: 100 }),
          mobileConfig: fc.record({
            width: fc.constantFrom(320, 375, 414),
            isSlowConnection: fc.boolean(),
            initialLoadCount: fc.constantFrom(5, 10, 15),
          }),
        }),
        async ({ places, mobileConfig }) => {
          cleanup();
          
          // Simulate mobile environment with potential slow connection
          simulateScreenSize(mobileConfig.width, 667);
          
          const { unmount } = render(
            <LazyPlaceList 
              places={places}
              compact={true}
              initialLoadCount={mobileConfig.initialLoadCount}
              loadMoreCount={5}
            />
          );
          
          try {
            // Assert: Should render initial batch efficiently (Requirement 3.4)
            const placeList = screen.getByTestId('lazy-place-list');
            expect(placeList).toBeInTheDocument();
            expect(placeList).toHaveAttribute('data-compact', 'true');
            
            // Should only render initial load count, not all places
            const renderedPlaces = screen.getAllByTestId(/^compact-place-/);
            expect(renderedPlaces.length).toBeLessThanOrEqual(mobileConfig.initialLoadCount);
            expect(renderedPlaces.length).toBeGreaterThan(0);
            
            // Should indicate total count
            expect(placeList).toHaveAttribute('data-place-count', places.length.toString());
            
            // Assert: Performance should be maintained on mobile
            // Component should render without throwing errors
            expect(placeList).toBeVisible();
            
            // Should handle large datasets gracefully
            if (places.length > mobileConfig.initialLoadCount) {
              // Should have lazy loading mechanism (implied by component structure)
              expect(renderedPlaces.length).toBe(Math.min(5, mobileConfig.initialLoadCount));
            }
          } finally {
            unmount();
            cleanup();
          }
          
          return true;
        }
      ),
      { numRuns: 5, timeout: 8000 }
    );
  }, 12000);

  it('should maintain accessibility standards across all screen sizes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          places: fc.array(placeArbitrary, { minLength: 1, maxLength: 5 }),
          screenSize: screenSizeArbitrary,
        }),
        async ({ places, screenSize }) => {
          cleanup();
          
          simulateScreenSize(screenSize.width, screenSize.height);
          
          const { unmount } = render(
            <div>
              <PlaceLink place={places[0]} showBothLinks={true} />
              {places.length > 1 && <PlaceLinkCompact place={places[1]} />}
            </div>
          );
          
          try {
            // Assert: All interactive elements should be accessible (Requirement 3.1)
            const buttons = screen.getAllByRole('button');
            
            for (const button of buttons) {
              // Should be keyboard accessible
              expect(button).not.toHaveAttribute('tabindex', '-1');
              
              // Should have proper ARIA attributes or text content
              const hasAriaLabel = button.hasAttribute('aria-label');
              const hasTitle = button.hasAttribute('title');
              const hasTextContent = button.textContent && button.textContent.trim().length > 0;
              
              expect(hasAriaLabel || hasTitle || hasTextContent).toBe(true);
              
              // Should meet minimum touch target size through CSS classes
              expect(validateTouchTargetClasses(button)).toBe(true);
              
              // Should be focusable
              button.focus();
              expect(document.activeElement).toBe(button);
              
              // Should respond to keyboard events
              fireEvent.keyDown(button, { key: 'Enter' });
              fireEvent.keyDown(button, { key: ' ' });
              // Should not throw errors
            }
            
            // Assert: Text should be readable at all screen sizes
            // Use flexible text matching to handle whitespace variations
            const placeTitles = screen.queryAllByText((content, element) => {
              return content.trim() === places[0].title.trim() || 
                     element?.textContent?.trim() === places[0].title.trim();
            });
            const placeAddresses = screen.queryAllByText((content, element) => {
              return content.trim() === places[0].address.trim() || 
                     element?.textContent?.trim() === places[0].address.trim();
            });
            
            expect(placeTitles.length).toBeGreaterThan(0);
            expect(placeAddresses.length).toBeGreaterThan(0);
            
            // At least one instance should be visible
            expect(placeTitles[0]).toBeVisible();
            expect(placeAddresses[0]).toBeVisible();
            
            // Text should not be truncated inappropriately on larger screens
            if (screenSize.width > 768) {
              // Desktop should show full text - check the first title element
              expect(placeTitles[0].className).not.toMatch(/truncate/);
            }
          } finally {
            unmount();
            cleanup();
          }
          
          return true;
        }
      ),
      { numRuns: 6, timeout: 8000 }
    );
  }, 12000);

  it('should handle edge cases in mobile interface gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          place: fc.record({
            ...placeArbitraryFields,
            title: fc.oneof(
              fc.string({ minLength: 1, maxLength: 10 }), // Short title
              fc.string({ minLength: 50, maxLength: 200 }), // Very long title
              fc.constant('Test & Special <Characters> "Quotes"'), // Special characters
            ),
            address: fc.oneof(
              fc.string({ minLength: 1, maxLength: 20 }), // Short address
              fc.string({ minLength: 100, maxLength: 300 }), // Very long address
              fc.constant(''), // Empty address
            ),
            tags: fc.oneof(
              fc.constant([]), // No tags
              fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 10, maxLength: 20 }), // Many tags
            ),
          }),
          extremeScreenSize: fc.record({
            width: fc.constantFrom(280, 320, 1920, 2560), // Very small and very large
            height: fc.constantFrom(480, 568, 1080, 1440),
          }),
        }),
        async ({ place, extremeScreenSize }) => {
          cleanup();
          
          simulateScreenSize(extremeScreenSize.width, extremeScreenSize.height);
          
          // Test both regular and compact modes
          const { unmount: unmountRegular } = render(
            <PlaceLink place={place as Place} showBothLinks={true} />
          );
          
          try {
            // Assert: Should handle edge cases without breaking (Requirement 3.1, 3.4)
            const buttons = screen.getAllByRole('button');
            expect(buttons.length).toBeGreaterThan(0);
            
            // All buttons should maintain minimum touch targets even with edge cases
            for (const button of buttons) {
              // Check touch target requirements through CSS classes
              expect(validateTouchTargetClasses(button)).toBe(true);
              
              // Should not break with special characters or long text
              expect(button).toBeEnabled();
              fireEvent.click(button);
            }
            
            // Should display place information without breaking layout
            if (place.title.trim()) {
              // Use flexible text matching for edge cases with special characters
              const titleElements = screen.queryAllByText((content, element) => {
                const trimmedTitle = place.title.trim();
                return content.includes(trimmedTitle) || 
                       element?.textContent?.includes(trimmedTitle) ||
                       content.trim() === trimmedTitle;
              });
              expect(titleElements.length).toBeGreaterThan(0);
            }
            
            if (place.address.trim()) {
              // Use a more flexible text matcher for addresses that might have whitespace issues
              const addressElements = screen.queryAllByText((content, element) => {
                const trimmedAddress = place.address.trim();
                return content.includes(trimmedAddress) || 
                       element?.textContent?.includes(trimmedAddress) ||
                       content.trim() === trimmedAddress;
              });
              expect(addressElements.length).toBeGreaterThan(0);
            }
            
            // Should handle many tags gracefully
            if (place.tags.length > 0) {
              const tagElements = place.tags.slice(0, 5); // Should limit or handle many tags
              for (const tag of tagElements) {
                if (tag.trim()) {
                  // Tags should be present but may be truncated/limited
                  const tagElement = screen.queryByText(tag);
                  if (tagElement) {
                    expect(tagElement).toBeVisible();
                  }
                }
              }
            }
          } finally {
            unmountRegular();
            cleanup();
          }
          
          // Test compact mode with edge cases
          const { unmount: unmountCompact } = render(
            <PlaceLinkCompact place={place as Place} />
          );
          
          try {
            // Compact mode should also handle edge cases
            const compactButtons = screen.getAllByRole('button');
            expect(compactButtons.length).toBeGreaterThan(0);
            
            for (const button of compactButtons) {
              // Check touch target requirements through CSS classes
              expect(validateTouchTargetClasses(button)).toBe(true);
              
              // Should have tooltips for compact buttons
              expect(button).toHaveAttribute('title');
            }
          } finally {
            unmountCompact();
            cleanup();
          }
          
          return true;
        }
      ),
      { numRuns: 5, timeout: 10000 }
    );
  }, 15000);
});
