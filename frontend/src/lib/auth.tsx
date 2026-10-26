import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import { api, type User } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: User | null }>("/auth/me"),
    staleTime: Infinity,
  });
  const setUser = (user: User | null) => {
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
    client.setQueryData(["me"], { user });
  };
  return (
    <AuthContext.Provider value={{ user: data?.user ?? null, loading: isLoading, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error("useAuth outside AuthProvider");
  return state;
}

export function homeFor(user: User | null): string {
  if (!user) return "/";
  return user.role === "teacher" ? "/teacher" : "/student";
}
