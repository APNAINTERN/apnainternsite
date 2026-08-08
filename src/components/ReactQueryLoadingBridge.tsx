import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { loadingMessage } from "@/lib/loadingMessages";

function messageFromMeta(meta: unknown): string {
  if (meta && typeof meta === "object" && "loadingMessage" in meta) {
    const value = (meta as { loadingMessage?: unknown }).loadingMessage;
    if (typeof value === "string" && value.trim()) return value;
  }
  return loadingMessage("processing");
}

function shouldSkipGlobalLoading(meta: unknown): boolean {
  return Boolean(
    meta &&
      typeof meta === "object" &&
      "skipGlobalLoading" in meta &&
      (meta as { skipGlobalLoading?: unknown }).skipGlobalLoading
  );
}

export function ReactQueryLoadingBridge({ queryClient }: { queryClient: QueryClient }) {
  const { register } = useGlobalLoading();

  useEffect(() => {
    const mutationCleanups = new Map<number, () => void>();
    const queryCleanups = new Map<string, () => void>();

    const unsubMutations = queryClient.getMutationCache().subscribe((event) => {
      const mutation = event.mutation;
      if (!mutation) return;
      if (shouldSkipGlobalLoading(mutation.options.meta)) return;

      const id = mutation.mutationId;
      if (mutation.state.status === "pending" && !mutationCleanups.has(id)) {
        mutationCleanups.set(id, register(messageFromMeta(mutation.options.meta)));
      } else if (mutation.state.status !== "pending" && mutationCleanups.has(id)) {
        mutationCleanups.get(id)?.();
        mutationCleanups.delete(id);
      }
    });

    const unsubQueries = queryClient.getQueryCache().subscribe((event) => {
      const query = event.query;
      if (!query) return;
      if (shouldSkipGlobalLoading(query.meta)) return;

      const key = query.queryHash;
      const isInitialLoad = query.state.fetchStatus === "fetching" && query.state.status === "pending";

      if (isInitialLoad && !queryCleanups.has(key)) {
        queryCleanups.set(key, register(messageFromMeta(query.meta)));
      } else if (!isInitialLoad && queryCleanups.has(key)) {
        queryCleanups.get(key)?.();
        queryCleanups.delete(key);
      }
    });

    return () => {
      unsubMutations();
      unsubQueries();
      mutationCleanups.forEach((stop) => stop());
      queryCleanups.forEach((stop) => stop());
      mutationCleanups.clear();
      queryCleanups.clear();
    };
  }, [queryClient, register]);

  return null;
}
