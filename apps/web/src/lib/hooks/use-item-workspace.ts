"use client";

import { useCallback, useEffect, useState } from "react";
import {
  COLLAB_ENTITY_ITEM,
  fetchCollabActivity,
  fetchCollabAiNotes,
  fetchCollabComments,
  fetchCollabFiles,
  fetchCollabWorkspace,
  type CollabActivity,
  type CollabAiNote,
  type CollabComment,
  type CollabFile,
  type CollabWorkspaceSummary,
} from "@/lib/api/collaboration";

type UseItemWorkspaceState = {
  summary: CollabWorkspaceSummary | null;
  activity: CollabActivity[];
  comments: CollabComment[];
  files: CollabFile[];
  aiNotes: CollabAiNote[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  refetchComments: () => Promise<void>;
  refetchActivity: () => Promise<void>;
};

export function useItemWorkspace(itemId: string | null | undefined): UseItemWorkspaceState {
  const [summary, setSummary] = useState<CollabWorkspaceSummary | null>(null);
  const [activity, setActivity] = useState<CollabActivity[]>([]);
  const [comments, setComments] = useState<CollabComment[]>([]);
  const [files, setFiles] = useState<CollabFile[]>([]);
  const [aiNotes, setAiNotes] = useState<CollabAiNote[]>([]);
  const [loading, setLoading] = useState(Boolean(itemId));
  const [error, setError] = useState<string | null>(null);

  const refetchComments = useCallback(async () => {
    if (!itemId) return;
    const rows = await fetchCollabComments(COLLAB_ENTITY_ITEM, itemId);
    setComments(rows);
  }, [itemId]);

  const refetchActivity = useCallback(async () => {
    if (!itemId) return;
    const res = await fetchCollabActivity(COLLAB_ENTITY_ITEM, itemId, { limit: 100 });
    setActivity(res.data);
  }, [itemId]);

  const refetch = useCallback(async () => {
    if (!itemId) {
      setSummary(null);
      setActivity([]);
      setComments([]);
      setFiles([]);
      setAiNotes([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ws, act, comm, fileRows, notes] = await Promise.all([
        fetchCollabWorkspace(COLLAB_ENTITY_ITEM, itemId),
        fetchCollabActivity(COLLAB_ENTITY_ITEM, itemId, { limit: 100 }),
        fetchCollabComments(COLLAB_ENTITY_ITEM, itemId),
        fetchCollabFiles(COLLAB_ENTITY_ITEM, itemId),
        fetchCollabAiNotes(COLLAB_ENTITY_ITEM, itemId),
      ]);
      setSummary(ws);
      setActivity(act.data);
      setComments(comm);
      setFiles(fileRows);
      setAiNotes(notes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workspace data");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    summary,
    activity,
    comments,
    files,
    aiNotes,
    loading,
    error,
    refetch,
    refetchComments,
    refetchActivity,
  };
}
