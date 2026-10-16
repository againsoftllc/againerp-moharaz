"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminUser } from "@/lib/store/admin-auth-store";
import type { ApiUserCreate, ApiUserUpdate } from "@/lib/api/auth-users";
import { createAuthUser, deleteAuthUser, fetchAuthUsers, updateAuthUser } from "@/lib/api/auth-users";

export function useAuthUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuthUsers();
      setUsers(data);
      setTotal(data.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const createUser = useCallback(async (payload: ApiUserCreate) => {
    const created = await createAuthUser(payload);
    setUsers((prev) => [...prev, created]);
    setTotal((n) => n + 1);
    return created;
  }, []);

  const patchUser = useCallback(async (userId: string, patch: ApiUserUpdate) => {
    const updated = await updateAuthUser(userId, patch);
    setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    return updated;
  }, []);

  const removeUser = useCallback(async (userId: string) => {
    await deleteAuthUser(userId);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setTotal((n) => n - 1);
  }, []);

  return { users, total, loading, error, refetch, createUser, patchUser, removeUser };
}
