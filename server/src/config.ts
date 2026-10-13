export interface ServerConfig {
  port: number;
  host: '127.0.0.1';
  dataDir: string;
}

export function readConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const raw = env.PORT ?? '8030';
  if (!/^\d+$/.test(raw)) {
    throw new Error('PORT inválida: use um inteiro. Padrão reservado: 8030.');
  }
  const port = Number(raw);
  if (port < 1 || port > 65535) {
    throw new Error('PORT inválida: use um inteiro entre 1 e 65535.');
  }
  if (env.HOST !== undefined && env.HOST !== '127.0.0.1') {
    throw new Error('HOST precisa ser 127.0.0.1. O servidor não escuta em outras interfaces.');
  }
  const dataDir = env.DATA_DIR && env.DATA_DIR.trim() !== '' ? env.DATA_DIR : 'data';
  return { port, host: '127.0.0.1', dataDir };
}
