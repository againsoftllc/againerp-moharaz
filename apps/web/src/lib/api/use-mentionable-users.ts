"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMentionableUsers } from "@/lib/api/auth-users";
import type { MentionableUser } from "@/lib/activity/mentions";

let cachedUsers: MentionableUser[] | null = null;
let cachePromise: Promise<MentionableUser[]> | null = null;

async function loadMentionableUsers(): Promise<MentionableUser[]> {
  if (cachedUsers) return cachedUsers;
  if (!cachePromise) {
    cachePromise = fetchMentionableUsers()
      .then((users) => {
        cachedUsers = users;
        return cachedUsers;
      })
      .catch(() => {
        cachedUsers = [];
        return cachedUsers;
      });
  }
  return cachePromise;
}

export function useMentionableUsers() {
  const [users, setUsers] = useState<MentionableUser[]>(cachedUsers ?? []);
  const [loading, setLoading] = useState(!cachedUsers);

  const refetch = useCallback(async () => {
    cachedUsers = null;
    cachePromise = null;
    setLoading(true);
    const next = await loadMentionableUsers();
    setUsers(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void loadMentionableUsers().then((next) => {
      if (active) {
        setUsers(next);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return { users, loading, refetch };
}
