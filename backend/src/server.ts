import { app } from './app';
import { env } from './config/env';

app.listen(env.port, () => {
  console.log(`[arcana-api] escuchando en http://localhost:${env.port} (${env.nodeEnv})`);
});
