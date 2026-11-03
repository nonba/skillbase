import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database with realistic Junior High School baseball data...");

  // 全データ削除
  await prisma.columnComment.deleteMany();
  await prisma.columnBookmark.deleteMany();
  await prisma.columnRead.deleteMany();
  await prisma.column.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.like.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.eventPollAnswer.deleteMany();
  await prisma.eventPoll.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.batterStats.deleteMany();
  await prisma.pitcherStats.deleteMany();
  await prisma.event.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  // チーム作成（中学生チーム）
  const team = await prisma.team.create({
    data: {
      name: "サンダース中学硬式野球クラブ",
      category: "JUNIOR_HIGH",
      ballType: "HARD",
      inviteCode: "THUNDER-2026",
      teamCode: "THUNDER",
      description: "高校野球・その先を見据え、野球の知識・技術・考える力を育てる中学野球チーム",
      maxUsers: 50,
      scorePlan: "FULL",
    },
  });

  const hashedPassword = await bcrypt.hash("password123", 10);

  // --- 1. 指導者（MANAGER）作成 ---
  const manager1 = await prisma.user.create({
    data: {
      email: "manager1@example.com",
      name: "星野 仙一 (監督)",
      password: hashedPassword,
      role: "MANAGER",
      isOwner: true,
      requiresPasswordChange: false,
      emailVerifiedAt: new Date(),
      teamId: team.id,
    },
  });

  const manager2 = await prisma.user.create({
    data: {
      email: "manager2@example.com",
      name: "山田 太郎 (ヘッドコーチ)",
      password: hashedPassword,
      role: "MANAGER",
      requiresPasswordChange: false,
      emailVerifiedAt: new Date(),
      teamId: team.id,
    },
  });

  // --- 2. 選手（PLAYER：中1〜中3）作成 ---
  const playersData = [
    { name: "大谷 翔平", number: "17", pos: "投手/外野", bat: "左打", thr: "右投", grade: 3 },
    { name: "ダルビッシュ 有", number: "11", pos: "投手", bat: "右打", thr: "右投", grade: 3 },
    { name: "鈴木 誠也", number: "51", pos: "外野手", bat: "右打", thr: "右投", grade: 3 },
    { name: "吉田 正尚", number: "34", pos: "外野手", bat: "左打", thr: "右投", grade: 2 },
    { name: "村上 宗隆", number: "55", pos: "内野手", bat: "左打", thr: "右投", grade: 2 },
    { name: "近藤 健介", number: "8", pos: "外野手", bat: "左打", thr: "右投", grade: 2 },
    { name: "源田 壮亮", number: "6", pos: "遊撃手", bat: "左打", thr: "右投", grade: 2 },
    { name: "甲斐 拓也", number: "10", pos: "捕手", bat: "右打", thr: "右投", grade: 1 },
    { name: "中野 拓夢", number: "7", pos: "二塁手", bat: "左打", thr: "右投", grade: 1 },
    { name: "岡本 和真", number: "25", pos: "一塁/三塁", bat: "右打", thr: "右投", grade: 1 },
  ];

  const createdPlayers: any[] = [];
  for (let i = 0; i < playersData.length; i++) {
    const p = playersData[i];
    const player = await prisma.user.create({
      data: {
        email: `player${i + 1}@example.com`,
        name: p.name,
        password: hashedPassword,
        role: "PLAYER",
        requiresPasswordChange: false,
        emailVerifiedAt: new Date(),
        jerseyNumber: p.number,
        position: p.pos,
        battingHand: p.bat,
        throwingHand: p.thr,
        grade: p.grade,
        teamId: team.id,
      },
    });
    createdPlayers.push(player);
  }

  // --- 3. 保護者（PARENT）作成 ---
  const parentsData = [
    { name: "大谷 翔子 (母)", email: "parent1@example.com" },
    { name: "ダルビッシュ 健 (父)", email: "parent2@example.com" },
    { name: "鈴木 誠子 (母)", email: "parent3@example.com" },
    { name: "吉田 正男 (父)", email: "parent4@example.com" },
    { name: "村上 宗子 (母)", email: "parent5@example.com" },
  ];

  const createdParents: any[] = [];
  for (let i = 0; i < parentsData.length; i++) {
    const parent = await prisma.user.create({
      data: {
        email: parentsData[i].email,
        name: parentsData[i].name,
        password: hashedPassword,
        role: "PARENT",
        requiresPasswordChange: false,
        emailVerifiedAt: new Date(),
        teamId: team.id,
        children: {
          connect: { id: createdPlayers[i].id },
        },
      },
    });
    createdParents.push(parent);
  }

  // --- 4. グループ作成（中学生チーム向け） ---
  await prisma.group.create({
    data: {
      name: "指導者・スタッフ陣",
      teamId: team.id,
      members: {
        connect: [{ id: manager1.id }, { id: manager2.id }],
      },
    },
  });

  await prisma.group.create({
    data: {
      name: "保護者会",
      teamId: team.id,
      members: {
        connect: createdParents.map((p) => ({ id: p.id })),
      },
    },
  });

  const groupPitchers = await prisma.group.create({
    data: {
      name: "投手・バッテリー陣",
      teamId: team.id,
      members: {
        connect: [
          { id: createdPlayers[0].id },
          { id: createdPlayers[1].id },
          { id: createdPlayers[7].id },
        ],
      },
    },
  });

  await prisma.group.create({
    data: {
      name: "中2・中3（Aチーム遠征メンバー）",
      teamId: team.id,
      members: {
        connect: createdPlayers.slice(0, 7).map((p) => ({ id: p.id })),
      },
    },
  });

  // --- 5. タイムライン投稿の作成 ---
  await prisma.post.create({
    data: {
      content:
        "【連絡】新しい指導動画・座学コラムを「📚 コラム・教材」にアップしました！週末のオープン戦前に必ず目を通して『👀 見たよ！』ボタンを押しておくこと⚾",
      isInfo: true,
      authorId: manager1.id,
      teamId: team.id,
    },
  });

  await prisma.post.create({
    data: {
      content:
        "今週の自主練テーマ：トップの位置を深く作り、インサイドアウトの軌道で逆方向へ強いライナーを打つ意識を持とう。自宅素振りの動画をDMで送ってくれれば個別アドバイスします💪",
      isInfo: false,
      authorId: manager2.id,
      teamId: team.id,
    },
  });

  // --- 6. SKILLBASE コラム・教材の作成（中学生向け） ---
  const col1 = await prisma.column.create({
    data: {
      teamId: team.id,
      authorId: manager1.id,
      title: "【全選手必修】強い打球を生む「割れ（セパレーション）」とインサイドアウトの基本",
      category: "BATTING",
      isPinned: true,
      allowComments: true,
      targetType: "ALL",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      content: `## 1. 中学野球で最初に身につけるべき「割れ」の感覚
球速が上がり変化球も増える中学野球では、腕の力だけで振っていては差し込まれます。ステップ足が着地する瞬間にグリップが後ろに残っている状態（＝割れ）を作ることがすべての基本です。

■ セルフチェック3項目
・ステップ足が着地した瞬間、グリップは捕手側の肩の後ろに残っているか？
・変化球に泳がされたとき、頭と上体が投手方向に突っ込んでいないか？
・軸足の内側（股関節）にしっかり体重を溜められているか？

## 2. 自宅での素振り・ティードリル
1日50スイング、「ゆっくり構えて、割れを確認してから一気に振り抜く」ドリルを徹底しましょう。疑問点があれば下のコメント欄で質問してください！`,
    },
  });

  const col2 = await prisma.column.create({
    data: {
      teamId: team.id,
      authorId: manager2.id,
      title: "【中2・中3向け】高校野球を見据えたカウント別の狙い球整理とケース打撃",
      category: "TACTICS",
      isPinned: false,
      allowComments: true,
      targetType: "GRADES",
      targetGrades: "2,3",
      content: `## 1. 「ただ打席に立つ」から「根拠を持って狙う」へ
上級生（中2・中3）に求めるのは、試合の状況とカウントに応じたアプローチです。

■ カウント・状況別の基本方針
・0ボール0ストライク / 1ボール0ストライク：自分の最も得意なゾーン・球種（直球または浮いた変化球）を1球で仕留める準備
・無死・一死ランナー三塁：外野フライまたは強いゴロで確実に1点を取る（浅いポップフライ・三振を最も避ける）
・2ストライク追い込まれてから：ノーステップ気味のタイミングに切り替え、逆方向を基本にファウルで粘りながら甘い球を待つ`,
    },
  });

  const col3 = await prisma.column.create({
    data: {
      teamId: team.id,
      authorId: manager2.id,
      title: "【中1向け】成長期の肘・肩を守りながら球速を上げる！肩甲骨＆股関節モビリティ",
      category: "PITCHING",
      isPinned: false,
      allowComments: true,
      targetType: "GRADES",
      targetGrades: "1",
      content: `## 身長が伸びる中1の時期こそ「柔軟性と連動性」が最優先
中学1年生の時期は骨の成長スピードが速く、筋肉や関節が硬くなりやすい時期です。無理な投げ込みではなく、肩甲骨と股関節の可動域を広げることが球速アップと故障予防の近道になります。

■ 毎晩お風呂上がりの5分間ルーティン
・キャット＆ドッグ（胸椎・肩甲骨の連動）：10回
・ランジ＆ツイスト（股関節の伸展と胸の回旋）：左右10回ずつ
・シャドーピッチング（タオルを使い、軸足から踏み出し足への体重移動確認）：20回`,
    },
  });

  await prisma.column.create({
    data: {
      teamId: team.id,
      authorId: manager1.id,
      title: "【投手・バッテリー陣限定】牽制・クイックと配球のサイン確認シート",
      category: "PITCHING",
      isPinned: false,
      allowComments: true,
      targetType: "GROUPS",
      targetGroups: {
        connect: [{ id: groupPitchers.id }],
      },
      content: `## 走者を出した場面でのタイム目標
・クイックモーション：捕手への到達タイム 1.25秒以内を目標にする
・セットポジションでの静止：完全静止1秒を徹底し、首の動きと呼吸でランナーのスタートを封じる`,
    },
  });

  await prisma.column.create({
    data: {
      teamId: team.id,
      authorId: manager1.id,
      title: "【全学年・保護者向け】中学生期の体を大きくする！練習後30分以内の捕食と試合前日メニュー",
      category: "NUTRITION",
      isPinned: false,
      allowComments: true,
      targetType: "ALL",
      content: `## 中学生の3年間で「動ける強い体」をつくる
高校野球で通用する体格とスタミナを作るには、練習と同じくらい「食事のタイミングと量」が重要です。

■ ゴールデンタイム（練習直後30分以内）の捕食
・練習が終わったら帰りの車やグラウンドで、すぐにおにぎり1〜2個＋プロテイン（または100%オレンジジュース・鮭おにぎり等）を摂ることで筋肉の分解を防ぎ、疲労回復が劇的に早まります。

■ 試合前日夕食・当日朝食のポイント
・前日夜：白米を普段より多めに＋鶏むね肉や豚肉の生姜焼き＋具だくさん味噌汁（消化に時間がかかる揚げ物は控える）
・当日朝（集合2時間半〜3時間前）：おにぎり、うどん、バナナ、味噌汁でエネルギーを満タンにしてグラウンドへ！`,
    },
  });

  // 既読・コメントのサンプルデータ
  await prisma.columnRead.createMany({
    data: [
      { columnId: col1.id, userId: createdPlayers[0].id },
      { columnId: col1.id, userId: createdPlayers[1].id },
      { columnId: col1.id, userId: createdPlayers[3].id },
      { columnId: col2.id, userId: createdPlayers[0].id },
      { columnId: col3.id, userId: createdPlayers[7].id },
    ],
  });

  await prisma.columnComment.create({
    data: {
      columnId: col1.id,
      authorId: createdPlayers[0].id,
      content:
        "監督、ありがとうございます！変化球に泳がされた時に上体が前に突っ込む癖があるので、軸足の股関節に溜める意識で今日の素振り50本やります！",
    },
  });

  console.log("Seeding complete!");
  console.log("====================");
  console.log("Coach Login:       manager1@example.com / password123");
  console.log("Player (中3) Login: player1@example.com  / password123");
  console.log("Player (中2) Login: player4@example.com  / password123");
  console.log("Player (中1) Login: player8@example.com  / password123");
  console.log("Parent Login:      parent1@example.com  / password123");
  console.log("====================");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
