import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { db } from '@/lib/db';
import { transferSessionService } from '@/lib/services/transfer-session';
import { batchProcessingEngine } from '@/lib/services/batch-processing-engine';
import { transferExecutionEngine } from '@/lib/services/transfer-execution-engine';
import type { 
  TransferPack, 
  Place, 
  TransferPackSession,
  PlaceMatchRecord 
} from '@/types';

// Mock the API services
jest.mock('@/lib/services/api/apple-maps');
jest.mock('@/lib/services/api/google-maps');

describe('Automated Transfer Workflow Integration', () => {
  let testTransferPack: TransferPack;
  let testPlaces: Place[];

  beforeEach(async () => {
    // Clear test data
    await db.transferPacks.clear();
    await db.places.clear();
    await db.transferPackSessions.clear();
    await db.placeMatchRecords.clear();

    // Create test places
    testPlaces = [
      {
        id: 'place1',
        title: 'Central Park',
        address: '5th Ave, New York, NY 10028',
        latitude: 40.785091,
        longitude: -73.968285,
        tags: [],
        source: 'manual',
        normalizedTitle: 'central park',
        normalizedAddress: '5th ave new york ny 10028',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'place2',
        title: 'Times Square',
        address: 'Times Square, New York, NY 10036',
        latitude: 40.758896,
        longitude: -73.985130,
        tags: [],
        source: 'manual',
        normalizedTitle: 'times square',
        normalizedAddress: 'times square new york ny 10036',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'place3',
        title: 'Brooklyn Bridge',
        address: 'Brooklyn Bridge, New York, NY',
        latitude: 40.706086,
        longitude: -73.996864,
        tags: [],
        source: 'manual',
        normalizedTitle: 'brooklyn bridge',
        normalizedAddress: 'brooklyn bridge new york ny',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    await db.places.bulkAdd(testPlaces);

    // Create test transfer pack
    testTransferPack = {
      id: 'pack1',
      name: 'NYC Landmarks',
      target: 'apple',
      scopeType: 'library',
      scopeId: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.transferPacks.add(testTransferPack);
  });

  afterEach(async () => {
    // Clean up test data
    await db.transferPacks.clear();
    await db.places.clear();
    await db.transferPackSessions.clear();
    await db.placeMatchRecords.clear();
  });

  describe('Complete Automated Workflow', () => {
    it('should complete end-to-end automated transfer process', async () => {
      // Step 1: Create transfer session
      const session = await transferSessionService.createSession({
        packId: testTransferPack.id,
        totalPlaces: testPlaces.length,
      });

      expect(session).toBeDefined();
      expect(session.status).toBe('pending');
      expect(session.totalPlaces).toBe(3);

      // Step 2: Mock batch processing to create match records
      const mockMatches: Omit<PlaceMatchRecord, 'id'>[] = testPlaces.map((place, index) => ({
        sessionId: session.id,
        originalPlaceId: place.id,
        targetPlaceData: JSON.stringify({
          id: `apple_${place.id}`,
          name: place.title,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
        }),
        confidenceScore: 95 - (index * 5), // 95, 90, 85
        confidenceLevel: index === 0 ? 'high' : index === 1 ? 'high' : 'medium',
        matchFactors: JSON.stringify([
          {
            type: 'name' as const,
            score: 95,
            weight: 40,
            explanation: 'Exact name match',
          },
          {
            type: 'address' as const,
            score: 90,
            weight: 30,
            explanation: 'Address similarity',
          },
          {
            type: 'distance' as const,
            score: 100,
            weight: 20,
            explanation: 'Same coordinates',
          },
        ]),
        verificationStatus: 'pending',
      }));

      // Create match records
      for (const matchData of mockMatches) {
        await transferSessionService.createMatchRecord({
          sessionId: matchData.sessionId,
          originalPlaceId: matchData.originalPlaceId,
          targetPlaceData: JSON.parse(matchData.targetPlaceData),
          confidenceScore: matchData.confidenceScore,
          matchFactors: JSON.parse(matchData.matchFactors),
        });
      }

      // Update session to verifying status
      await transferSessionService.updateSessionStatus(session.id, 'verifying');
      await transferSessionService.updateSessionProgress({
        sessionId: session.id,
        processedPlaces: testPlaces.length,
      });

      // Step 3: Verify match records were created
      const matchRecords = await transferSessionService.getMatchRecordsForSession(session.id);
      expect(matchRecords).toHaveLength(3);

      const highConfidenceMatches = matchRecords.filter(m => m.confidenceLevel === 'high');
      const mediumConfidenceMatches = matchRecords.filter(m => m.confidenceLevel === 'medium');
      
      expect(highConfidenceMatches).toHaveLength(2);
      expect(mediumConfidenceMatches).toHaveLength(1);

      // Step 4: Simulate bulk acceptance of high confidence matches
      const highConfidenceIds = highConfidenceMatches.map(m => m.id);
      await transferSessionService.bulkUpdateMatchRecords(highConfidenceIds, {
        verificationStatus: 'accepted',
      });

      // Step 5: Manually accept the medium confidence match
      const mediumConfidenceMatch = mediumConfidenceMatches[0];
      await transferSessionService.updateMatchVerification(
        mediumConfidenceMatch.id,
        'accepted',
        'user'
      );

      // Step 6: Verify all matches are accepted
      const updatedMatches = await transferSessionService.getMatchRecordsForSession(session.id);
      const acceptedMatches = updatedMatches.filter(m => m.verificationStatus === 'accepted');
      expect(acceptedMatches).toHaveLength(3);

      // Step 7: Execute transfer
      const executionResult = await transferExecutionEngine.executeTransfers(session.id, {
        openInBrowser: false, // Don't actually open URLs in test
        generateOnly: true,
      });

      expect(executionResult.success).toBe(true);
      expect(executionResult.successfulTransfers).toBe(3);
      expect(executionResult.failedTransfers).toBe(0);
      expect(executionResult.generatedUrls).toHaveLength(3);

      // Step 8: Verify URLs were generated correctly
      const urls = executionResult.generatedUrls;
      
      // Check Apple Maps URLs
      urls.forEach(url => {
        expect(url.url).toContain('maps.apple.com');
        expect(url.targetService).toBe('apple');
        expect(url.opened).toBe(false); // Since we used generateOnly
      });

      // Step 9: Verify session is completed
      const finalSession = await transferSessionService.getSession(session.id);
      expect(finalSession?.status).toBe('completed');
      expect(finalSession?.completedPlaces).toBe(3);
    });

    it('should handle session recovery after interruption', async () => {
      // Step 1: Create session and partial progress
      const session = await transferSessionService.createSession({
        packId: testTransferPack.id,
        totalPlaces: testPlaces.length,
      });

      // Simulate partial processing - only process first 2 places
      const partialMatches = testPlaces.slice(0, 2).map(place => ({
        sessionId: session.id,
        originalPlaceId: place.id,
        targetPlaceData: {
          id: `apple_${place.id}`,
          name: place.title,
          address: place.address,
          latitude: place.latitude,
          longitude: place.longitude,
        },
        confidenceScore: 90,
        matchFactors: [
          {
            type: 'name' as const,
            score: 90,
            weight: 40,
            explanation: 'Good name match',
          },
        ],
      }));

      for (const matchData of partialMatches) {
        await transferSessionService.createMatchRecord(matchData);
      }

      // Update session to paused status (simulating interruption)
      await transferSessionService.updateSessionStatus(session.id, 'paused');
      await transferSessionService.updateSessionProgress({
        sessionId: session.id,
        processedPlaces: 2, // Only 2 out of 3 processed
      });

      // Step 2: Verify session can be recovered
      const recoveredSession = await transferSessionService.getSession(session.id);
      expect(recoveredSession?.status).toBe('paused');
      expect(recoveredSession?.processedPlaces).toBe(2);

      const existingMatches = await transferSessionService.getMatchRecordsForSession(session.id);
      expect(existingMatches).toHaveLength(2);

      // Step 3: Resume processing would continue with remaining places
      // In a real scenario, this would be handled by the batch processing engine
      await transferSessionService.updateSessionStatus(session.id, 'verifying');

      // Step 4: Verify session state is consistent
      const progressSummary = await transferSessionService.getSessionProgress(session.id);
      expect(progressSummary.matchCounts.total).toBe(2);
      expect(progressSummary.session?.status).toBe('verifying');
    });

    it('should handle manual search and override scenarios', async () => {
      // Step 1: Create session with a match that needs manual override
      const session = await transferSessionService.createSession({
        packId: testTransferPack.id,
        totalPlaces: 1,
      });

      const place = testPlaces[0];
      
      // Create a low-confidence match that would need manual review
      await transferSessionService.createMatchRecord({
        sessionId: session.id,
        originalPlaceId: place.id,
        targetPlaceData: {
          id: 'wrong_match',
          name: 'Wrong Place Name',
          address: 'Wrong Address',
          latitude: 0,
          longitude: 0,
        },
        confidenceScore: 30, // Low confidence
        matchFactors: [
          {
            type: 'name' as const,
            score: 30,
            weight: 40,
            explanation: 'Poor name match',
          },
        ],
      });

      // Step 2: Simulate manual search and selection
      const manualSearchResult = {
        id: 'manual_apple_place',
        name: place.title,
        address: place.address,
        latitude: place.latitude,
        longitude: place.longitude,
      };

      const matchRecords = await transferSessionService.getMatchRecordsForSession(session.id);
      const matchToOverride = matchRecords[0];

      await transferSessionService.setManualSearchData(
        matchToOverride.id,
        place.title, // search query
        manualSearchResult
      );

      // Step 3: Verify manual override was recorded
      const updatedMatch = await db.placeMatchRecords.get(matchToOverride.id);
      expect(updatedMatch?.verificationStatus).toBe('manual');
      expect(updatedMatch?.manualSearchQuery).toBe(place.title);
      expect(updatedMatch?.manualSelectedPlace).toBe(JSON.stringify(manualSearchResult));

      // Step 4: Execute transfer with manual override
      const executionResult = await transferExecutionEngine.executeTransfers(session.id, {
        openInBrowser: false,
        generateOnly: true,
      });

      expect(executionResult.success).toBe(true);
      expect(executionResult.successfulTransfers).toBe(1);
      
      // Verify the URL uses the manually selected place data
      const generatedUrl = executionResult.generatedUrls[0];
      expect(generatedUrl.url).toContain('Central'); // Should use manual selection (URL encoded)
    });

    it('should handle error scenarios gracefully', async () => {
      // Step 1: Create session
      const session = await transferSessionService.createSession({
        packId: testTransferPack.id,
        totalPlaces: testPlaces.length,
      });

      // Step 2: Create matches with mixed verification statuses
      const place1 = testPlaces[0];
      const place2 = testPlaces[1];

      // Valid match
      await transferSessionService.createMatchRecord({
        sessionId: session.id,
        originalPlaceId: place1.id,
        targetPlaceData: {
          id: 'valid_place',
          name: place1.title,
          address: place1.address,
          latitude: place1.latitude,
          longitude: place1.longitude,
        },
        confidenceScore: 95,
        matchFactors: [],
      });

      // Invalid match (missing required data)
      await transferSessionService.createMatchRecord({
        sessionId: session.id,
        originalPlaceId: place2.id,
        targetPlaceData: {
          id: 'invalid_place',
          // Missing name, address, coordinates
        },
        confidenceScore: 80,
        matchFactors: [],
      });

      // Accept both matches
      const matches = await transferSessionService.getMatchRecordsForSession(session.id);
      await transferSessionService.bulkUpdateMatchRecords(
        matches.map(m => m.id),
        { verificationStatus: 'accepted' }
      );

      // Step 3: Execute transfer and expect partial success
      const executionResult = await transferExecutionEngine.executeTransfers(session.id, {
        openInBrowser: false,
        generateOnly: true,
      });

      expect(executionResult.success).toBe(false); // Should fail due to invalid match
      expect(executionResult.successfulTransfers).toBe(1); // One valid transfer
      expect(executionResult.failedTransfers).toBe(1); // One failed transfer
      expect(executionResult.errors).toHaveLength(1);
      
      // Verify error details
      const error = executionResult.errors[0];
      expect(error.placeId).toBe(place2.id);
      expect(error.error).toContain('Insufficient place data');
    });
  });

  describe('Session Management', () => {
    it('should maintain data integrity across session lifecycle', async () => {
      // Create session
      const session = await transferSessionService.createSession({
        packId: testTransferPack.id,
        totalPlaces: testPlaces.length,
      });

      // Track session through all states
      const states: string[] = [];
      
      // Pending -> Processing
      await transferSessionService.updateSessionStatus(session.id, 'processing');
      states.push('processing');
      
      // Processing -> Verifying
      await transferSessionService.updateSessionStatus(session.id, 'verifying');
      states.push('verifying');
      
      // Verifying -> Completed
      await transferSessionService.updateSessionStatus(session.id, 'completed');
      states.push('completed');

      expect(states).toEqual(['processing', 'verifying', 'completed']);

      // Verify final session state
      const finalSession = await transferSessionService.getSession(session.id);
      expect(finalSession?.status).toBe('completed');
      expect(finalSession?.packId).toBe(testTransferPack.id);
      expect(finalSession?.totalPlaces).toBe(testPlaces.length);
    });

    it('should handle concurrent session operations', async () => {
      // Create multiple sessions
      const sessions = await Promise.all([
        transferSessionService.createSession({
          packId: testTransferPack.id,
          totalPlaces: 1,
        }),
        transferSessionService.createSession({
          packId: testTransferPack.id,
          totalPlaces: 2,
        }),
      ]);

      expect(sessions).toHaveLength(2);
      expect(sessions[0].id).not.toBe(sessions[1].id);

      // Update sessions concurrently
      await Promise.all([
        transferSessionService.updateSessionStatus(sessions[0].id, 'processing'),
        transferSessionService.updateSessionStatus(sessions[1].id, 'verifying'),
      ]);

      // Verify both sessions maintained their state
      const updatedSessions = await Promise.all([
        transferSessionService.getSession(sessions[0].id),
        transferSessionService.getSession(sessions[1].id),
      ]);

      expect(updatedSessions[0]?.status).toBe('processing');
      expect(updatedSessions[1]?.status).toBe('verifying');
    });
  });
});
