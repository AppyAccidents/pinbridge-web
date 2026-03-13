'use client';

import { useRouter } from 'next/navigation';
import { LinkListCreator } from '@/components/shared/link-list-creator';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function CreateLinkListPage() {
  const router = useRouter();

  const handleLinkListCreated = (linkListId: string) => {
    // Navigate to the created link list
    router.push(`/link-list/${linkListId}`);
  };

  const handleCancel = () => {
    // Navigate back to export page
    router.push('/export');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Export
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create Link List</h1>
          <p className="text-muted-foreground">
            Create a shareable page with clickable links to your places
          </p>
        </div>
      </div>

      {/* Link List Creator */}
      <LinkListCreator
        onLinkListCreated={handleLinkListCreated}
        onCancel={handleCancel}
      />
    </div>
  );
}