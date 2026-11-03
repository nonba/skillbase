"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import BulkRegisterModal from "@/components/BulkRegisterModal";
import { gradeOptions, gradeLabel } from "@/lib/grade";

interface Member {
  id: string;
  name: string;
  email?: string;
  role: string;
  jerseyNumber: string | null;
  position: string | null;
  battingHand: string | null;
  throwingHand: string | null;
  grade?: number | null;
  parentRelation?: string | null;
  isOwner?: boolean;
  canManageSchedule?: boolean;
  canManageUsers?: boolean;
  canManagePosts?: boolean;
  canManageScore?: boolean;
  groups?: { id: string; name: string }[];
  parents?: { id: string; name: string; email?: string }[];
  children?: { id: string; name: string; email?: string }[];
  requiresPasswordChange?: boolean; // true=まだ初ログイン(有効化)していない仮アカ
  graduated?: boolean; // 卒団済み
  createdAt?: string;
}

interface Group {
  id: string;
  name: string;
  scheduleFullAccess?: boolean;
  isArchived?: boolean;
  members: {
    id: string;
    name: string;
    role: string;
    jerseyNumber: string | null;
  }[];
}

// 保護者の続柄バッジ（グループ分け・連絡時に立場をひと目で判別するため）
function relationBadge(relation?: string | null): string | null {
  if (relation === "FATHER") return "父";
  if (relation === "MOTHER") return "母";
  if (relation === "OTHER") return "その他";
  return null;
}

