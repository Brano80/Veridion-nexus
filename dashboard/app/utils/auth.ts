export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ss_token');
}

export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('ss_token', token);
  }
}

export function removeAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('ss_token');
  }
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
