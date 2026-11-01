const { PrismaClient } = require("@prisma/client");
const { PrismaNeon } = require("@prisma/adapter-neon");
const { neonConfig } = require("@neondatabase/serverless");
const ws = require("ws");

neonConfig.webSocketConstructor = ws;

const connectionString =
  "postgresql://neondb_owner:npg_JHsD7zuk2OvV@ep-divine-surf-ao3ywsxd-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

process.env.DATABASE_URL = connectionString;

async function run() {
  console.log("Initializing WebSocket PrismaNeon Adapter with Standard URL...");
  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    console.log("Querying 5 absolute newest highlight posts...");
    const highlights = await prisma.post.findMany({
      where: {
        expiresAt: { not: null }
      },
      select: {
        id: true,
        content: true,
        imageUrl: true,
        isVideo: true,
        createdAt: true,
        expiresAt: true,
        author: { select: { name: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 5
    });

    console.log("Found 5 Newest Highlights:");
    highlights.forEach(h => {
      console.log(`- Author: ${h.author?.name}`);
      console.log(`  ID: ${h.id}`);
      console.log(`  Content: ${h.content}`);
      console.log(`  ImageUrl: ${h.imageUrl}`);
      console.log(`  IsVideo: ${h.isVideo}`);
      console.log(`  CreatedAt: ${h.createdAt}`);
      console.log(`  ExpiresAt: ${h.expiresAt}`);
    });
  } catch (err) {
    console.error("Diagnostic Query Error:", err);
  } finally {
    await prisma.$disconnect();
    console.log("Disconnected Prisma.");
  }
}

run();