export default function RosterPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("roster");
  const [error, setError] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupGrades, setNewGroupGrades] = useState<number[]>([]);
  const [newGroupUserIds, setNewGroupUserIds] = useState<string[]>([]);
  const [createLoading, setCreateLoading] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showArchivedGroups, setShowArchivedGroups] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [groupMembersError, setGroupMembersError] = useState("");
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("PARENT");
  const [saveError, setSaveError] = useState("");
  // 仮パスワード再発行用
  const [reissueLoading, setReissueLoading] = useState(false);
  const [reissuedPassword, setReissuedPassword] = useState("");
  const [reissueError, setReissueError] = useState("");
  const [jerseyNumber, setJerseyNumber] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [position, setPosition] = useState("");
  const [throwingHand, setThrowingHand] = useState("");
  const [battingHand, setBattingHand] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [parentRelation, setParentRelation] = useState<string>("");
  const [selectedChildrenIds, setSelectedChildrenIds] = useState<string[]>([]);
  const [selectedParentIds, setSelectedParentIds] = useState<string[]>([]);
  // 選手編集：既存の家族を後から紐付ける
  const [showLinkFamily, setShowLinkFamily] = useState(false);
  const [linkSiblingId, setLinkSiblingId] = useState("");
  const [linkPersonId, setLinkPersonId] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState("");
  
  // 権限管理用State
  const [editCanManageSchedule, setEditCanManageSchedule] = useState(false);
  const [editCanManageUsers, setEditCanManageUsers] = useState(false);
  const [editCanManagePosts, setEditCanManagePosts] = useState(false);
  const [editCanManageScore, setEditCanManageScore] = useState(false);

  // 新規メンバー追加用State
  const [showManagerInviteModal, setShowManagerInviteModal] = useState(false);
  const [copiedManagerLink, setCopiedManagerLink] = useState(false);
  const [showCreateMemberModal, setShowCreateMemberModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  // 進級処理
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promotePreview, setPromotePreview] = useState<{ advancingCount: number; graduating: { id: string; name: string }[] } | null>(null);
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberLoginId, setNewMemberLoginId] = useState("");
  const [newMemberPassword, setNewMemberPassword] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("PLAYER");
  const [newMemberPosition, setNewMemberPosition] = useState("コーチ");
  const [newMemberSiblingId, setNewMemberSiblingId] = useState("");
  const [createMemberLoading, setCreateMemberLoading] = useState(false);
  const [createMemberError, setCreateMemberError] = useState("");
  const [createResult, setCreateResult] = useState<{ parents: { loginId: string; name: string; tempPassword: string }[]; playerName: string } | null>(null);
  
  // まとめて削除用State
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [membersToDelete, setMembersToDelete] = useState<string[]>([]);

  const { data: teamRes, mutate: mutateTeam } = useSWR(session?.user?.teamId ? "/api/team/info" : null, fetcher);
  const { data: groupsRes, mutate: mutateGroups } = useSWR(session?.user?.teamId && session?.user?.role === "MANAGER" ? "/api/group" : null, fetcher);

  const members = teamRes?.team?.members || [];
  const teamCategory = teamRes?.team?.category || "ELEMENTARY";
  const loading = !teamRes && !!session?.user?.teamId;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // 名簿を開いたタイミングで、条件を満たした未使用の仮保護者アカ（30日超）を掃除する。
  // 常駐cronが無い環境向けの遅延クリーンアップ。管理者のみ実行。
  useEffect(() => {
    const canManage = session?.user?.role === "MANAGER" || (session?.user as any)?.isOwner || (session?.user as any)?.canManageUsers;
    if (!session?.user?.teamId || !canManage) return;
    fetch("/api/team/cleanup-provisional-parents", { method: "POST" })
      .then((r) => r.json())
      .then((d) => { if (d?.deleted > 0) mutateTeam(); })
      .catch(() => {});
    // 初回マウント時に一度だけでよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.teamId]);

  useEffect(() => {
    if (groupsRes?.groups) {
      setGroups(groupsRes.groups);
      if (selectedGroup) {
        const updated = groupsRes.groups.find((g: Group) => g.id === selectedGroup.id);
        if (updated) {
          setSelectedGroup(updated);
          setSelectedUserIds(updated.members.map((m: any) => m.id));
        }
      }
    }
  }, [groupsRes, selectedGroup]);

  const handleReissuePassword = async () => {
    if (!editingMember) return;
    if (!confirm(`${editingMember.name} さんの仮パスワードを再発行しますか？\n※古いパスワードは使えなくなります。`)) return;
    setReissueError("");
    setReissuedPassword("");
    setReissueLoading(true);
    try {
      const res = await fetch("/api/user/reset-temp-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: editingMember.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReissueError(data.error || "再発行に失敗しました。");
        return;
      }
    } catch (e: any) {
      setReissueError("通信エラーが発生しました。");
    } finally {
      setReissueLoading(false);
    }
  };

  // 保護者アカウントの仮パスワード一括・ワンタップ再発行用
  const [parentReissueResults, setParentReissueResults] = useState<{ [parentId: string]: string }>({});
  const [parentReissueLoading, setParentReissueLoading] = useState<{ [parentId: string]: boolean }>({});

  const handleReissueParentPassword = async (parentId: string, parentName: string) => {
    if (!confirm(`${parentName} さんの仮パスワードを再発行しますか？\n※古いパスワードは使えなくなります。`)) return;
    setParentReissueLoading((prev) => ({ ...prev, [parentId]: true }));
    try {
      const res = await fetch("/api/user/reset-temp-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: parentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "再発行に失敗しました。");
        return;
      }
      setParentReissueResults((prev) => ({ ...prev, [parentId]: data.tempPassword }));
    } catch {
      alert("通信エラーが発生しました。");
    } finally {
      setParentReissueLoading((prev) => ({ ...prev, [parentId]: false }));
    }
  };

  const openPromote = async () => {
    setPromoteLoading(true);
    setPromotePreview(null);
    setShowPromoteModal(true);
    try {
      const res = await fetch("/api/team/promote-grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) setPromotePreview({ advancingCount: data.advancingCount, graduating: data.graduating || [] });
    } catch {}
    finally { setPromoteLoading(false); }
  };

  const runPromote = async () => {
    setPromoteLoading(true);
    try {
      const res = await fetch("/api/team/promote-grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execute: true }),
      });
      const data = await res.json();
      if (res.ok) {
        await mutateTeam();
        if (session?.user?.role === "MANAGER") await mutateGroups();
        setShowPromoteModal(false);
        alert(`進級処理が完了しました。\n進級: ${data.advancingCount}名 / 卒団: ${data.graduatedCount}名 / アーカイブしたグループ: ${data.archivedGroupCount}件\n\n新年度のグループは「配信グループ管理」タブから作り直してください。`);
      } else {
        alert(data.error || "進級処理に失敗しました。");
      }
    } catch {
      alert("通信エラーが発生しました。");
    } finally {
      setPromoteLoading(false);
    }
  };

  const handleLinkFamily = async (payload: { siblingId?: string; personId?: string }) => {
    if (!editingMember) return;
    setLinkError("");
    setLinkLoading(true);
    try {
      const res = await fetch("/api/user/link-family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: editingMember.id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLinkError(data.error || "紐付けに失敗しました。");
        return;
      }
      await mutateTeam();
      setShowLinkFamily(false);
      setLinkSiblingId("");
      setLinkPersonId("");
    } catch {
      setLinkError("通信エラーが発生しました。");
    } finally {
      setLinkLoading(false);
    }
  };

  const handleEditClick = (member: Member) => {
    setEditingMember(member);
    setEditName(member.name || "");
    setEditRole(member.role || "PARENT");
    setReissuedPassword("");
    setReissueError("");
    setParentReissueResults({});
    setParentReissueLoading({});
    setJerseyNumber(member.jerseyNumber || "");
    setPosition(member.position || (member.role === "MANAGER" ? "コーチ" : "投手"));
    setBattingHand(member.battingHand || "右打");
    setThrowingHand(member.throwingHand || "右投");
    setSelectedChildrenIds(member.children?.map(c => c.id) || []);
    setSelectedParentIds(member.parents?.map(p => p.id) || []);
    setGrade(member.grade !== null && member.grade !== undefined ? String(member.grade) : "");
    setParentRelation(member.parentRelation || "");

    // 権限フラグ
    setEditCanManageSchedule(member.canManageSchedule || false);
    setEditCanManageUsers(member.canManageUsers || false);
    setEditCanManagePosts(member.canManagePosts || false);
    setEditCanManageScore(member.canManageScore || false);

    setShowLinkFamily(false);
    setLinkSiblingId("");
    setLinkPersonId("");
    setLinkError("");
    setSaveError("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    setSaveError("");
    setSaveLoading(true);

    try {
      const isPlayer = editingMember.role === "PLAYER";
      const targetRole = isPlayer ? "PLAYER" : editRole;
      const res = await fetch("/api/user/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editingMember.id,
          name: editName,
          role: targetRole,
          jerseyNumber: jerseyNumber || null,
          position: isPlayer ? position : (targetRole === "MANAGER" ? (position || "コーチ") : null),
          battingHand: isPlayer ? battingHand : undefined,
          throwingHand: isPlayer ? throwingHand : undefined,
          grade: isPlayer ? (grade === "" ? null : Number(grade)) : undefined,
          parentRelation: (!isPlayer && targetRole === "PARENT") ? (parentRelation === "" ? null : parentRelation) : undefined,
          canManageSchedule: targetRole === "MANAGER" ? editCanManageSchedule : false,
          canManageUsers: targetRole === "MANAGER" ? editCanManageUsers : false,
          canManagePosts: targetRole === "MANAGER" ? editCanManagePosts : false,
          canManageScore: targetRole === "MANAGER" ? editCanManageScore : false,
          childrenIds: !isPlayer ? selectedChildrenIds : undefined,
          // 選手側の家族はチェックボックス廃止＝表示のみのため、ここでは親IDを更新しない
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "プロフィールの更新に失敗しました。");
      }

      setEditingMember(null);
      await mutateTeam();
      
      // グループ側のデータも古くなっている可能性があるため再取得
      if (session?.user?.role === "MANAGER") {
        await mutateGroups();
      }
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMemberError("");
    setCreateMemberLoading(true);

    try {
      const res = await fetch("/api/user/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newMemberName,
          loginId: newMemberLoginId,
          password: newMemberPassword,
          role: newMemberRole,
          position: newMemberRole === "MANAGER" ? newMemberPosition : undefined,
          siblingId: newMemberRole === "PLAYER" && newMemberSiblingId ? newMemberSiblingId : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "メンバーの作成に失敗しました。");
      }

      setNewMemberName("");
      setNewMemberLoginId("");
      setNewMemberPassword("");
      setNewMemberRole("PLAYER");
      setNewMemberSiblingId("");
      await mutateTeam();
      if (data.parents && data.parents.length > 0) {
        // 自動生成された保護者の仮パスは、この画面でしか確認できないので表示する
        setCreateResult({ parents: data.parents, playerName: data.user?.name || "" });
      } else {
        setShowCreateMemberModal(false);
        alert(
          data.linkedSiblingParents > 0
            ? `新しいメンバーを作成し、兄弟の保護者${data.linkedSiblingParents}名を引き継ぎました！`
            : "新しいメンバーを作成しました！"
        );
      }
    } catch (err: any) {
      setCreateMemberError(err.message);
    } finally {
      setCreateMemberLoading(false);
    }
  };

  const handleDeleteMember = async (memberId: string, memberName: string) => {
    if (!confirm(`本当に ${memberName} を削除しますか？この操作は取り消せません。`)) {
      return;
    }
    try {
      const res = await fetch(`/api/user/${memberId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "メンバーの削除に失敗しました。");
      }
      alert("メンバーを削除しました。");
      await mutateTeam();
      if (session?.user?.role === "MANAGER") {
        await mutateGroups();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBulkDelete = async () => {
    if (membersToDelete.length === 0) return;
    if (!confirm(`選択した ${membersToDelete.length} 名のメンバーを本当に削除しますか？この操作は取り消せません。`)) {
      return;
    }
    
    // 一括削除処理
    try {
      for (const id of membersToDelete) {
        const res = await fetch(`/api/user/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("削除中にエラーが発生しました。");
      }
      alert("選択したメンバーを削除しました。");
      setIsDeleteMode(false);
      setMembersToDelete([]);
      await mutateTeam();
      if (session?.user?.role === "MANAGER") await mutateGroups();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteGroup = async (group: Group) => {
    if (!confirm(`グループ「${group.name}」を削除しますか？この操作は取り消せません。`)) return;
    try {
      const res = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", groupId: group.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "グループの削除に失敗しました。");
        return;
      }
      if (selectedGroup?.id === group.id) setSelectedGroup(null);
      await mutateGroups();
    } catch {
      alert("通信エラーが発生しました。");
    }
  };

  const handleToggleArchiveGroup = async (group: Group, archive: boolean) => {
    if (archive && !confirm(`グループ「${group.name}」をアーカイブしますか？\n投稿・予定の宛先選択には出なくなりますが、データは残り、今のメンバーは引き続き過去の投稿を閲覧できます。`)) return;
    try {
      const res = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: archive ? "archive" : "unarchive", groupId: group.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "操作に失敗しました。");
        return;
      }
      if (selectedGroup?.id === group.id) setSelectedGroup(null);
      await mutateGroups();
    } catch {
      alert("通信エラーが発生しました。");
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreateLoading(true);

    try {
      const res = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: newGroupName,
          grades: newGroupGrades.length > 0 ? newGroupGrades : undefined,
          userIds: newGroupUserIds.length > 0 ? newGroupUserIds : undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setNewGroupName("");
        setNewGroupGrades([]);
        setNewGroupUserIds([]);
        await mutateGroups();
        // 作成時にメンバーも指定済みなので、編集モーダルは自動では開かない（一覧から選べば開く）
        setSelectedGroup(null);
        setSelectedUserIds([]);
      } else {
        alert(data.error || "グループの作成に失敗しました。");
      }
    } catch (err) {
      console.error(err);
      alert("通信エラーが発生しました。");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleSaveGroupMembers = async () => {
    if (!selectedGroup) return;
    setGroupMembersLoading(true);
    setGroupMembersError("");

    try {
      const res = await fetch("/api/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateMembers",
          groupId: selectedGroup.id,
          userIds: selectedUserIds,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        await mutateGroups();
        await mutateTeam(); // 名簿の所属グループバッジ表示を更新
        setSelectedGroup(null); // モーダルを閉じる
      } else {
        setGroupMembersError(data.error || "メンバーの更新に失敗しました。");
      }
    } catch (err) {
      console.error(err);
      setGroupMembersError("通信エラーが発生しました。");
    } finally {
      setGroupMembersLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <main className="container animate-fade-in" style={{ padding: "24px", paddingBottom: "100px" }}>
        <div className="skeleton skeleton-text" style={{ width: "200px", height: "32px", marginBottom: "24px" }}></div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
          <div className="skeleton skeleton-text" style={{ width: "100px", height: "40px", borderRadius: "20px" }}></div>
          <div className="skeleton skeleton-text" style={{ width: "100px", height: "40px", borderRadius: "20px" }}></div>
        </div>
        <div className="grid-responsive">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card card-glass skeleton-card">
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <div className="skeleton skeleton-avatar"></div>
                <div style={{ flex: 1 }}>
                  <div className="skeleton skeleton-text short"></div>
                  <div className="skeleton skeleton-text" style={{ width: "40%" }}></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  const isManager = session?.user?.role === "MANAGER";
  const canManageUsers = isManager || (session?.user as any)?.isOwner || (session?.user as any)?.canManageUsers;

  // ライセンス枠（有料カウント対象者数）の集計
  const getActiveMemberCount = () => {
    const active = members.filter((m: any) => !m.graduated); // 卒団済みは利用枠に数えない
    const playerToParentsMap = new Map<string, Set<string>>();
    active.forEach((member: any) => {
      if (member.role === "PARENT") {
        member.children?.forEach((child: any) => {
          if (!playerToParentsMap.has(child.id)) {
            playerToParentsMap.set(child.id, new Set());
          }
          playerToParentsMap.get(child.id)!.add(member.id);
        });
      }
    });

    const freeParents = new Set<string>();
    playerToParentsMap.forEach((parentIds) => {
      const parentArray = Array.from(parentIds);
      parentArray.slice(0, 2).forEach(parentId => {
        freeParents.add(parentId);
      });
    });

    let count = 0;
    active.forEach((member: any) => {
      if (member.role === "PLAYER" || member.role === "MANAGER") {
        count++;
      } else if (member.role === "PARENT") {
        if (!freeParents.has(member.id)) {
          count++;
        }
      }
    });
    return count;
  };

  const activeCount = getActiveMemberCount();

  return (
    <>
      <main className="container animate-fade-in" style={{ padding: "40px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px", marginBottom: "24px" }}>
        <div>
          <Link href="/dashboard" style={{ color: "var(--primary)", fontWeight: 600, fontSize: "14px" }}>
            ← ダッシュボードへ戻る
          </Link>
          <h1 style={{ fontSize: "24px", fontWeight: 800, marginTop: "12px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <span style={{ whiteSpace: "nowrap" }}>👥 選手名簿 ＆ グループ管理</span>
            <span style={{
              fontSize: "13px",
              background: "rgba(255, 71, 87, 0.1)",
              color: "var(--primary)",
              padding: "4px 12px",
              borderRadius: "20px",
              fontWeight: 700,
              whiteSpace: "nowrap"
            }}>
              利用枠: {activeCount} / {teamRes?.team?.maxUsers || 30}名
            </span>
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
            ※選手1名あたり保護者2名まで無料（利用枠のカウント対象外）となります。
          </p>
        </div>
        {canManageUsers && activeTab === "roster" && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              className="btn"
              onClick={() => { setCopiedManagerLink(false); setShowManagerInviteModal(true); }}
              style={{ padding: "10px 16px", fontSize: "14px", whiteSpace: "nowrap", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", fontWeight: 700 }}
            >
              👔 指導者を招待
            </button>
            <button
              className="btn"
              onClick={() => setShowBulkModal(true)}
              style={{ padding: "10px 16px", fontSize: "14px", whiteSpace: "nowrap", background: "#eef2ff", color: "#4f46e5", border: "1px solid #c7d2fe", fontWeight: 700 }}
            >
              👥 まとめて登録
            </button>
            <button
              className="btn"
              onClick={openPromote}
              style={{ padding: "10px 16px", fontSize: "14px", whiteSpace: "nowrap", background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", fontWeight: 700 }}
            >
              🎓 進級処理
            </button>
            <button
              className="btn btn-primary"
              onClick={() => { setCreateResult(null); setCreateMemberError(""); setShowCreateMemberModal(true); }}
              style={{ padding: "10px 16px", fontSize: "14px", whiteSpace: "nowrap" }}
            >
              ＋ 新規メンバー追加
            </button>
          </div>
        )}
      </div>

      <BulkRegisterModal
        open={showBulkModal}
        category={teamCategory}
        existingPlayers={members.filter((m: any) => m.role === "PLAYER" && !m.graduated).map((m: any) => ({ id: m.id, name: m.name }))}
        onClose={() => setShowBulkModal(false)}
        onCompleted={() => { mutateTeam(); }}
      />

      {showPromoteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}>
          <div className="card" style={{ width: "100%", maxWidth: "440px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px" }}>🎓 進級処理</h2>
            {promoteLoading && !promotePreview ? (
              <p style={{ color: "var(--text-muted)" }}>確認中...</p>
            ) : promotePreview ? (
              <>
                <p style={{ fontSize: "14px", lineHeight: 1.7, marginBottom: "12px" }}>
                  全選手の学年を<strong>1つ上げます</strong>。最上学年の選手は<strong>卒団済み</strong>になります（データは残り、名簿・利用枠から外れます。保護者も兄弟が残っていなければ一緒に卒団扱い）。<strong>現在の配信グループも全てアーカイブされます</strong>（データは残り、過去のやりとりは引き続き見られます。新年度のグループは処理後に作り直してください）。
                </p>
                <div style={{ background: "rgba(0,0,0,0.03)", borderRadius: "8px", padding: "12px", fontSize: "14px", marginBottom: "16px" }}>
                  <div>📈 進級する選手: <strong>{promotePreview.advancingCount}名</strong></div>
                  <div style={{ marginTop: "6px" }}>🎓 卒団になる選手: <strong>{promotePreview.graduating.length}名</strong></div>
                  {promotePreview.graduating.length > 0 && (
                    <div style={{ marginTop: "6px", color: "var(--text-muted)", fontSize: "13px" }}>
                      {promotePreview.graduating.map((g) => g.name).join("、 ")}
                    </div>
                  )}
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
                  ※新年度の切り替え時に1回だけ実行してください。学年が未設定・体験生の選手は変わりません。
                </p>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowPromoteModal(false)} disabled={promoteLoading}>キャンセル</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={runPromote} disabled={promoteLoading}>
                    {promoteLoading ? "処理中..." : "実行する"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ color: "var(--danger)" }}>確認情報を取得できませんでした。</p>
                <button className="btn btn-secondary" style={{ marginTop: "12px" }} onClick={() => setShowPromoteModal(false)}>閉じる</button>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{
          background: "rgba(255, 71, 87, 0.1)",
          border: "1px solid var(--danger)",
          color: "var(--danger)",
          padding: "16px",
          borderRadius: "var(--radius-md)",
          marginBottom: "24px",
          fontWeight: 600
        }}>
          {error}
        </div>
      )}

      {/* タブ切り替えUI (指導者のみ表示) */}
      {isManager && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px", flexWrap: "wrap" }}>
          <button
            className={`btn ${activeTab === "roster" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setActiveTab("roster")}
            style={{ padding: "9px 16px", fontSize: "13px", whiteSpace: "nowrap" }}
          >
            👥 選手名簿一覧
          </button>
          <button
            className={`btn ${activeTab === "groups" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => {
              setActiveTab("groups");
            }}
            style={{ padding: "9px 16px", fontSize: "13px", whiteSpace: "nowrap" }}
          >
            📢 配信グループ管理
          </button>
        </div>
      )}

      {activeTab === "roster" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
          {/* 指導者セクション */}
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
              🛡️ 指導者 ({members.filter((m: any) => m.role === "MANAGER" && !m.graduated).length}名)
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
              {members.filter((m: any) => m.role === "MANAGER" && !m.graduated).map((member: any) => {
                const canEdit = isManager || session?.user?.id === member.id;
                return (
                  <div key={member.id} className="card-glass" style={{ padding: "16px", borderRadius: "12px", position: "relative", border: "1px solid var(--border)" }}>
                    {isDeleteMode && (
                      <div style={{ position: "absolute", top: "16px", left: "16px", zIndex: 10 }}>
                        {(session?.user?.id !== member.id && (isManager || (session?.user as any)?.canManageUsers)) ? (
                          <input 
                            type="checkbox" 
                            checked={membersToDelete.includes(member.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setMembersToDelete(prev => [...prev, member.id]);
                              } else {
                                setMembersToDelete(prev => prev.filter(id => id !== member.id));
                              }
                            }}
                            style={{ width: "18px", height: "18px", cursor: "pointer" }}
                          />
                        ) : null}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingLeft: isDeleteMode ? "28px" : "0" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-main)" }}>{member.name}</div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                          {member.position ? `指導者 (${member.position})` : (member.isOwner ? "オーナー" : "指導者")}
                        </div>
                        
                        {/* 権限バッジ */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "8px" }}>
                          {member.isOwner && <span style={{ background: "rgba(255,140,0,0.1)", color: "#ff8c00", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>オーナー</span>}
                          {member.canManageSchedule && <span style={{ background: "rgba(0,123,255,0.1)", color: "#007bff", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>📅 予定</span>}
                          {member.canManageUsers && <span style={{ background: "rgba(40,167,69,0.1)", color: "#28a745", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>👥 メンバー</span>}
                          {member.canManagePosts && <span style={{ background: "rgba(111,66,193,0.1)", color: "#6f42c1", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>📝 投稿</span>}
                          {member.canManageScore && <span style={{ background: "rgba(232,168,12,0.12)", color: "#b8860b", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>📊 スコア</span>}
                        </div>
                      </div>
                      {canEdit && (
                        <button className="btn btn-secondary" onClick={() => handleEditClick(member)} style={{ padding: "4px 8px", fontSize: "12px" }}>
                          編集
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 選手＆保護者セクション */}
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
              ⚾ 選手 ({members.filter((m: any) => m.role === "PLAYER" && !m.graduated).length}名)
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" }}>
              {members.filter((m: any) => m.role === "PLAYER" && !m.graduated).map((member: any) => {
                const canEdit = isManager || session?.user?.id === member.id;
                
                // この選手を子に持つ家族（保護者・指導者）。有効化済み（初ログイン済み）と招待中に分ける。
                const linkedFamily = members.filter((p: any) =>
                  (p.role === "PARENT" || p.role === "MANAGER") && p.children?.some((c: any) => c.id === member.id)
                );
                // 有効化済み＝初ログインでパスワード変更済み（requiresPasswordChange===false）
                const activatedFamily = linkedFamily.filter((p: any) => p.requiresPasswordChange === false);
                // 招待中＝自動生成された仮の保護者アカでまだ初ログインしていないもの
                const pendingFamily = linkedFamily.filter((p: any) => p.role === "PARENT" && p.requiresPasswordChange !== false);

                return (
                  <div key={member.id} className="card-glass" style={{ padding: "20px", borderRadius: "14px", position: "relative", border: "1px solid var(--border)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    {isDeleteMode && (
                      <div style={{ position: "absolute", top: "20px", left: "20px", zIndex: 10 }}>
                        {(session?.user?.id !== member.id && (isManager || (session?.user as any)?.canManageUsers)) ? (
                          <input 
                            type="checkbox" 
                            checked={membersToDelete.includes(member.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setMembersToDelete(prev => [...prev, member.id]);
                              } else {
                                setMembersToDelete(prev => prev.filter(id => id !== member.id));
                              }
                            }}
                            style={{ width: "18px", height: "18px", cursor: "pointer" }}
                          />
                        ) : null}
                      </div>
                    )}
                    <div style={{ paddingLeft: isDeleteMode ? "28px" : "0" }}>
                      {/* 上部: 背番号 ＆ 名前 */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {member.jerseyNumber ? (
                            <span style={{ 
                              background: "var(--primary)", 
                              color: "#fff", 
                              width: "36px", 
                              height: "36px", 
                              borderRadius: "50%", 
                              display: "inline-flex", 
                              alignItems: "center", 
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: "15px"
                            }}>
                              {member.jerseyNumber}
                            </span>
                          ) : (
                            <span style={{ background: "var(--border)", color: "var(--text-muted)", width: "36px", height: "36px", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700 }}>--</span>
                          )}
                          <div>
                            <div style={{ fontWeight: 800, fontSize: "17px", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
                              {member.name}
                              {member.grade !== null && member.grade !== undefined && (
                                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--primary)", background: "rgba(79,70,229,0.1)", padding: "2px 8px", borderRadius: "10px" }}>
                                  {gradeLabel(teamCategory, member.grade)}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                              {member.position || "未設定"} | {member.throwingHand || "右投"}/{member.battingHand || "右打"}
                            </div>
                          </div>
                        </div>
                        {canEdit && (
                          <button className="btn btn-secondary" onClick={() => handleEditClick(member)} style={{ padding: "4px 8px", fontSize: "12px" }}>
                            編集
                          </button>
                        )}
                      </div>

                      {/* グループ表示 */}
                      {member.groups && member.groups.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "12px" }}>
                          {member.groups.map((g: any) => (
                            <span key={g.id} style={{ background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.08)", color: "var(--text-main)", padding: "1px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 600 }}>
                              {g.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* ぶら下がっている家族リスト（有効化済みのみ本リストに表示） */}
                      <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                          👨‍👩‍👧‍👦 家族（{activatedFamily.length}名）
                        </div>
                        {activatedFamily.length >= 3 && (
                          <div style={{ background: "rgba(255,71,87,0.1)", border: "1px solid var(--danger)", color: "var(--danger)", padding: "6px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, marginBottom: "8px", lineHeight: 1.5 }}>
                            ⚠️ 保護者が3人以上います。無料枠は選手1名につき2名までです。編集からどなたか1名を外してください。
                          </div>
                        )}
                        {activatedFamily.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {activatedFamily.map((parent: any) => (
                              <span key={parent.id} style={{
                                background: "var(--surface)",
                                border: "1px solid var(--border)",
                                padding: "3px 8px",
                                borderRadius: "20px",
                                fontSize: "12px",
                                fontWeight: 600,
                                color: "var(--text-main)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px"
                              }}>
                                {parent.role === "MANAGER" ? "📋" : "👤"} {parent.name}
                                {parent.role === "PARENT" && relationBadge(parent.parentRelation) && (
                                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>（{relationBadge(parent.parentRelation)}）</span>
                                )}
                                {isManager && (
                                  <button
                                    onClick={() => handleEditClick(parent)}
                                    style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontSize: "11px", padding: 0 }}
                                    title="紐付けを編集"
                                  >
                                    ✏️
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                            まだ有効化された家族がいません
                          </span>
                        )}
                        {/* 招待中（初ログイン待ちの仮アカウント）は控えめに別表示 */}
                        {pendingFamily.length > 0 && (
                          <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-muted)" }}>
                            ⏳ 招待中（初ログイン待ち）: {pendingFamily.length}名
                            {isManager && (
                              <span style={{ marginLeft: "6px" }}>
                                {pendingFamily.map((p: any) => (
                                  <button
                                    key={p.id}
                                    onClick={() => handleEditClick(p)}
                                    style={{ background: "rgba(0,0,0,0.04)", border: "1px solid var(--border)", borderRadius: "12px", padding: "1px 8px", marginRight: "4px", fontSize: "11px", cursor: "pointer", color: "var(--text-muted)" }}
                                    title="仮パスワードの再発行などができます"
                                  >
                                    {p.name}
                                  </button>
                                ))}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* その他・未紐付けセクション */}
          {members.filter((m: any) => m.role === "PARENT" && (!m.children || m.children.length === 0)).length > 0 && (
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
                ❓ 未紐付けの保護者 ({members.filter((m: any) => m.role === "PARENT" && (!m.children || m.children.length === 0)).length}名)
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
                {members.filter((m: any) => m.role === "PARENT" && (!m.children || m.children.length === 0)).map((member: any) => {
                  const canEdit = isManager || session?.user?.id === member.id;
                  return (
                    <div key={member.id} className="card-glass" style={{ padding: "16px", borderRadius: "12px", position: "relative", border: "1px solid var(--border)", background: "rgba(255,193,7,0.03)" }}>
                      {isDeleteMode && (
                        <div style={{ position: "absolute", top: "16px", left: "16px", zIndex: 10 }}>
                          {(session?.user?.id !== member.id && (isManager || (session?.user as any)?.canManageUsers)) ? (
                            <input 
                              type="checkbox" 
                              checked={membersToDelete.includes(member.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setMembersToDelete(prev => [...prev, member.id]);
                                } else {
                                  setMembersToDelete(prev => prev.filter(id => id !== member.id));
                                }
                              }}
                              style={{ width: "18px", height: "18px", cursor: "pointer" }}
                            />
                          ) : null}
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingLeft: isDeleteMode ? "28px" : "0" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "6px" }}>
                            {member.name}
                            {relationBadge(member.parentRelation) && (
                              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>（{relationBadge(member.parentRelation)}）</span>
                            )}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--danger)", marginTop: "4px", fontWeight: 600 }}>
                            ⚠️ 選手との紐付けなし (利用枠カウント対象)
                          </div>
                        </div>
                        {canEdit && (
                          <button className="btn btn-secondary" onClick={() => handleEditClick(member)} style={{ padding: "4px 8px", fontSize: "12px" }}>
                            編集
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* まとめて削除ボタン領域 */}
          {(isManager || (session?.user as any)?.canManageUsers) && (
            <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface)" }}>
              {isDeleteMode ? (
                <>
                  <span style={{ fontWeight: 700, color: "var(--danger)" }}>
                    {membersToDelete.length} 名を選択中
                  </span>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => { setIsDeleteMode(false); setMembersToDelete([]); }}
                    >
                      キャンセル
                    </button>
                    <button 
                      className="btn btn-danger" 
                      onClick={handleBulkDelete}
                      disabled={membersToDelete.length === 0}
                    >
                      🗑 選択したメンバーを削除
                    </button>
                  </div>
                </>
              ) : (
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setIsDeleteMode(true)}
                  style={{ color: "var(--danger)", border: "1px solid var(--danger)", background: "transparent" }}
                >
                  🗑 メンバーを削除
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* グループ管理タブのコンテンツ */
        <div className="groups-grid">
          <style dangerouslySetInnerHTML={{__html: `
            .groups-grid {
              display: block;
              max-width: 640px;
              margin: 0 auto;
            }
          `}} />
          {/* グループ一覧（上）と作成（下）。編集は選択でモーダルが開く */}
          <div className="card-glass" style={{ padding: "24px", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column" }}>
            <div style={{ order: 2 }}>
            <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>新規グループ作成</h3>
            <form onSubmit={handleCreateGroup} style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "0" }}>
              <input
                type="text"
                className="form-control"
                placeholder="グループ名（例: レギュラー、父母会、4・5年）"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                disabled={createLoading}
                style={{ width: "100%", padding: "10px 12px", fontSize: "14px" }}
              />

              {/* 学年でまとめて追加 */}
              <div style={{ background: "rgba(79,70,229,0.04)", border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "6px" }}>
                  🎓 学年でまとめて追加（任意）：選んだ学年の選手が入ります
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {gradeOptions(teamCategory).map((o) => {
                    const on = newGroupGrades.includes(o.value);
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setNewGroupGrades((prev) => on ? prev.filter((g) => g !== o.value) : [...prev, o.value])}
                        style={{
                          padding: "5px 12px", fontSize: "13px", borderRadius: "16px", cursor: "pointer",
                          border: on ? "1px solid var(--primary)" : "1px solid var(--border)",
                          background: on ? "var(--primary)" : "transparent",
                          color: on ? "#fff" : "var(--text-muted)", fontWeight: 700,
                        }}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                {newGroupGrades.length > 0 && (
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
                    ※進級時にも対象学年の選手が自動で追加されます（手動で外したメンバーは戻りません）。
                  </div>
                )}
              </div>

              {/* 個別に追加（カテゴリ別に自由選択） */}
              <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "6px" }}>
                  👤 個別に追加（任意）：学年とあわせて自由に選べます（例: 4・5年生＋数名）
                </div>
                <div style={{ maxHeight: "260px", overflowY: "auto", paddingRight: "4px" }}>
                  {(() => {
                    const active = members.filter((m: any) => !m.graduated);
                    const invited = active.filter((m: any) => m.requiresPasswordChange === true);
                    const byRole = (role: string) => active.filter((m: any) => m.role === role && m.requiresPasswordChange !== true);
                    const pickRow = (m: any) => {
                      const checked = newGroupUserIds.includes(m.id);
                      return (
                        <label key={m.id} className="member-checkbox-row" style={{ display: "flex", alignItems: "center", padding: "7px 8px", borderRadius: "var(--radius-sm)", cursor: "pointer", background: checked ? "rgba(79,70,229,0.06)" : "transparent" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) setNewGroupUserIds([...newGroupUserIds, m.id]);
                              else setNewGroupUserIds(newGroupUserIds.filter((id) => id !== m.id));
                            }}
                            style={{ width: "16px", height: "16px", marginRight: "10px", accentColor: "var(--primary)", cursor: "pointer", flexShrink: 0 }}
                          />
                          <span style={{ fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            {m.name}
                            {m.role === "PLAYER" && m.grade !== null && m.grade !== undefined && (
                              <span style={{ fontSize: "10px", color: "var(--primary)", background: "rgba(79,70,229,0.1)", padding: "1px 6px", borderRadius: "8px", fontWeight: 700 }}>{gradeLabel(teamCategory, m.grade)}</span>
                            )}
                            {m.role === "PARENT" && relationBadge(m.parentRelation) && (
                              <span style={{ fontSize: "10px", color: "var(--text-muted)", background: "rgba(0,0,0,0.04)", padding: "1px 6px", borderRadius: "8px", fontWeight: 700 }}>{relationBadge(m.parentRelation)}</span>
                            )}
                          </span>
                        </label>
                      );
                    };
                    const cat = (title: string, list: any[], quickSelect?: { label: string; ids: string[] }[]) => list.length === 0 ? null : (
                      <div key={title} style={{ marginBottom: "4px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 800, color: "var(--text-muted)", padding: "8px 4px 2px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span>{title}（{list.length}）</span>
                          {quickSelect?.filter((q) => q.ids.length > 0).map((q) => (
                            <button
                              key={q.label}
                              type="button"
                              onClick={() => setNewGroupUserIds((prev) => Array.from(new Set([...prev, ...q.ids])))}
                              style={{ fontSize: "10px", fontWeight: 700, color: "var(--primary)", background: "rgba(79,70,229,0.08)", border: "none", borderRadius: "10px", padding: "2px 8px", cursor: "pointer" }}
                            >
                              {q.label}を全選択
                            </button>
                          ))}
                        </div>
                        {list.map(pickRow)}
                      </div>
                    );
                    const parentList = byRole("PARENT");
                    return (
                      <>
                        {cat("🛡️ 指導者", byRole("MANAGER"))}
                        {cat("⚾ 選手", byRole("PLAYER"))}
                        {cat("👪 父母", parentList, [
                          { label: "父", ids: parentList.filter((m: any) => m.parentRelation === "FATHER").map((m: any) => m.id) },
                          { label: "母", ids: parentList.filter((m: any) => m.parentRelation === "MOTHER").map((m: any) => m.id) },
                        ])}
                        {invited.length > 0 && cat("⏳ 招待中（初ログイン待ち）", invited)}
                      </>
                    );
                  })()}
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: "100%", padding: "10px 16px", fontSize: "14px" }} disabled={createLoading}>
                {createLoading ? "作成中..." : "このグループを作成"}
              </button>
            </form>
            </div>

            <div style={{ order: 1, marginBottom: "24px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "12px" }}>グループ一覧</h3>
            {(() => {
              const activeGroups = groups.filter((g: any) => !g.isArchived);
              const archivedGroups = groups.filter((g: any) => g.isArchived);
              const groupRow = (g: Group, archived: boolean) => {
                const selected = selectedGroup?.id === g.id;
                return (
                  <div key={g.id} style={{ display: "flex", alignItems: "stretch", gap: "6px" }}>
                    <button
                      onClick={() => {
                        setSelectedGroup(g);
                        setSelectedUserIds(g.members.map((m) => m.id));
                        setGroupMembersError("");
                      }}
                      style={{
                        flex: 1, textAlign: "left", padding: "14px 16px",
                        background: selected ? "rgba(79,70,229,0.1)" : archived ? "rgba(0, 0, 0, 0.015)" : "rgba(0, 0, 0, 0.02)",
                        border: selected ? "1px solid var(--primary)" : "1px solid var(--border)",
                        borderRadius: "var(--radius-md)", color: archived ? "var(--text-muted)" : "var(--text-main)", cursor: "pointer",
                        display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px"
                      }}
                    >
                      <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        {g.name}
                        {(g as any).gradeFilter && <span style={{ fontSize: "10px", color: "var(--primary)", background: "rgba(79,70,229,0.1)", padding: "1px 6px", borderRadius: "8px", fontWeight: 700 }}>学年自動</span>}
                      </span>
                      <span className="badge badge-secondary" style={{ background: "rgba(0, 0, 0, 0.08)", color: "var(--text-main)", whiteSpace: "nowrap" }}>
                        {g.members.length} 人
                      </span>
                    </button>
                    {archived ? (
                      <button onClick={() => handleToggleArchiveGroup(g, false)} title="アーカイブを解除" style={{ padding: "0 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--primary)", cursor: "pointer", fontSize: "16px" }}>↩️</button>
                    ) : (
                      <button onClick={() => handleToggleArchiveGroup(g, true)} title="アーカイブする（投稿・予定の宛先選択から外す。データは残ります）" style={{ padding: "0 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px" }}>📦</button>
                    )}
                    <button onClick={() => handleDeleteGroup(g)} title="グループを完全に削除" style={{ padding: "0 12px", background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", color: "var(--danger)", cursor: "pointer", fontSize: "16px" }}>🗑️</button>
                  </div>
                );
              };
              if (groups.length === 0) {
                return <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>まだグループがありません。下の「新規グループ作成」から作成できます。</p>;
              }
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {activeGroups.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>現在アクティブなグループはありません。</p>
                  ) : activeGroups.map((g) => groupRow(g, false))}

                  {archivedGroups.length > 0 && (
                    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                      <button
                        type="button"
                        onClick={() => setShowArchivedGroups((v) => !v)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", padding: 0, marginBottom: showArchivedGroups ? "8px" : 0 }}
                      >
                        {showArchivedGroups ? "▼" : "▶"} 📦 過去のグループ（アーカイブ済み・{archivedGroups.length}件）
                      </button>
                      {showArchivedGroups && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {archivedGroups.map((g) => groupRow(g, true))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            </div>
          </div>

        </div>
      )}

      {/* グループ編集モーダル（一覧でグループを選ぶと開く） */}
      {activeTab === "groups" && selectedGroup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1100, padding: "40px 16px", overflowY: "auto" }} onClick={() => setSelectedGroup(null)}>
          <div className="card" style={{ width: "100%", maxWidth: "560px", padding: "22px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "14px", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: "20px", fontWeight: 800 }}>📢 {selectedGroup.name}</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "4px" }}>
                  所属させるメンバーにチェックを入れて「変更を保存」を押してください。
                </p>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedGroup.scheduleFullAccess ?? false}
                    onChange={async (e) => {
                      const newVal = e.target.checked;
                      setSelectedGroup(prev => prev ? { ...prev, scheduleFullAccess: newVal } : prev);
                      try {
                        await fetch("/api/group", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "updateSettings", groupId: selectedGroup.id, scheduleFullAccess: newVal }),
                        });
                        await mutateGroups();
                      } catch (err) { console.error(err); }
                    }}
                    style={{ accentColor: "var(--accent)", width: "16px", height: "16px" }}
                  />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: selectedGroup.scheduleFullAccess ? "var(--accent)" : "var(--text-muted)" }}>
                    📅 このグループのメンバーは常に全ての予定を参照できる
                  </span>
                </label>
              </div>
              <button onClick={() => setSelectedGroup(null)} style={{ background: "transparent", border: "none", fontSize: "20px", color: "var(--text-muted)", cursor: "pointer" }}>✕</button>
            </div>

            {groupMembersError && (
              <div style={{ background: "rgba(255, 71, 87, 0.1)", border: "1px solid var(--danger)", color: "var(--danger)", padding: "12px", borderRadius: "var(--radius-md)", marginBottom: "16px", fontSize: "14px" }}>
                {groupMembersError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "2px", maxHeight: "50vh", overflowY: "auto", paddingRight: "8px" }}>
              {(() => {
                const roleBadge = (role: string) =>
                  role === "MANAGER" ? { label: "指導者", cls: "badge-primary" }
                  : role === "PARENT" ? { label: "保護者", cls: "badge-secondary" }
                  : { label: "選手", cls: "badge-accent" };
                const row = (member: any) => {
                  const isChecked = selectedUserIds.includes(member.id);
                  const rb = roleBadge(member.role);
                  return (
                    <label key={member.id} className="member-checkbox-row" style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderRadius: "var(--radius-sm)", cursor: "pointer", background: isChecked ? "rgba(79,70,229,0.06)" : "transparent", borderBottom: "1px solid rgba(0,0,0,0.03)" }}>
                      <input type="checkbox" checked={isChecked} onChange={(e) => { if (e.target.checked) setSelectedUserIds([...selectedUserIds, member.id]); else setSelectedUserIds(selectedUserIds.filter((id) => id !== member.id)); }} style={{ width: "18px", height: "18px", marginRight: "14px", accentColor: "var(--primary)", cursor: "pointer", flexShrink: 0 }} />
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, flexWrap: "wrap" }}>
                        {member.jerseyNumber && <span style={{ background: "var(--secondary)", color: "var(--text-main)", fontSize: "11px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px" }}>No.{member.jerseyNumber}</span>}
                        <span style={{ fontWeight: 600 }}>{member.name}</span>
                        {member.role === "PLAYER" && member.grade !== null && member.grade !== undefined && <span style={{ fontSize: "11px", color: "var(--primary)", background: "rgba(79,70,229,0.1)", padding: "1px 6px", borderRadius: "8px", fontWeight: 700 }}>{gradeLabel(teamCategory, member.grade)}</span>}
                        {member.role === "PARENT" && relationBadge(member.parentRelation) && <span style={{ fontSize: "11px", color: "var(--text-muted)", background: "rgba(0,0,0,0.04)", padding: "1px 6px", borderRadius: "8px", fontWeight: 700 }}>{relationBadge(member.parentRelation)}</span>}
                        <span className={`badge ${rb.cls}`} style={{ fontSize: "10px", padding: "2px 6px" }}>{rb.label}</span>
                      </div>
                    </label>
                  );
                };
                const section = (title: string, list: any[], quickSelect?: { label: string; ids: string[] }[]) => list.length === 0 ? null : (
                  <div key={title} style={{ marginBottom: "6px" }}>
                    <div style={{ fontSize: "12px", fontWeight: 800, color: "var(--text-muted)", padding: "10px 4px 4px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span>{title}（{list.length}）</span>
                      {quickSelect?.filter((q) => q.ids.length > 0).map((q) => (
                        <button
                          key={q.label}
                          type="button"
                          onClick={() => setSelectedUserIds((prev) => Array.from(new Set([...prev, ...q.ids])))}
                          style={{ fontSize: "10px", fontWeight: 700, color: "var(--primary)", background: "rgba(79,70,229,0.08)", border: "none", borderRadius: "10px", padding: "2px 8px", cursor: "pointer" }}
                        >
                          {q.label}を全選択
                        </button>
                      ))}
                    </div>
                    {list.map(row)}
                  </div>
                );
                const active = members.filter((m: any) => !m.graduated);
                const invited = active.filter((m: any) => m.requiresPasswordChange === true);
                const act = (role: string) => active.filter((m: any) => m.role === role && m.requiresPasswordChange !== true);
                const parentAct = act("PARENT");
                return (
                  <>
                    {section("🛡️ 指導者", act("MANAGER"))}
                    {section("⚾ 選手", act("PLAYER"))}
                    {section("👪 保護者", parentAct, [
                      { label: "父", ids: parentAct.filter((m: any) => m.parentRelation === "FATHER").map((m: any) => m.id) },
                      { label: "母", ids: parentAct.filter((m: any) => m.parentRelation === "MOTHER").map((m: any) => m.id) },
                    ])}
                    {invited.length > 0 && section("⏳ 招待中（初ログイン待ち）", invited)}
                  </>
                );
              })()}
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
              <button onClick={() => setSelectedGroup(null)} className="btn btn-secondary" style={{ flex: 1, padding: "11px", fontSize: "14px" }}>閉じる</button>
              <button onClick={handleSaveGroupMembers} className="btn btn-primary" style={{ flex: 2, padding: "11px", fontSize: "14px" }} disabled={groupMembersLoading}>
                {groupMembersLoading ? "保存中..." : "変更を保存"}
              </button>
            </div>
            <style dangerouslySetInnerHTML={{__html: `.member-checkbox-row:hover { background: rgba(0, 0, 0, 0.03) !important; }`}} />
          </div>
        </div>
      )}
      </main>

      {editingMember && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.8)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          zIndex: 1050,
          padding: "40px 20px",
          overflowY: "auto"
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "450px", animation: "fadeIn 0.3s ease" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "20px" }}>
              {editingMember.role === "PLAYER" ? "選手情報の編集" : (editRole === "MANAGER" ? "指導者情報の編集" : "保護者情報の編集")}: <span style={{ color: "var(--primary)" }}>{editingMember.name}</span>
            </h2>

            {saveError && (
              <div style={{
                background: "rgba(255, 71, 87, 0.1)",
                border: "1px solid var(--danger)",
                color: "var(--danger)",
                padding: "12px",
                borderRadius: "var(--radius-md)",
                marginBottom: "16px",
                fontSize: "14px",
                fontWeight: 600
              }}>
                {saveError}
              </div>
            )}

            <form onSubmit={handleSave}>
              {editingMember.email && (
                <div className="form-group">
                  <label className="form-label">ログインID (確認用・変更不可)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editingMember.email}
                    disabled
                    style={{ opacity: 0.6, cursor: "not-allowed" }}
                  />
                </div>
              )}

              {/* 氏名入力欄 */}
              <div className="form-group">
                <label className="form-label" htmlFor="edit-name">氏名</label>
                <input
                  id="edit-name"
                  type="text"
                  className="form-control"
                  placeholder="氏名を入力"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={saveLoading}
                  required
                />
              </div>

              {/* 保護者 ⇄ 指導者の種別変更（選手以外、かつオーナー以外） */}
              {editingMember.role !== "PLAYER" && !editingMember.isOwner && isManager && (
                <div className="form-group" style={{ background: "rgba(0, 0, 0, 0.02)", padding: "14px", borderRadius: "10px", border: "1px solid var(--border)", marginBottom: "16px" }}>
                  <label className="form-label" style={{ marginBottom: "8px", fontWeight: 700 }}>アカウント種別（ロール）</label>
                  <div style={{ display: "flex", gap: "16px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>
                      <input
                        type="radio"
                        name="editRole"
                        value="PARENT"
                        checked={editRole === "PARENT"}
                        onChange={() => setEditRole("PARENT")}
                        disabled={saveLoading}
                      />
                      保護者
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>
                      <input
                        type="radio"
                        name="editRole"
                        value="MANAGER"
                        checked={editRole === "MANAGER"}
                        onChange={() => setEditRole("MANAGER")}
                        disabled={saveLoading}
                      />
                      指導者（監督・コーチ・スタッフ）
                    </label>
                  </div>
                  {editRole === "MANAGER" && editingMember.role === "PARENT" && (
                    <p style={{ fontSize: "12px", color: "var(--primary)", marginTop: "8px", marginBottom: 0, lineHeight: 1.5 }}>
                      💡 指導者に切り替えても、お子さんとの家族の紐付け（名簿の表示や通知）はそのまま引き継がれます。
                    </p>
                  )}
                  {editRole === "PARENT" && editingMember.role === "MANAGER" && (
                    <p style={{ fontSize: "12px", color: "var(--danger)", marginTop: "8px", marginBottom: 0, lineHeight: 1.5 }}>
                      ⚠️ 保護者に切り替えると、管理者メニューや指導者権限は利用できなくなります。
                    </p>
                  )}
                </div>
              )}

              {/* 背番号（選手、または指導者） */}
              {(editingMember.role === "PLAYER" || editRole === "MANAGER") && (
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-jersey">背番号</label>
                  <input
                    id="edit-jersey"
                    type="text"
                    className="form-control"
                    placeholder={editRole === "MANAGER" ? "例: 30（任意）" : "例: 10"}
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(e.target.value)}
                    disabled={saveLoading}
                  />
                </div>
              )}

              {editRole === "MANAGER" && editingMember.role !== "PLAYER" && (
                <div className="form-group">
                  <label className="form-label" htmlFor="edit-manager-position">役職</label>
                  <select
                    id="edit-manager-position"
                    className="form-control"
                    value={position || "コーチ"}
                    onChange={(e) => setPosition(e.target.value)}
                    disabled={saveLoading}
                  >
                    <option value="監督">監督</option>
                    <option value="コーチ">コーチ</option>
                    <option value="代表">代表</option>
                    <option value="副代表">副代表</option>
                    <option value="スタッフ">スタッフ</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
              )}

              {editingMember.role === "PLAYER" && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-grade">学年</label>
                    <select
                      id="edit-grade"
                      className="form-control"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      disabled={saveLoading}
                    >
                      <option value="">未設定</option>
                      {gradeOptions(teamCategory).map((o) => (
                        <option key={o.value} value={String(o.value)}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-position">ポジション</label>
                    <select
                      id="edit-position"
                      className="form-control"
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      disabled={saveLoading}
                    >
                      <option value="投手">投手 (P)</option>
                      <option value="捕手">捕手 (C)</option>
                      <option value="一塁手">一塁手 (1B)</option>
                      <option value="二塁手">二塁手 (2B)</option>
                      <option value="三塁手">三塁手 (3B)</option>
                      <option value="遊撃手">遊撃手 (SS)</option>
                      <option value="左翼手">左翼手 (LF)</option>
                      <option value="中堅手">中堅手 (CF)</option>
                      <option value="右翼手">右翼手 (RF)</option>
                      <option value="指名打者">指名打者 (DH)</option>
                      <option value="ベンチ">控選手 (Bench)</option>
                    </select>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    <div className="form-group">
                      <label className="form-label" htmlFor="edit-throwing">投球（利き腕）</label>
                      <select
                        id="edit-throwing"
                        className="form-control"
                        value={throwingHand}
                        onChange={(e) => setThrowingHand(e.target.value)}
                        disabled={saveLoading}
                      >
                        <option value="右投">右投</option>
                        <option value="左投">左投</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="edit-batting">打席</label>
                      <select
                        id="edit-batting"
                        className="form-control"
                        value={battingHand}
                        onChange={(e) => setBattingHand(e.target.value)}
                        disabled={saveLoading}
                      >
                        <option value="右打">右打</option>
                        <option value="左打">左打</option>
                        <option value="両打">両打</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: "16px" }}>
                    <label className="form-label" style={{ marginBottom: "12px" }}>家族（保護者）</label>
                    <div style={{
                      background: "rgba(0, 0, 0, 0.02)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "8px"
                    }}>
                      {(() => {
                        // この選手に紐付いている家族（自動生成の仮保護者＋紐付けた指導者など）
                        const fam = members.filter((m: any) =>
                          (m.role === "PARENT" || m.role === "MANAGER") && m.children?.some((c: any) => c.id === editingMember.id)
                        );
                        if (fam.length === 0) {
                          return <p style={{ color: "var(--text-muted)", fontSize: "13px", padding: "8px" }}>まだ家族が登録されていません。</p>;
                        }
                        return fam.map((f: any) => {
                          const activated = f.requiresPasswordChange === false;
                          return (
                            <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px", borderBottom: "1px solid rgba(0,0,0,0.03)" }}>
                              <span style={{ fontSize: "14px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                {f.name}
                                {f.role === "MANAGER" && (
                                  <span style={{ fontSize: "11px", color: "#4f46e5", background: "#eef2ff", padding: "1px 6px", borderRadius: "5px" }}>指導者</span>
                                )}
                                {activated ? (
                                  <span style={{ fontSize: "11px", color: "#16a34a", background: "#dcfce7", padding: "1px 6px", borderRadius: "5px", fontWeight: 700 }}>認証済</span>
                                ) : (
                                  <span style={{ fontSize: "11px", color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: "5px", fontWeight: 700 }}>招待中</span>
                                )}
                              </span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px", lineHeight: 1.6 }}>
                      選手を登録すると保護者2名分の枠（招待中）が自動で作られます。保護者が初回ログインすると「認証済」に変わり、本人が設定した名前が反映されます。
                    </p>

                    {!showLinkFamily ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ marginTop: "10px", padding: "8px 14px", fontSize: "13px" }}
                        onClick={() => { setShowLinkFamily(true); setLinkError(""); }}
                      >
                        👨‍👩‍👧 兄弟・既存の家族を紐付け
                      </button>
                    ) : (
                      <div style={{ marginTop: "12px", padding: "14px", background: "rgba(0,0,0,0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", display: "flex", flexDirection: "column", gap: "14px" }}>
                        <div>
                          <label className="form-label" style={{ fontSize: "13px" }}>① 兄弟（既存の選手）から保護者を引き継ぐ</label>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <select className="form-control" value={linkSiblingId} onChange={(e) => setLinkSiblingId(e.target.value)} disabled={linkLoading} style={{ flex: 1 }}>
                              <option value="">選手を選ぶ…</option>
                              {members.filter((m: any) => m.role === "PLAYER" && m.id !== editingMember.id).map((m: any) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            <button type="button" className="btn btn-primary" style={{ padding: "8px 14px", fontSize: "13px", whiteSpace: "nowrap" }} disabled={linkLoading || !linkSiblingId} onClick={() => handleLinkFamily({ siblingId: linkSiblingId })}>
                              引き継ぐ
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: "13px" }}>② 既存の保護者・指導者を直接紐付け</label>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <select className="form-control" value={linkPersonId} onChange={(e) => setLinkPersonId(e.target.value)} disabled={linkLoading} style={{ flex: 1 }}>
                              <option value="">人を選ぶ…</option>
                              {members
                                .filter((m: any) => {
                                  if (m.role !== "PARENT" && m.role !== "MANAGER") return false;
                                  if (m.children?.some((c: any) => c.id === editingMember.id)) return false; // 既にこの子に紐付き済み
                                  if (m.role === "PARENT" && m.children?.some((c: any) => c.id !== editingMember.id)) return false; // 他の子の親は除外
                                  return true;
                                })
                                .map((m: any) => (
                                  <option key={m.id} value={m.id}>{m.name}{m.role === "MANAGER" ? "（指導者）" : ""}</option>
                                ))}
                            </select>
                            <button type="button" className="btn btn-primary" style={{ padding: "8px 14px", fontSize: "13px", whiteSpace: "nowrap" }} disabled={linkLoading || !linkPersonId} onClick={() => handleLinkFamily({ personId: linkPersonId })}>
                              紐付け
                            </button>
                          </div>
                        </div>
                        {linkError && <p style={{ color: "var(--danger)", fontSize: "12px", margin: 0 }}>{linkError}</p>}
                        <button type="button" className="btn" style={{ padding: "6px 12px", fontSize: "12px", alignSelf: "flex-start", background: "transparent", color: "var(--text-muted)" }} onClick={() => { setShowLinkFamily(false); setLinkError(""); }} disabled={linkLoading}>
                          閉じる
                        </button>
                        <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                          ※新規アカウントは作りません。既存の実在アカウントを選ぶだけ。実在の保護者は選手1人につき2名までです。
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {editingMember.role !== "PLAYER" && editRole === "PARENT" && (
                <div className="form-group" style={{ marginTop: "16px" }}>
                  <label className="form-label" style={{ marginBottom: "12px" }}>続柄</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {[
                      { value: "FATHER", label: "父" },
                      { value: "MOTHER", label: "母" },
                      { value: "OTHER", label: "その他" },
                    ].map((o) => {
                      const selected = parentRelation === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          disabled={saveLoading}
                          onClick={() => setParentRelation(selected ? "" : o.value)}
                          style={{
                            padding: "6px 14px", borderRadius: "18px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
                            border: selected ? "1px solid var(--primary)" : "1px solid var(--border)",
                            background: selected ? "var(--primary)" : "transparent",
                            color: selected ? "#fff" : "var(--text-muted)",
                          }}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {editingMember.role !== "PLAYER" && (
                <div className="form-group" style={{ marginTop: "16px" }}>
                  <label className="form-label" style={{ marginBottom: "12px" }}>家族として紐付ける選手</label>
                  <div style={{ 
                    maxHeight: "200px", 
                    overflowY: "auto", 
                    background: "rgba(0, 0, 0, 0.02)", 
                    border: "1px solid var(--border)", 
                    borderRadius: "var(--radius-sm)",
                    padding: "8px"
                  }}>
                    {members.filter(m => m.role === "PLAYER").length === 0 && (
                      <p style={{ color: "var(--text-muted)", fontSize: "13px", padding: "8px" }}>選手が登録されていません</p>
                    )}
                    {members.filter(m => m.role === "PLAYER").map(player => (
                      <label key={player.id} style={{
                        display: "flex", alignItems: "center", padding: "8px",
                        cursor: "pointer", borderBottom: "1px solid rgba(0, 0, 0, 0.02)"
                      }}>
                        <input
                          type="checkbox"
                          checked={selectedChildrenIds.includes(player.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedChildrenIds([...selectedChildrenIds, player.id]);
                            } else {
                              setSelectedChildrenIds(selectedChildrenIds.filter(id => id !== player.id));
                            }
                          }}
                          style={{ marginRight: "12px", accentColor: "var(--primary)" }}
                        />
                        <span style={{ fontSize: "14px" }}>
                          {player.jerseyNumber && <span style={{ marginRight: "8px", color: "var(--text-muted)" }}>No.{player.jerseyNumber}</span>}
                          {player.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
                    ここで選手を紐付けると、親子・家族関係として設定されます。
                  </p>
                </div>
              )}

              {/* 権限管理 (指導者のみ表示) */}
              {editRole === "MANAGER" && ((session?.user as any)?.isOwner || (session?.user as any)?.canManageUsers || session?.user?.role === "MANAGER") && !editingMember.isOwner && (
                <div className="form-group" style={{ marginTop: "16px", padding: "16px", background: "rgba(0, 0, 0, 0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                  <label className="form-label" style={{ marginBottom: "12px", display: "block" }}>システム権限（サブ管理者）</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: "14px" }}>
                      <input
                        type="checkbox"
                        checked={editCanManagePosts}
                        onChange={(e) => setEditCanManagePosts(e.target.checked)}
                        disabled={saveLoading}
                        style={{ marginRight: "12px", accentColor: "var(--primary)" }}
                      />
                      <span>投稿管理者（全体宛ての投稿が可能になります）</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: "14px" }}>
                      <input
                        type="checkbox"
                        checked={editCanManageSchedule}
                        onChange={(e) => setEditCanManageSchedule(e.target.checked)}
                        disabled={saveLoading}
                        style={{ marginRight: "12px", accentColor: "var(--primary)" }}
                      />
                      <span>スケジュール管理者（予定の作成・編集が可能になります）</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: "14px" }}>
                      <input
                        type="checkbox"
                        checked={editCanManageUsers}
                        onChange={(e) => setEditCanManageUsers(e.target.checked)}
                        disabled={saveLoading}
                        style={{ marginRight: "12px", accentColor: "var(--primary)" }}
                      />
                      <span>ユーザー管理者（名簿・グループの編集が可能になります）</span>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", cursor: "pointer", fontSize: "14px" }}>
                      <input
                        type="checkbox"
                        checked={editCanManageScore}
                        onChange={(e) => setEditCanManageScore(e.target.checked)}
                        disabled={saveLoading}
                        style={{ marginRight: "12px", accentColor: "var(--primary)" }}
                      />
                      <span>スコアラー（試合のスコア入力・成績編集が可能になります）</span>
                    </label>
                  </div>
                </div>
              )}

              {/* 紐づく保護者のログイン情報 & 仮パスワード一括再発行 */}
              {editingMember.parents && editingMember.parents.length > 0 && (
                <div style={{ marginTop: "20px", padding: "14px", border: "1px solid #bfdbfe", borderRadius: "var(--radius-md)", background: "#eff6ff" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e40af", marginBottom: "4px" }}>
                    👪 紐づく保護者のログイン情報・仮パス再発行
                  </div>
                  <p style={{ fontSize: "12px", color: "#3b82f6", margin: "0 0 10px", lineHeight: 1.5 }}>
                    保護者がログインIDや仮パスワードを忘れた場合、ここから確認・再発行できます。名前の変更や指導者への切り替えも「編集」から行えます。
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {editingMember.parents.map((p) => (
                      <div key={p.id} style={{ background: "#ffffff", padding: "10px 12px", borderRadius: "8px", border: "1px solid #dbeafe" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--text)" }}>{p.name}</span>
                            {p.email && (
                              <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                                (ID: <strong>{p.email}</strong>)
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              type="button"
                              onClick={() => {
                                const parentMember = members.find((m: any) => m.id === p.id) || p;
                                handleEditClick(parentMember);
                              }}
                              className="btn btn-secondary"
                              style={{ fontSize: "12px", padding: "4px 8px" }}
                              title="名前や種別（保護者・指導者）を編集"
                            >
                              ✏️ 編集
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReissueParentPassword(p.id, p.name)}
                              className="btn btn-secondary"
                              style={{ fontSize: "12px", padding: "4px 10px", borderColor: "#93c5fd", color: "#1d4ed8", background: "#ffffff" }}
                              disabled={parentReissueLoading[p.id]}
                            >
                              {parentReissueLoading[p.id] ? "発行中..." : "🔑 仮パスを再発行"}
                            </button>
                          </div>
                        </div>
                        {parentReissueResults[p.id] && (
                          <div style={{ marginTop: "8px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", padding: "8px 10px", fontSize: "12px", color: "#92400e" }}>
                            【{p.name}】新しい仮パス: <code style={{ background: "#fff", padding: "2px 6px", borderRadius: "4px", fontFamily: "monospace", fontWeight: 700 }}>{parentReissueResults[p.id]}</code>
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard?.writeText(parentReissueResults[p.id]); }}
                              className="btn"
                              style={{ marginLeft: "8px", padding: "2px 8px", fontSize: "11px", background: "#fff", border: "1px solid #fde68a", color: "#92400e" }}
                            >
                              コピー
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 仮パスワードの再発行（本人が紙をなくした・忘れた時用） */}
              <div style={{ marginTop: "20px", padding: "14px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-hover)" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, marginBottom: "4px" }}>🔑 仮パスワードの再発行</div>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
                  ログイン情報を紛失した場合、新しい仮パスワードを発行できます（このメンバーの現在のパスワードは使えなくなり、次回ログイン時に本人が再設定します）。
                </p>
                {reissueError && (
                  <div style={{ fontSize: "12px", color: "var(--danger)", marginBottom: "8px" }}>{reissueError}</div>
                )}
                {reissuedPassword ? (
                  <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: "#92400e" }}>
                    新しい仮パスワード: <code style={{ background: "#fff", padding: "2px 8px", borderRadius: "5px", fontFamily: "monospace", fontWeight: 700 }}>{reissuedPassword}</code>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard?.writeText(reissuedPassword); }}
                      className="btn"
                      style={{ marginLeft: "8px", padding: "3px 10px", fontSize: "12px", background: "#fff", border: "1px solid #fde68a", color: "#92400e" }}
                    >
                      コピー
                    </button>
                    <div style={{ marginTop: "6px", fontSize: "11px" }}>※この画面を閉じると再表示できません。控えを取ってください。</div>
                  </div>
                ) : (
                  <button type="button" onClick={handleReissuePassword} className="btn btn-secondary" style={{ fontSize: "13px", padding: "8px 14px" }} disabled={reissueLoading}>
                    {reissueLoading ? "発行中..." : "仮パスワードを再発行する"}
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditingMember(null)} disabled={saveLoading}>
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saveLoading}>
                  {saveLoading ? "保存中..." : "保存する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新規メンバー追加モーダル */}
      {showCreateMemberModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.8)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          zIndex: 1050,
          padding: "40px 20px",
          overflowY: "auto"
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "450px", animation: "fadeIn 0.3s ease" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "20px" }}>
              {createResult ? "✅ 作成しました" : "新規メンバー作成"}
            </h2>

            {createResult ? (
              <div>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.6 }}>
                  <strong>{createResult.playerName}</strong> と、保護者2名分のアカウントを自動作成しました。<br />
                  下の<strong>保護者の仮パスワード</strong>はこの画面でしか確認できません。控えてから閉じてください（後から名簿の編集で再発行も可能です）。
                </p>
                <div style={{ background: "rgba(0,0,0,0.03)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", fontSize: "13px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {createResult.parents.map((p) => (
                    <div key={p.loginId} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div>ID: <code>{p.loginId}</code></div>
                      <div>仮パス: <code style={{ fontWeight: 700 }}>{p.tempPassword}</code></div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => {
                    const txt = createResult.parents.map((p) => `${p.name}\nID: ${p.loginId}\n仮パス: ${p.tempPassword}`).join("\n\n");
                    navigator.clipboard?.writeText(txt);
                  }}>📋 コピー</button>
                  <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => { setCreateResult(null); setShowCreateMemberModal(false); }}>閉じる</button>
                </div>
              </div>
            ) : (
              <>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px", lineHeight: "1.5" }}>
              メンバーのログインIDと仮パスワードを発行します。<br />
              作成後、このIDとパスワードをご本人に伝えてください。（選手は保護者2名分も自動で作成されます）
            </p>

            {createMemberError && (
              <div style={{
                background: "rgba(255, 71, 87, 0.1)",
                border: "1px solid var(--danger)",
                color: "var(--danger)",
                padding: "12px",
                borderRadius: "var(--radius-md)",
                marginBottom: "16px",
                fontSize: "14px",
                fontWeight: 600
              }}>
                {createMemberError}
              </div>
            )}

            <form onSubmit={handleCreateMember}>
              <div className="form-group">
                <label className="form-label" htmlFor="new-member-name">氏名</label>
                <input
                  id="new-member-name"
                  type="text"
                  className="form-control"
                  placeholder="例: 山田 太郎"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  required
                  disabled={createMemberLoading}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="new-member-login-id">ログインID</label>
                <div style={{ display: "flex", alignItems: "center" }}>
                  {teamRes?.team?.teamCode && (
                    <span 
                      style={{ 
                        padding: "0.75rem 1rem", 
                        background: "rgba(255, 255, 255, 0.05)", 
                        border: "1px solid var(--border)", 
                        borderRight: "none", 
                        borderRadius: "8px 0 0 8px", 
                        color: "var(--text-muted)",
                        fontSize: "0.95rem",
                        userSelect: "none"
                      }}
                    >
                      {teamRes.team.teamCode.toLowerCase()}_
                    </span>
                  )}
                  <input
                    id="new-member-login-id"
                    type="text"
                    className="form-control"
                    style={teamRes?.team?.teamCode ? { borderRadius: "0 8px 8px 0" } : {}}
                    placeholder="例: yamada-01"
                    value={newMemberLoginId}
                    onChange={(e) => setNewMemberLoginId(e.target.value)}
                    required
                    disabled={createMemberLoading}
                    pattern="[a-zA-Z0-9_-]+"
                    title="半角英数字、ハイフン(-)、アンダースコア(_)が使えます"
                  />
                </div>
                {teamRes?.team?.teamCode && newMemberLoginId && (
                  <p style={{ fontSize: "12px", color: "var(--primary)", marginTop: "6px", fontWeight: "bold" }}>
                    実際のログインID: {teamRes.team.teamCode.toLowerCase()}_{newMemberLoginId.trim().toLowerCase()}
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="new-member-password">仮パスワード</label>
                <input
                  id="new-member-password"
                  type="text"
                  className="form-control"
                  placeholder="例: skillbase1234"
                  value={newMemberPassword}
                  onChange={(e) => setNewMemberPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={createMemberLoading}
                />
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>※6文字以上で設定してください。</p>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="new-member-role">役割</label>
                <select
                  id="new-member-role"
                  className="form-control"
                  value={newMemberRole}
                  onChange={(e) => setNewMemberRole(e.target.value)}
                  disabled={createMemberLoading}
                >
                  <option value="PLAYER">選手</option>
                  <option value="PARENT">父母</option>
                  <option value="MANAGER">指導者・管理者</option>
                </select>
              </div>

              {newMemberRole === "MANAGER" && (
                <div className="form-group">
                  <label className="form-label" htmlFor="new-member-position">役職</label>
                  <select
                    id="new-member-position"
                    className="form-control"
                    value={newMemberPosition}
                    onChange={(e) => setNewMemberPosition(e.target.value)}
                    disabled={createMemberLoading}
                  >
                    <option value="監督">監督</option>
                    <option value="コーチ">コーチ</option>
                    <option value="代表">代表</option>
                    <option value="副代表">副代表</option>
                    <option value="スタッフ">スタッフ</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
              )}

              {newMemberRole === "PLAYER" && (
                <div className="form-group">
                  <label className="form-label" htmlFor="new-member-sibling">チーム内に兄弟がいる場合（任意）</label>
                  <select
                    id="new-member-sibling"
                    className="form-control"
                    value={newMemberSiblingId}
                    onChange={(e) => setNewMemberSiblingId(e.target.value)}
                    disabled={createMemberLoading}
                  >
                    <option value="">なし（保護者は別途登録／紐付け）</option>
                    {members
                      .filter((m: any) => m.role === "PLAYER")
                      .map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {m.name}{m.jerseyNumber ? `（#${m.jerseyNumber}）` : ""}
                        </option>
                      ))}
                  </select>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                    兄弟を選ぶと、保護者は新規作成せず<strong>その兄弟の保護者を引き継いで紐付け</strong>ます。
                  </p>
                </div>
              )}

              <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setCreateResult(null); setShowCreateMemberModal(false); }} disabled={createMemberLoading}>
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={createMemberLoading}>
                  {createMemberLoading ? "作成中..." : "作成する"}
                </button>
              </div>
            </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* 指導者招待モーダル */}
      {showManagerInviteModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.8)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1050,
          padding: "20px"
        }}>
          <div className="card" style={{ width: "100%", maxWidth: "480px", animation: "fadeIn 0.3s ease" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              👔 指導者・スタッフを招待
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px", lineHeight: "1.6" }}>
              監督・コーチ・マネージャー等に以下の招待リンクを送ってください。<br />
              リンクを開いた指導者自身が名前とパスワードを登録して、すぐにチームに参加できます。
            </p>

            {teamRes?.team?.inviteCode ? (
              <>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                    招待用リンク（指導者専用）
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      readOnly
                      value={typeof window !== "undefined" ? `${window.location.origin}/invite/manager?code=${teamRes.team.inviteCode}` : `https://skillbase.easystance.app/invite/manager?code=${teamRes.team.inviteCode}`}
                      className="form-control"
                      style={{ fontSize: "13px", background: "rgba(0,0,0,0.03)", fontFamily: "monospace" }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ whiteSpace: "nowrap", padding: "8px 16px" }}
                      onClick={() => {
                        const url = `${window.location.origin}/invite/manager?code=${teamRes.team.inviteCode}`;
                        navigator.clipboard?.writeText(url);
                        setCopiedManagerLink(true);
                        setTimeout(() => setCopiedManagerLink(false), 2500);
                      }}
                    >
                      {copiedManagerLink ? "✅ コピー済" : "📋 コピー"}
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                  <a
                    href={`https://line.me/R/msg/text/?${encodeURIComponent(`【SKILLBASE】指導者登録の招待\n${teamRes?.team?.name || "チーム"}の指導者として登録してください。\n以下のリンクから登録できます：\n${typeof window !== "undefined" ? window.location.origin : "https://skillbase.easystance.app"}/invite/manager?code=${teamRes.team.inviteCode}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn"
                    style={{
                      background: "#06C755",
                      color: "#fff",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      fontWeight: 700,
                      padding: "10px 16px",
                      textDecoration: "none"
                    }}
                  >
                    💬 LINEで招待リンクをシェア
                  </a>
                </div>

                <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "8px", padding: "12px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.6 }}>
                  💡 <strong>安心仕様</strong>: 招待された指導者は自動的に「指導者（MANAGER）」ロールとなり、スケジュール登録や出欠確認などの指導者機能を利用できます（オーナー権限は渡りません）。
                </div>
              </>
            ) : (
              <p style={{ color: "var(--danger)", fontSize: "13px" }}>招待コードが見つかりません。</p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowManagerInviteModal(false)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
