"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createWebsiteMenu,
  deleteWebsiteMenu,
  fetchWebsiteMenu,
  fetchWebsiteMenuSlots,
  fetchWebsiteMenus,
  updateWebsiteMenu,
  updateWebsiteMenuSlots,
} from "@/lib/api/website-menus";
import type {
  WebsiteMenu,
  WebsiteMenuInput,
  WebsiteMenuSlot,
  WebsiteMenuUpdateInput,
  MenuNavStyle,
} from "@/lib/website/website-menus";

export function useWebsiteMenus() {
  const [menus, setMenus] = useState<WebsiteMenu[]>([]);
  const [slots, setSlots] = useState<WebsiteMenuSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [menuRows, slotRows] = await Promise.all([
        fetchWebsiteMenus(),
        fetchWebsiteMenuSlots(),
      ]);
      setMenus(menuRows);
      setSlots(slotRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load menus");
      setMenus([]);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const getMenu = useCallback(async (id: string) => {
    return fetchWebsiteMenu(id);
  }, []);

  const create = useCallback(async (input: WebsiteMenuInput) => {
    const row = await createWebsiteMenu(input);
    setMenus((prev) => [...prev, row].sort((a, b) => a.sortOrder - b.sortOrder));
    return row;
  }, []);

  const update = useCallback(async (id: string, input: WebsiteMenuUpdateInput) => {
    const row = await updateWebsiteMenu(id, input);
    setMenus((prev) => prev.map((m) => (m.id === id ? row : m)));
    return row;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteWebsiteMenu(id);
    setMenus((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const saveSlots = useCallback(
    async (
      next: {
        slotKey: string;
        menuId: string;
        title?: string;
        navStyle?: MenuNavStyle;
      }[],
    ) => {
      const rows = await updateWebsiteMenuSlots(next);
      setSlots(rows);
      return rows;
    },
    [],
  );

  return {
    menus,
    slots,
    loading,
    error,
    refetch,
    getMenu,
    create,
    update,
    remove,
    saveSlots,
  };
}
