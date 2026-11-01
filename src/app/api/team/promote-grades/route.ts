import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { graduatingGrade, gradeLabel } from "@/lib/grade";
import { syncGradeGroups } from "@/lib/gradeGroups";
import { deriveSiblingRank } from "@/lib/playerAccount";
import { calculateDues } from "@/lib/dues";
import { sendGradePromotionEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// 進級処理。全選手の学年を+1し、最上学年の選手は「卒団済み」にする（データは残す）。
// execute!==true のときはプレビュー（件数と卒団対象の一覧）だけ返す。
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const canManage =
      (session.user as any).isOwner || (session.user as any).canManageUsers || session.user.role === "MANAGER";
    if (!canManage || !session.user.teamId) {
      return NextResponse.json({ error: "権限がありません。" }, { status: 403 });
    }

    const { execute } = await req.json().catch(() => ({}));

    const team = await db.team.findUnique({
      where: { id: session.user.teamId },
      select: { name: true, category: true, duesClosingMonth: true, duesPaymentInfo: true },
    });
    const maxGrade = graduatingGrade(team?.category);

    const players = await db.user.findMany({
      where: { teamId: session.user.teamId, role: "PLAYER", graduated: false },
      select: { id: true, name: true, grade: true, guardianEmail: true, parents: { select: { id: true } } },
    });

    // 学年1..(max-1)は進級、maxは卒団、体験(0)/未設定はそのまま。
    const advancing = players.filter((p) => p.grade !== null && p.grade >= 1 && p.grade < maxGrade);
    const graduating = players.filter((p) => p.grade === maxGrade);

    if (execute !== true) {
      return NextResponse.json({
        preview: true,
        maxGrade,
        advancingCount: advancing.length,
        graduating: graduating.map((p) => ({ id: p.id, name: p.name })),
      });
    }

    // 1) 進級前に、現在アクティブな配信グループを全てアーカイブする。
    //    卒団で父母会等の顔ぶれも変わるため、学年グループに限らず全グループが対象。
    //    「そのシーズンに実際に所属していたメンバー」のスナップショットとして凍結し、
    //    新シーズンのグループは進級後にコーチが作り直す(同じ名前で再作成可)運用。
    const archivedResult = await db.group.updateMany({
      where: { teamId: session.user.teamId, isArchived: false, isObGroup: false },
      data: { isArchived: true },
    });

    // 2) 進級（学年+1）
    await db.user.updateMany({
      where: { teamId: session.user.teamId, role: "PLAYER", graduated: false, grade: { gte: 1, lt: maxGrade } },
      data: { grade: { increment: 1 } },
    });

    // 2.5) 進級した選手の新学年の団費を再計算し、保護者(guardianEmail登録済みのみ)へ通知する
    //     (2026-09-04追加)。兄弟割引ランクは、団員リストで保護者を紐付け済みの兄弟同士でのみ
    //     生年月日の古い順に自動判定される(deriveSiblingRank参照)。メール送信の失敗は進級処理
    //     自体を失敗させない(通知漏れがあっても進級は完了させる方針)。
    let notifiedCount = 0;
    if (advancing.length > 0) {
      const feeItems = await db.duesFeeItem.findMany({ where: { teamId: session.user.teamId, active: true } });
      for (const p of advancing) {
        if (!p.guardianEmail || !p.guardianEmail.includes("@")) continue;
        try {
          const newGrade = (p.grade ?? 0) + 1;
          const { rank } = await deriveSiblingRank(p.id, session.user.teamId);
          const dues = calculateDues(feeItems, newGrade, rank, team?.duesClosingMonth ?? 3);
          await sendGradePromotionEmail(p.guardianEmail, team?.name || "", p.name, gradeLabel(team?.category, newGrade), dues, team?.duesPaymentInfo);
          notifiedCount++;
        } catch (mailErr) {
          console.error("PROMOTE_GRADE_EMAIL_ERROR", p.id, mailErr);
        }
      }
    }

    // 3) 卒団対象の選手を graduated に
    const gradIds = graduating.map((p) => p.id);
    if (gradIds.length > 0) {
      await db.user.updateMany({ where: { id: { in: gradIds } }, data: { graduated: true } });
    }

    // 4) 卒団選手の保護者も卒団に（ただし在籍中の他の子がいる＝兄弟が残る保護者は残す）
    const guardianIds = [...new Set(graduating.flatMap((p) => p.parents.map((x) => x.id)))];
    const newlyGraduatedGuardianIds: string[] = [];
    for (const gid of guardianIds) {
      const guardian = await db.user.findUnique({
        where: { id: gid },
        select: { children: { select: { graduated: true } } },
      });
      if (guardian && guardian.children.length > 0 && guardian.children.every((c) => c.graduated)) {
        await db.user.update({ where: { id: gid }, data: { graduated: true } });
        newlyGraduatedGuardianIds.push(gid);
      }
    }

    // 5) 卒団した選手＋保護者をOB配信グループへ自動追加(チームに1つ、無ければ作成)。
    //    OBはこのグループ宛ての投稿のみ閲覧でき、指導者とだけメッセージできる制限付きアカウントになる。
    if (gradIds.length > 0) {
      let obGroup = await db.group.findFirst({
        where: { teamId: session.user.teamId, isObGroup: true },
        select: { id: true },
      });
      if (!obGroup) {
        obGroup = await db.group.create({
          data: { teamId: session.user.teamId, name: "OB", isObGroup: true },
          select: { id: true },
        });
      }
      const obMemberIds = [...gradIds, ...newlyGraduatedGuardianIds];
      await db.group.update({
        where: { id: obGroup.id },
        data: { members: { connect: obMemberIds.map((id) => ({ id })) } },
      });
    }

    // 念のための保険。上でチーム内の全グループ(OBグループ除く)を既にアーカイブ済みのため、
    // 通常はここで同期対象となるアクティブなグループは存在しない(no-op)。
    await syncGradeGroups(session.user.teamId);

    return NextResponse.json({
      success: true,
      advancingCount: advancing.length,
      graduatedCount: gradIds.length,
      archivedGroupCount: archivedResult.count,
      notifiedCount,
    });
  } catch (e) {
    console.error("promote-grades error:", e);
    return NextResponse.json({ error: "進級処理に失敗しました。" }, { status: 500 });
  }
}
