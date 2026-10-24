import type { Hono } from "hono";
/** Client identity the integration suites present: the minimum supported desktop release. */
export const TEST_CLIENT = "desktop/2.7.1";
/** Same app, but every request carries `X-SolarSim-Client` unless the caller sets its own. */
export function asClient(app: Hono, client = TEST_CLIENT): Hono {
  const wrapped = Object.create(app) as Hono;
  wrapped.request = ((input: any, init?: RequestInit, ...rest: any[]) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("X-SolarSim-Client"))
      headers.set("X-SolarSim-Client", client);
    return app.request(input, { ...init, headers }, ...rest);
  }) as Hono["request"];
  return wrapped;
}
