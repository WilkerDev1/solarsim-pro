// Default-deny network in renderer-domain tests. Each HTTP test injects its own transport.
globalThis.fetch = async () => { throw new Error('Real network is forbidden in this test suite. Inject a synthetic transport.'); };
