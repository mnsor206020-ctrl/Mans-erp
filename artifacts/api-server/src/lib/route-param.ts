/**
 * Express 5 types route parameters as string | string[] because wildcard
 * parameters can contain multiple segments. Named single-segment parameters
 * are strings at runtime; treat any unexpected array value as invalid.
 */
export function routeParam(value: string | string[] | undefined): string;
export function routeParam(params: object, key: string): string;
export function routeParam(
  valueOrParams: string | string[] | object | undefined,
  key?: string,
): string {
  const value =
    key === undefined
      ? valueOrParams
      : valueOrParams && typeof valueOrParams === "object"
        ? Object.getOwnPropertyDescriptor(valueOrParams, key)?.value
        : undefined;
  return typeof value === "string" ? value : "";
}
