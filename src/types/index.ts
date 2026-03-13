export type Provider = 'apple' | 'google' | 'manual' | 'other';

export interface Place {
  id: string;
  title: string;
  address: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  tags: string[];
  source: Provider;
  sourceUrl?: string;
  normalizedTitle: string;
  normalizedAddress: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaceCollection {
  id: string;
  placeId: string;
  collectionId: string;
}

export type TransferTarget = 'apple' | 'google';

export type PackItemStatus = 'pending' | 'done' | 'skipped' | 'flagged';

export interface TransferPack {
  id: string;
  name: string;
  target: TransferTarget;
  scopeType: 'library' | 'collection' | 'filtered';
  scopeId?: string; // collectionId if scopeType is 'collection'
  createdAt: Date;
  updatedAt: Date;
}

export interface TransferPackItem {
  id: string;
  packId: string;
  placeId: string;
  status: PackItemStatus;
  mismatchReason?: string;
  mismatchNotes?: string;
  completedAt?: Date;
}

export interface ImportRun {
  id: string;
  type: 'takeout' | 'csv' | 'link' | 'geojson' | 'kml' | 'kmz';
  fileName?: string;
  totalItems: number;
  importedCount: number;
  skippedCount: number;
  errors: ImportError[];
  createdAt: Date;
}

export interface ImportError {
  row?: number;
  item?: string;
  reason: string;
}

export interface ImportResult {
  success: boolean;
  importedCount: number;
  skippedCount: number;
  errors: ImportError[];
  missingCoordinatesCount: number;
  duplicateCandidatesCount: number;
}

export interface ParsedPlace {
  title: string;
  address: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  tags?: string[];
  sourceUrl?: string;
  listName?: string; // For Takeout imports
}

export interface LinkList {
  id: string;
  title: string;
  description?: string;
  placeIds: string[];
  collectionIds: string[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  isPublic: boolean;
}

// Automated Transfer with Verification Types

export type TransferSessionStatus = 'pending' | 'processing' | 'verifying' | 'completed' | 'failed' | 'paused';

export interface TransferPackSession {
  id: string;
  packId: string;
  status: TransferSessionStatus;
  createdAt: Date;
  updatedAt: Date;
  
  // Processing metadata
  apiCallsUsed: number;
  processingTimeMs: number;
  errorCount: number;
  
  // Progress tracking
  totalPlaces: number;
  processedPlaces: number;
  verifiedPlaces: number;
  completedPlaces: number;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type VerificationStatus = 'pending' | 'accepted' | 'rejected' | 'manual';
export type VerifiedBy = 'user' | 'bulk_action';

export interface MatchFactor {
  type: 'name' | 'address' | 'distance' | 'category';
  score: number;
  weight: number;
  explanation: string;
}

export interface PlaceMatchRecord {
  id: string;
  sessionId: string;
  originalPlaceId: string;
  
  // Matching results
  targetPlaceData: string; // JSON serialized target place data
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  matchFactors: string; // JSON serialized MatchFactor[]
  
  // Verification status
  verificationStatus: VerificationStatus;
  verifiedAt?: Date;
  verifiedBy?: VerifiedBy;
  
  // Manual override data
  manualSearchQuery?: string;
  manualSelectedPlace?: string; // JSON serialized target place data
  userNotes?: string;
}
