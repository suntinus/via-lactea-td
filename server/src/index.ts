import { readConfig } from './config.js';
import { startServer } from './server.js';

const config = readConfig(process.env);

startServer({
  port: config.port,
  dataDir: config.dataDir,
  staticRoot: process.cwd(),
}).then((running) => {
  console.log(`Via Láctea TD by Suntinus em http://${running.host}:${running.port}`);
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Falha ao iniciar o servidor.';
  console.error(message);
  process.exit(1);
});
