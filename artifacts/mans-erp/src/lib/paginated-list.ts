/**
 * Normalize generated list-hook results, which may be either a legacy array
 * or the API's paginated { data: [...] } response envelope.
 */
export function unwrapPaginatedList<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (response && typeof response === "object" && "data" in response) {
    const data = (response as { data?: unknown }).data;
    return Array.isArray(data) ? (data as T[]) : [];
  }
  return [];
}
