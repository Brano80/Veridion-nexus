// Auth token management utilities
// Placeholder implementations — full implementation in Phase 0.4 login

export function getAuthToken(): string | null {
  // Placeholder — will read from localStorage/cookies in Phase 0.4
  return null;
}

export function setAuthToken(token: string): void {
  // Placeholder — will write to localStorage/cookies in Phase 0.4
}

export function removeAuthToken(): void {
  // Placeholder — will clear localStorage/cookies in Phase 0.4
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) {
    return {
      'Authorization': `Bearer ${token}`,
    };
  }
  return {};
}
