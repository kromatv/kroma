/** One file on its way through Metro, as a babel transformer is handed it. */
export interface TransformInput {
  src: string;
  filename: string;
  options: unknown;
  plugins: unknown;
}

export declare function transform(input: TransformInput): Promise<unknown>;
export declare function getCacheKey(): string;
