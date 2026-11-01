import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database with realistic sample data...");

  // 全データ削除 (PushSubscriptionが追加されたため、それも消える)
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

  // チーム作成
  const team = await prisma.team.create({
    data: {
      name: "サンダース少年野球団",
      inviteCode: "THUNDER-2026",
      teamCode: "THUNDER",
      description: "野球の知識・技術を共有し、考える力を育てるチーム",
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
      name: "山田 太郎 (コーチ)",
      password: hashedPassword,
      role: "MANAGER",
      requiresPasswordChange: false,
      emailVerifiedAt: new Date(),
      teamId: team.id,
    },
  });

  // --- 2. 選手（PLAYER）作成 ---
  const playersData = [
    { name: "大谷 翔平", number: "17", pos: "投手/外野", bat: "左打", thr: "右投", grade: 6 },
    { name: "ダルビッシュ 有", number: "11", pos: "投手", bat: "右打", thr: "右投", grade: 6 },
    { name: "鈴木 誠也", number: "51", pos: "外野手", bat: "右打", thr: "右投", grade: 6 },
    { name: "吉田 正尚", number: "34", pos: "外野手", bat: "左打", thr: "右投", grade: 5 },
    { name: "村上 宗隆", number: "55", pos: "内野手", bat: "左打", thr: "右投", grade: 5 },
    { name: "近藤 健介", number: "8", pos: "外野手", bat: "左打", thr: "右投", grade: 5 },
    { name: "源田 壮亮", number: "2", pos: "内野手", bat: "左打", thr: "右投", grade: 4 },
    { name: "甲斐 拓也", number: "10", pos: "捕手", bat: "右打", thr: "右投", grade: 4 },
    { name: "中野 拓夢", number: "51", pos: "内野手", bat: "左打", thr: "右投", grade: 3 },
    { name: "岡本 和真", number: "25", pos: "内野手", bat: "右打", thr: "右投", grade: 3 },
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
  // 子供と紐づける（簡易的に最初の5人の選手の親として作成）
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
          connect: { id: createdPlayers[i].id }
        }
      },
    });
    createdParents.push(parent);
  }

  // --- 4. グループ作成 ---
  const groupManagers = await prisma.group.create({
    data: {
      name: "指導者・役員陣",
      teamId: team.id,
      members: {
        connect: [{ id: manager1.id }, { id: manager2.id }]
      }
    }
  });

  const groupParents = await prisma.group.create({
    data: {
      name: "父母会",
      teamId: team.id,
      members: {
        connect: createdParents.map(p => ({ id: p.id }))
      }
    }
  });

  const groupHighGrade = await prisma.group.create({
    data: {
      name: "高学年（レギュラー）",
      teamId: team.id,
      members: {
        connect: createdPlayers.slice(0, 7).map(p => ({ id: p.id }))
      }
    }
  });

  // --- 5. 予定・アンケートの作成 ---
  const today = new Date();
  
  // 明日の予定
  const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 9, 0);
  const tomorrowEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 15, 0);
  
  const event1 = await prisma.event.create({
    data: {
      title: "週末合同練習（高学年のみ）",
      type: "PRACTICE",
      description: "河川敷グラウンドで合同練習を行います。お弁当必須。",
      startTime: tomorrowStart,
      endTime: tomorrowEnd,
      location: "第一河川敷グラウンド",
      teamId: team.id,
      targetGroups: {
        connect: [{ id: groupHighGrade.id }]
      },
      polls: {
        create: [
          {
            question: "配車の確認（保護者用）",
            options: "車出せる(4人可),車出せる(2人可),配車お願いしたい",
            targetGroupId: groupParents.id
          }
        ]
      }
    }
  });

  // 週末の試合
  const weekendStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 10, 0);
  const weekendEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3, 13, 0);
  
  const event2 = await prisma.event.create({
    data: {
      title: "春季大会 第1回戦 vsライオンズ",
      type: "GAME",
      description: "絶対勝つぞ！集合は8:30です。",
      startTime: weekendStart,
      endTime: weekendEnd,
      location: "市民球場",
      teamId: team.id,
      polls: {
        create: [
          {
            question: "出欠確認",
            options: "参加（弁当あり）,参加（弁当なし）,欠席",
          }
        ]
      }
    }
  });

  // 出欠データを一部入れる
  await prisma.attendance.create({
    data: {
      eventId: event1.id,
      userId: createdPlayers[0].id,
      status: "ATTENDING"
    }
  });

  // --- 6. タイムライン投稿の作成 ---
  await prisma.post.create({
    data: {
      content: "新しい動画教材を「📚 コラム・教材」にアップしました！週末の練習前に必ずチェックして『👀 見たよ！』ボタンを押してください⚾",
      isInfo: true,
      authorId: manager1.id,
      teamId: team.id,
    }
  });

  await prisma.post.create({
    data: {
      content: "今日の素振り課題：トップの位置を固定して、インサイドアウトの軌道を意識しよう！動画でフォームを送ってくれたらフィードバックします💪",
      isInfo: false,
      authorId: manager2.id,
      teamId: team.id,
    }
  });

  // --- 7. SKILLBASE コラム・教材の作成 ---
  const col1 = await prisma.column.create({
    data: {
      teamId: team.id,
      authorId: manager1.id,
      title: "【全選手必修】強い打球を生む「割れ」とインサイドアウトの基本",
      category: "BATTING",
      isPinned: true,
      allowComments: true,
      targetType: "ALL",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      content: `## 1. なぜ「割れ（セパレーション）」が大事なのか？
バッティングで一番大切なのは、ステップする足が地面に着く瞬間に、グリップが後ろに残っている状態（＝割れ）を作ることです。

■ チェックポイント
・ステップ足が着地した瞬間、グリップは右肩（左打者は左肩）の後ろにあるか？
・頭の位置が前に突っ込んでいないか？
・軸足の内側（股関節）にしっかり体重が乗っているか？

## 2. 自宅でのティースタンド・素振りドリル
1日30スイングで構いません。「ゆっくり構えて、割れを作ってから一気に振る」ことを意識して素振りをしてみましょう！分からないことがあれば下のコメント欄で気軽に質問してください。`,
    },
  });

  const col2 = await prisma.column.create({
    data: {
      teamId: team.id,
      authorId: manager2.id,
      title: "【5・6年生向け】ケガを防ぎ球速を上げる！肩甲骨＆股関節ストレッチ",
      category: "PITCHING",
      isPinned: false,
      allowComments: true,
      targetType: "GRADES",
      targetGrades: "5,6",
      content: `## 投球前に必ず行う5分間ルーティン
球速アップと肘・肩のケガ予防には、腕の力ではなく「肩甲骨の可動域」と「股関節の柔軟性」が不可欠です。

■ 毎日のお風呂上がりにやろう！
・キャット＆ドッグ（背骨と肩甲骨を動かす）：10回
・ランジツイスト（股関節と胸椎の回旋）：左右10回ずつ
・シャドーピッチング（タオルを使って体重移動の確認）：20回`,
    },
  });

  await prisma.column.create({
    data: {
      teamId: team.id,
      authorId: manager1.id,
      title: "試合前日・当日の食事メニューと水分補給の基本（保護者の方も必見）",
      category: "NUTRITION",
      isPinned: false,
      allowComments: true,
      targetType: "ALL",
      content: `## 試合で最後までバテない体づくり
試合当日に最高のパフォーマンスを出すためには、前日の夕食と当日の朝食で「炭水化物（エネルギー源）」をしっかり蓄えることが大切です。

■ おすすめメニュー
・前日夜：ごはん＋うどん、鶏むね肉や豚肉の生姜焼き（揚げ物は控えめに）
・当日朝（試合3時間前）：おにぎり、バナナ、味噌汁、100%オレンジジュース`,
    },
  });

  // 既読・コメントのサンプルデータ
  await prisma.columnRead.createMany({
    data: [
      { columnId: col1.id, userId: createdPlayers[0].id },
      { columnId: col1.id, userId: createdPlayers[1].id },
      { columnId: col1.id, userId: createdPlayers[3].id },
      { columnId: col2.id, userId: createdPlayers[0].id },
    ],
  });

  await prisma.columnComment.create({
    data: {
      columnId: col1.id,
      authorId: createdPlayers[0].id,
      content: "監督、ありがとうございます！ステップした時に体が前に流れる癖があるので、軸足の内側を意識して今日素振りしてみます！",
    },
  });

  console.log("Seeding complete!");
  console.log("====================");
  console.log("Coach Login:  manager1@example.com / password123");
  console.log("Player Login: player1@example.com  / password123");
  console.log("Parent Login: parent1@example.com  / password123");
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
