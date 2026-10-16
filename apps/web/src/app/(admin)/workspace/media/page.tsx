"use client";

import { MediaLibraryPage } from "@/components/media/media-library-page";

export default function WorkspaceMediaPage() {
  return (
    <div className="-m-3 flex min-h-0 w-[calc(100%+1.5rem)] max-w-none flex-1 flex-col overflow-hidden lg:-m-4 lg:w-[calc(100%+2rem)]">
      <MediaLibraryPage title="Media" />
    </div>
  );
}
