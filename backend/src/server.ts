import { env } from "./config/env.ts";
import { prisma } from "./infra/prisma.ts";
import { redisManager } from "./infra/redis.ts";
import { app } from "./app.ts";

const server = app.listen({
  hostname: env.host,
  port: env.port
});

console.log(`Backend listening at http://${env.host}:${env.port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await redisManager.close();
    await prisma.$disconnect();
    await server.stop();
    process.exit(0);
  });
}

