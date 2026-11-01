import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendEnrollmentAccountsIssuedEmail } from "@/lib/email";
import { calculateDues, type DuesBreakdown } from "@/lib/dues";
import { ensureTeamCode } from "@/lib/teamCode";

// 紛らわしい文字（0/O/1/l/I 等）を除いた仮パスワード・ログインID用の文字を生成
const ID_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
export function genRandomString(len = 8): string {
  let out = "";
  const arr = new Uint32Array(len);
  if (typeof crypto !== "undefined" && (crypto as any).getRandomValues) {
    (crypto as any).getRandomValues(arr);
  } else {
    for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 4294967296);
  }
  for (let i = 0; i < len; i++) out += ID_CHARS[arr[i] % ID_CHARS.length];
  return out;
}

export interface PlayerAccountInput {
  playerName: string;
  playerNameKana?: string | null;
  grade?: number | null;
  birthDate?: Date | string | null;
  schoolName?: string | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  address?: string | null;
  healthNotes?: string | null;
  jerseyNumber?: string | null;
}

// 選手アカウント(User)＋保護者アカウント2つを自動作成し、家族向け配布ページを発行する。
// 選手には保護者アカウントを常に2つ自動生成する方針(既存のuser/create・bulk-createと同じ)。
// 入団申込み承認・団員リストからの手動追加・CSV一括登録、すべてここを共通で使う。
// 氏名(playerName)のみ必須。guardianEmailがあればアカウント発行メールを送る(団費内訳込み)。
export async function createPlayerAccountWithFamily(
  teamId: string,
  siblingRank: number,
  input: PlayerAccountInput
): Promise<{ playerId: string; onboardingToken: string; dues: DuesBreakdown }> {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { teamCode: true, name: true, maxUsers: true, duesClosingMonth: true, duesPaymentInfo: true },
  });
  if (!team) {
    throw new Error("所属チームが見つかりません。");
  }
  const teamCode = await ensureTeamCode(teamId);

  // 課金枠チェック（選手1人につき保護者2人まで無料）
  const members = await db.user.findMany({
    where: { teamId, graduated: false },
    include: { children: { select: { id: true } } },
  });
  const playerToParents = new Map<string, Set<string>>();
  members.forEach((m) => {
    if (m.role === "PARENT") {
      m.children.forEach((c) => {
        if (!playerToParents.has(c.id)) playerToParents.set(c.id, new Set());
        playerToParents.get(c.id)!.add(m.id);
      });
    }
  });
  const freeParents = new Set<string>();
  playerToParents.forEach((set) => Array.from(set).slice(0, 2).forEach((id) => freeParents.add(id)));
  let activeCount = 0;
  members.forEach((m) => {
    if (m.role === "PLAYER" || m.role === "MANAGER") activeCount++;
    else if (m.role === "PARENT" && !freeParents.has(m.id)) activeCount++;
  });
  if (activeCount + 1 > team.maxUsers) {
    throw new Error(`チームの登録人数上限（最大 ${team.maxUsers} 人）に達しているため、アカウントを作成できません。プラン変更が必要です。`);
  }

  const prefix = `${teamCode.toLowerCase()}_`;

  let memberLoginId = "";
  for (let i = 0; i < 5; i++) {
    const candidate = `${prefix}${genRandomString(6)}`;
    const dup = await db.user.findUnique({ where: { email: candidate } });
    if (!dup) {
      memberLoginId = candidate;
      break;
    }
  }
  if (!memberLoginId) {
    throw new Error("ログインIDの生成に失敗しました。もう一度お試しください。");
  }

  const memberTemp = genRandomString(8);
  const player = await db.user.create({
    data: {
      name: input.playerName,
      email: memberLoginId,
      password: await bcrypt.hash(memberTemp, 10),
      role: "PLAYER",
      grade: input.grade ?? null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      teamId,
      requiresPasswordChange: true,
      nameKana: input.playerNameKana ?? null,
      schoolName: input.schoolName ?? null,
      guardianName: input.guardianName ?? null,
      guardianRelation: input.guardianRelation ?? null,
      guardianPhone: input.guardianPhone ?? null,
      guardianEmail: input.guardianEmail ?? null,
      homeAddress: input.address ?? null,
      healthNotes: input.healthNotes ?? null,
      jerseyNumber: input.jerseyNumber ?? null,
    },
  });

  const parentInputs = [
    { name: input.guardianName || `${input.playerName}の保護者1`, suffix: "-1" },
    { name: `${input.playerName}の保護者2`, suffix: "-2" },
  ];
  const accounts: { userId: string; name: string; role: string; loginId: string; tempPassword: string }[] = [
    { userId: player.id, name: player.name, role: "PLAYER", loginId: memberLoginId, tempPassword: memberTemp },
  ];

  for (const p of parentInputs) {
    const parentLoginId = `${memberLoginId}${p.suffix}`;
    const parentTemp = genRandomString(8);
    const parent = await db.user.create({
      data: {
        name: p.name,
        email: parentLoginId,
        password: await bcrypt.hash(parentTemp, 10),
        role: "PARENT",
        teamId,
        requiresPasswordChange: true,
        children: { connect: { id: player.id } },
      },
    });
    accounts.push({ userId: parent.id, name: parent.name, role: "PARENT", loginId: parentLoginId, tempPassword: parentTemp });
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  await db.familyOnboarding.create({
    data: { token, teamId, accounts: JSON.stringify(accounts), expiresAt },
  });

  const feeItems = await db.duesFeeItem.findMany({ where: { teamId, active: true } });
  const dues = calculateDues(feeItems, input.grade ?? null, siblingRank, team.duesClosingMonth);

  if (input.guardianEmail && input.guardianEmail.includes("@")) {
    try {
      const currentMonth = new Date().getMonth() + 1;
      const thisMonthEntry = dues.monthlyByJoinMonth.find((m) => m.joinMonth === currentMonth);
      const emailDues = {
        ...dues,
        remainingMonthsThisYear: thisMonthEntry ? { remainingMonths: thisMonthEntry.remainingMonths, amount: thisMonthEntry.amount } : undefined,
      };
      await sendEnrollmentAccountsIssuedEmail(input.guardianEmail, team.name, input.playerName, token, emailDues, team.duesPaymentInfo);
    } catch (mailErr) {
      console.error("PLAYER_ACCOUNT_EMAIL_ERROR", mailErr);
    }
  }

  return { playerId: player.id, onboardingToken: token, dues };
}

