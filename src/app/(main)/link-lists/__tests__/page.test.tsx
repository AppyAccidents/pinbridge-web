import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import LinkListsPage from '../page';
import { linkListService } from '@/lib/services/link-list';
import { urlService } from '@/lib/services/url';
import type { LinkList, Place } from '@/types';

const pushMock = jest.fn();

// Mock dependencies
jest.mock('dexie-react-hooks');
jest.mock('@/lib/services/link-list');
jest.mock('@/lib/services/url');
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));
jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button type="button" role="menuitem" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));
// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
  MockLink.displayName = 'MockLink';
  return MockLink;
});

const mockUseLiveQuery = useLiveQuery as jest.MockedFunction<typeof useLiveQuery>;
const mockLinkListService = linkListService as jest.Mocked<typeof linkListService>;
const mockUrlService = urlService as jest.Mocked<typeof urlService>;

// Mock toast
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

// Mock QRCodeGenerator component
jest.mock('@/components/shared/qr-code-generator', () => ({
  QRCodeGenerator: ({ url, title }: { url: string; title: string }) => (
    <div data-testid="qr-code-generator">
      <div>QR Code for: {title}</div>
      <div>URL: {url}</div>
    </div>
  ),
}));

// Mock toast
jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

describe('LinkListsPage', () => {
  const mockLinkList: LinkList = {
    id: 'test-id',
    title: 'Test Link List',
    description: 'Test description',
    placeIds: ['place1', 'place2'],
    collectionIds: ['collection1'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    isPublic: true,
  };

  const mockPlaces: Place[] = [
    {
      id: 'place1',
      title: 'Test Place 1',
      address: '123 Test St',
      latitude: 40.7128,
      longitude: -74.0060,
      tags: [],
      notes: undefined,
      source: 'manual',
      sourceUrl: undefined,
      normalizedTitle: 'test place 1',
      normalizedAddress: '123 test st',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: 'place2',
      title: 'Test Place 2',
      address: '456 Test Ave',
      latitude: 40.7589,
      longitude: -73.9851,
      tags: [],
      notes: undefined,
      source: 'manual',
      sourceUrl: undefined,
      normalizedTitle: 'test place 2',
      normalizedAddress: '456 test ave',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
    
    // Mock native share API
    Object.assign(navigator, {
      share: jest.fn().mockResolvedValue(undefined),
    });
  });

  const openMenu = async () => {
    const menuButton = screen.getByRole('button', { name: /more options/i });
    // Radix dropdowns listen for pointer events; use pointerDown + click for JSDOM.
    fireEvent.pointerDown(menuButton);
    fireEvent.click(menuButton);
  };

  it('renders empty state when no link lists exist', () => {
    mockUseLiveQuery.mockReturnValue([]);

    render(<LinkListsPage />);

    expect(screen.getByText('No Link Lists Yet')).toBeInTheDocument();
    expect(
      screen.getByText('Create your first link list to share places with others')
    ).toBeInTheDocument();
  });

  it('displays link lists with statistics', () => {
    mockUseLiveQuery.mockReturnValue([mockLinkList]);

    render(<LinkListsPage />);

    expect(screen.getByText('Test Link List')).toBeInTheDocument();
    expect(screen.getByText('Test description')).toBeInTheDocument();
    const card = screen.getByText('Test Link List').closest('.rounded-lg');
    expect(card).toHaveTextContent('2 place');
    expect(screen.getByText('Public')).toBeInTheDocument();
  });

  it('shows creation and update dates', () => {
    mockUseLiveQuery.mockReturnValue([mockLinkList]);

    render(<LinkListsPage />);

    expect(screen.getByText(/Created Jan 1, 2024/)).toBeInTheDocument();
  });

  it('deletes link list when delete button is clicked and confirmed', async () => {
    mockUseLiveQuery.mockReturnValue([mockLinkList]);
    mockLinkListService.deleteLinkList.mockResolvedValue();

    render(<LinkListsPage />);

    await openMenu();

    const deleteMenuItem = await screen.findByRole('menuitem', { name: /delete/i });
    fireEvent.click(deleteMenuItem);

    const deleteButtons = await screen.findAllByText('Delete');
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(mockLinkListService.deleteLinkList).toHaveBeenCalledWith('test-id');
    });
  });

  it('opens link list in new tab when view button is clicked', () => {
    mockUseLiveQuery.mockReturnValue([mockLinkList]);

    render(<LinkListsPage />);

    const viewButton = screen.getByRole('button', { name: /view/i });
    fireEvent.click(viewButton);

    expect(pushMock).toHaveBeenCalledWith('/link-list/test-id');
  });

  it('handles singular vs plural correctly for places and collections', () => {
    const singleItemLinkList: LinkList = {
      ...mockLinkList,
      placeIds: ['place1'],
      collectionIds: ['collection1'],
    };

    mockUseLiveQuery.mockReturnValue([singleItemLinkList]);

    render(<LinkListsPage />);

    // Check for singular forms in the statistics section
    const card = screen.getByText('Test Link List').closest('.rounded-lg');
    expect(card).toHaveTextContent('1 place');
  });

  describe('Sharing functionality', () => {
    beforeEach(() => {
      mockLinkListService.getPlacesForLinkList.mockResolvedValue(mockPlaces);
      mockUrlService.generateShareableURL.mockReturnValue('https://example.com/link-list/test-id?data=encoded');
    });

    it('uses native share API when available', async () => {
      mockUseLiveQuery.mockReturnValue([mockLinkList]);

      render(<LinkListsPage />);

      const shareButton = screen.getByRole('button', { name: /share/i });
      fireEvent.click(shareButton);

      await waitFor(() => {
        expect(mockLinkListService.getPlacesForLinkList).toHaveBeenCalledWith('test-id');
        expect(mockUrlService.generateShareableURL).toHaveBeenCalledWith(mockLinkList, mockPlaces);
        expect(navigator.share).toHaveBeenCalledWith({
          title: 'Test Link List',
          text: 'Test description',
          url: 'https://example.com/link-list/test-id?data=encoded',
        });
      });
    });

    it('copies URL to clipboard when native share is unavailable', async () => {
      mockUseLiveQuery.mockReturnValue([mockLinkList]);
      (navigator as any).share = undefined;

      render(<LinkListsPage />);

      const shareButton = screen.getByRole('button', { name: /share/i });
      fireEvent.click(shareButton);

      await waitFor(() => {
        expect(mockLinkListService.getPlacesForLinkList).toHaveBeenCalledWith('test-id');
        expect(mockUrlService.generateShareableURL).toHaveBeenCalledWith(mockLinkList, mockPlaces);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          'https://example.com/link-list/test-id?data=encoded'
        );
      });
    });

    it('shows QR code when QR code is selected', async () => {
      mockUseLiveQuery.mockReturnValue([mockLinkList]);
      mockLinkListService.getLinkList.mockResolvedValue(mockLinkList);

      render(<LinkListsPage />);

      await openMenu();

      const qrMenuItem = await screen.findByRole('menuitem', { name: /qr code/i });
      fireEvent.click(qrMenuItem);

      await waitFor(() => {
        expect(screen.getByTestId('qr-code-generator')).toBeInTheDocument();
      });
    });
  });
});
