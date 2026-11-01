const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const sqlite = require('better-sqlite3');

async function main() {
  console.log("Initializing database connection...");
  let prisma;
  try {
    const adapter = new PrismaBetterSqlite3({ url: "file:./dev.db" });
    prisma = new PrismaClient({ adapter });
    console.log("Connection initialized.");
  } catch (e) {
    console.error("Initialization failed:", e);
    return;
  }

  try {
    // 1. まずチームをフェッチして確認
    console.log("1. Fetching teams...");
    const teams = await prisma.team.findMany();
    console.log(`Found ${teams.length} teams.`);
    if (teams.length === 0) {
      console.log("No teams found. Stopping test.");
      return;
    }
    const teamId = teams[0].id;
    console.log(`Using Team ID: ${teamId} (${teams[0].name})`);

    // 2. チーム設定の更新処理をシミュレート
    console.log("2. Simulating Team Update...");
    const updated = await prisma.team.update({
      where: { id: teamId },
      data: {
        name: "豊川中央ボーイズ (テスト更新)",
        description: "テスト説明文",
        maxUsers: 70,
        hasScoreOption: true
      }
    });
    console.log("Update Success! New Name:", updated.name);

    // 3. 元に戻す
    console.log("3. Restoring Team Name...");
    await prisma.team.update({
      where: { id: teamId },
      data: {
        name: teams[0].name,
        description: teams[0].description,
        maxUsers: teams[0].maxUsers,
        hasScoreOption: teams[0].hasScoreOption
      }
    });
    console.log("Restore Success!");
  } catch (e) {
    console.error("Test failed with error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