// 進級時など、選手が登録済みの後になって団費の兄弟割引ランク(何人目の子か)を再判定したい場合に使う。
// 「保護者(parents)を共有している在籍中の選手」を兄弟とみなし、生年月日の古い順に1人目・2人目…と
// 数える。保護者の共有は/api/user/link-familyで明示的に紐付けた場合のみ成立する(初回作成時は
// 選手ごとに独立した保護者アカウントが作られるため、自動では兄弟とみなされない)。
// 生年月日が無い選手が対象、または兄弟の中に生年月日不明の選手がいて判定が信頼できない場合は、
// 「割引無し(1人目扱い)」に倒す(オーナー方針: 不確実な場合は割引しない)。
export async function deriveSiblingRank(
  playerId: string,
  teamId: string
): Promise<{ rank: number; uncertain: boolean }> {
  const player = await db.user.findUnique({
    where: { id: playerId },
    select: { birthDate: true, parents: { select: { id: true } } },
  });
  if (!player || !player.birthDate || player.parents.length === 0) {
    return { rank: 1, uncertain: !player?.birthDate };
  }

  const parentIds = player.parents.map((p) => p.id);
  const siblings = await db.user.findMany({
    where: {
      teamId,
      role: "PLAYER",
      graduated: false,
      parents: { some: { id: { in: parentIds } } },
    },
    select: { id: true, birthDate: true },
  });

  const anyMissingBirthDate = siblings.some((s) => !s.birthDate);
  const sorted = [...siblings].sort((a, b) => {
    if (!a.birthDate && !b.birthDate) return 0;
    if (!a.birthDate) return 1; // 生年月日不明は最後尾(=割引が大きくなる方向)には回さない
    if (!b.birthDate) return -1;
    return new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime();
  });
  const idx = sorted.findIndex((s) => s.id === playerId);
  return { rank: idx >= 0 ? idx + 1 : 1, uncertain: anyMissingBirthDate };
}
