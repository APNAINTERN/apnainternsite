import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GlobalLoadingOverlay } from "@/components/GlobalLoadingOverlay";
import { loadingMessage } from "@/lib/loadingMessages";

type RegisterOptions = {
  message?: string;
};

type GlobalLoadingContextValue = {
  isLoading: boolean;
  message: string;
  register: (options?: RegisterOptions | string) => () => void;
  setMessage: (message: string) => void;
  withLoading: <T>(
    operation: () => Promise<T>,
    message?: string
  ) => Promise<T>;
};

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(null);

let nextToken = 0;

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const [message, setMessageState] = useState(loadingMessage("default"));
  const activeTokens = useRef(new Map<number, string>());
  const [activeCount, setActiveCount] = useState(0);

  const syncCount = useCallback(() => {
    setActiveCount(activeTokens.current.size);
    const entries = [...activeTokens.current.values()];
    if (entries.length > 0) {
      setMessageState(entries[entries.length - 1]);
    }
  }, []);

  const register = useCallback(
    (options?: RegisterOptions | string) => {
      const token = ++nextToken;
      const msg =
        typeof options === "string"
          ? options
          : options?.message ?? loadingMessage("default");
      activeTokens.current.set(token, msg);
      syncCount();

      return () => {
        if (activeTokens.current.delete(token)) {
          syncCount();
        }
      };
    },
    [syncCount]
  );

  const setMessage = useCallback((next: string) => {
    setMessageState(next);
    const tokens = [...activeTokens.current.keys()];
    const last = tokens[tokens.length - 1];
    if (last !== undefined) {
      activeTokens.current.set(last, next);
    }
  }, []);

  const withLoading = useCallback(
    async <T,>(operation: () => Promise<T>, msg = loadingMessage("processing")) => {
      const stop = register(msg);
      try {
        return await operation();
      } finally {
        stop();
      }
    },
    [register]
  );

  const value = useMemo(
    () => ({
      isLoading: activeCount > 0,
      message,
      register,
      setMessage,
      withLoading,
    }),
    [activeCount, message, register, setMessage, withLoading]
  );

  return (
    <GlobalLoadingContext.Provider value={value}>
      {children}
      <GlobalLoadingOverlay visible={activeCount > 0} message={message} />
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) {
    throw new Error("useGlobalLoading must be used within GlobalLoadingProvider");
  }
  return ctx;
}
