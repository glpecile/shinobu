// @babel/core ships no types.
declare module '@babel/core' {
  export function transformSync(code: string, options: Record<string, unknown>): unknown;
}
