'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LinkListPageContent } from './link-list-content';

// Wrapper component to handle Suspense boundary for useSearchParams
function LinkListPageWrapper() {
  const params = useParams();
  const searchParams = useSearchParams();
  const linkListId = params.id as string;

  return (
    <LinkListPageContent 
      linkListId={linkListId} 
      searchParams={searchParams}
    />
  );
}

export default function LinkListPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Loading link list...</p>
      </div>
    }>
      <LinkListPageWrapper />
    </Suspense>
  );
}