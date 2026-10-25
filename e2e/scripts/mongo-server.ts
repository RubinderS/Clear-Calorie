// An in-memory MongoDB for the e2e app servers, so tests need no local
// install or Docker. Each app server uses its own database on it. Playwright
// waits on the health port, which answers once mongod is accepting connections.
import {createServer} from 'node:http';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MONGO_HEALTH_PORT, MONGO_PORT} from '../env';

async function main() {
  const mongod = await MongoMemoryServer.create({
    instance: {port: MONGO_PORT, ip: '127.0.0.1'},
  });

  const health = createServer((_request, response) => {
    response.writeHead(200, {'content-type': 'text/plain'});
    response.end(mongod.getUri());
  }).listen(MONGO_HEALTH_PORT, '127.0.0.1');

  async function stop() {
    health.close();
    await mongod.stop();
    process.exit(0);
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
