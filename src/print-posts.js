const { PrismaClient } = require("@prisma/client");
const { PrismaNeon } = require("@prisma/adapter-neon");
const { neonConfig } = require("@neondatabase/serverless");
const ws = require("ws");

neonConfig.webSocketConstructor = ws;

require("dotenv").config();

let connectionString = process.env.DATABASE_URL;

// Vercel自動注入の個別変数を削除
delete process.env.POSTGRES_HOST;
delete process.env.POSTGRES_USER;
delete process.env.POSTGRES_PASSWORD;
delete process.env.POSTGRES_DATABASE;
delete process.env.PGHOST;
delete process.env.PGUSER;
delete process.env.PGPASSWORD;
delete process.env.PGDATABASE;

connectionString = connectionString
  .replace("channel_binding=require", "")
  .replace("-pooler", "")
  .replace("&&", "&")
  .replace("?&", "?")
  .replace(/\?$/, "")
  .replace(/&$/, "");

const matches = connectionString.match(/postgresql:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
const connectionConfig = {
  user: decodeURIComponent(matches[1]),
  password: decodeURIComponent(matches[2]),
  host: matches[3],
  port: matches[4] ? parseInt(matches[4], 10) : 5432,
  database: matches[5]
};

const adapter = new PrismaNeon({
  host: connectionConfig.host,
  port: connectionConfig.port,
  user: connectionConfig.user,
  password: connectionConfig.password,
  database: connectionConfig.database,
  ssl: true,
});

const prisma = new PrismaClient({ adapter });

async function run() {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    take: 5
  });
  console.log("LATEST POSTS:", JSON.stringify(posts, null, 2));
  await prisma.$disconnect();
}
run();
