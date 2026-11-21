/**
 * supertest, but against one long-lived server per app listening on the IPv6
 * loopback (::1) instead of a fresh server per request reached via 127.0.0.1.
 *
 * Why: on a dev Mac other programs (e.g. VM/Docker/SSH port forwarders) listen
 * on 127.0.0.1 random ports. When one picked the same port as a per-request
 * test server, the request went to it instead (we literally got back
 * "SSH-2.0-OpenSSH…"), failing random tests with empty 404s or
 * "Parse Error: Expected HTTP/". ::1 keeps test traffic off those listeners.
 * Wired in through moduleNameMapper in jest.config.js.
 */
const http = require('http');
const supertest = require('supertest/index.js');

const urls = new WeakMap();

/** Start the shared server for an app (tests/setup.js calls this in beforeAll). */
function listen(app) {
    if (urls.has(app)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.once('error', reject);
        server.listen(0, '::1', () => {
            server.unref(); // never keeps Jest alive
            urls.set(app, `http://[::1]:${server.address().port}`);
            resolve();
        });
    });
}

function baseUrl(app) {
    if (typeof app !== 'function') return app; // already a server or URL
    const url = urls.get(app);
    if (!url) throw new Error('Shared test server not started: require("./setup") in this test file');
    return url;
}

module.exports = (app) => supertest(baseUrl(app));
module.exports.agent = (app, options) => supertest.agent(baseUrl(app), options);
module.exports.listen = listen;
