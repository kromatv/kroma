// A tiny, typed pattern-matcher replacing `if/else-if` and ternary ladders with
// a flat chain.

type Predicate<T> = (value: T) => boolean;
type Produce<T, R> = R | ((value: T) => R);

function evaluate<T, R>(produce: Produce<T, R>, value: T): R {
  return typeof produce === 'function' ? (produce as (value: T) => R)(value) : produce;
}

class Matcher<T, R = never> {
  private done = false;
  private result: unknown;

  constructor(private readonly value: T) {}

  /** `cond` is a predicate, or a value compared with `===`. */
  when<U>(cond: Predicate<T> | T, produce: Produce<T, U>): Matcher<T, R | U> {
    if (!this.done) {
      const hit =
        typeof cond === 'function' ? (cond as Predicate<T>)(this.value) : this.value === cond;
      if (hit) {
        this.done = true;
        this.result = evaluate(produce, this.value);
      }
    }
    return this as unknown as Matcher<T, R | U>;
  }

  otherwise<U>(fallback: Produce<T, U>): R | U {
    return (this.done ? this.result : evaluate(fallback, this.value)) as R | U;
  }
}

/** First match wins, and only the winning branch's producer is evaluated. */
export function match<T>(value: T): Matcher<T> {
  return new Matcher<T>(value);
}
