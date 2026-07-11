// A tiny monotonic guard for async races: each request takes a token when it
// starts, and only the most recently issued token is "current". Older in-flight
// requests that resolve late check isCurrent() and drop their result instead of
// overwriting newer state. invalidate() bumps the counter without issuing a
// token, so a context/tab switch can discard everything in flight.
//
// Used by the query runners so a slow older query (or a query from a context the
// user has since switched away from) can never clobber fresher results.
export interface Latest {
  begin: () => number;
  isCurrent: (token: number) => boolean;
  invalidate: () => void;
}

export function createLatest(): Latest {
  let seq = 0;
  return {
    begin: () => (seq += 1),
    isCurrent: (token: number) => token === seq,
    invalidate: () => {
      seq += 1;
    },
  };
}
