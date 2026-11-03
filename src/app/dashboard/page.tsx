"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import StoryCamera from "@/components/StoryCamera";
import HighlightCarousel from "@/components/HighlightCarousel";
import MediaViewer from "@/components/MediaViewer";
import { isNativeApp } from "@/lib/platform";
import { getCategoryMeta } from "@/lib/columns";

interface Member {
  id: string;
  name: string;
  role: string;
  jerseyNumber: string | null;
  position: string | null;
}

interface Group {
  id: string;
  name: string;
}

interface Author {
  id: string;
  name: string;
  role: string;
  jerseyNumber: string | null;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    role: string;
  };
}

interface Like {
  userId: string;
}

interface Post {
  id: string;
  content: string;
  imageUrl: string | null;
  thumbnailUrl?: string | null;
  isVideo?: boolean;
  fileUrl?: string | null;
  fileName?: string | null;
  expiresAt?: string | null;
  isInfo: boolean;
  createdAt: string;
  author: Author;
  targetGroups: Group[];
  comments: Comment[];
  likes: Like[];
  poll?: {
    id: string;
    question: string;
    options: string;
    resultsVisibleToAll: boolean;
    answers: { userId: string; selectedOption: string; user?: { name: string; jerseyNumber: string | null } }[];
  } | null;
}

function DashboardContent() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // チーム関連のState
  const [teamName, setTeamName] = useState("");
  const [teamDesc, setTeamDesc] = useState("");
  const [teamCoupon, setTeamCoupon] = useState("");
  const [teamCategory, setTeamCategory] = useState("JUNIOR_HIGH");
  const [inviteCode, setInviteCode] = useState(searchParams.get("inviteCode") || "");
  const [teamError, setTeamError] = useState("");
  const [teamLoading, setTeamLoading] = useState(false);

  // タイムライン・グループのState
  const [selectedFilterGroupId, setSelectedFilterGroupId] = useState<string | null>(null);
  const [showArchivedFilter, setShowArchivedFilter] = useState(false);
  const [timelineError, setTimelineError] = useState("");

  // 新規投稿State
  const [content, setContent] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [postFileAttachment, setPostFileAttachment] = useState<File | null>(null);
  const isFormExpanded = true;
  const [isInfo, setIsInfo] = useState(false);
  const [isStory, setIsStory] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollVisibleToAll, setPollVisibleToAll] = useState(false);
  const [postLoading, setPostLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [showCamera, setShowCamera] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileAttachmentInputRef = useRef<HTMLInputElement>(null);

  // タイムライン/アルバムのタブ切り替え
  const [dashTab, setDashTab] = useState<"timeline" | "album">(
    searchParams.get("tab") === "album" ? "album" : "timeline"
  );
  const [albumViewerIndex, setAlbumViewerIndex] = useState<number | null>(null);
  const [albumAuthorFilter, setAlbumAuthorFilter] = useState<string>("");
  const [albumGroupFilter, setAlbumGroupFilter] = useState<string>("");

  useEffect(() => {
    const tab = searchParams.get("tab");
    setDashTab(tab === "album" ? "album" : "timeline");
  }, [searchParams]);

  // アクション関連State
  const [commentInputs, setCommentInputs] = useState<{ [postId: string]: string }>({});
  const [showComments, setShowComments] = useState<{ [postId: string]: boolean }>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { data: teamRes } = useSWR(session?.user?.teamId ? "/api/team/info" : null, fetcher);
  const { data: postsRes, mutate: mutatePosts } = useSWR(session?.user?.teamId ? "/api/posts" : null, fetcher);
  const { data: groupsRes } = useSWR(session?.user?.teamId ? "/api/group" : null, fetcher);
  const { data: columnsRes } = useSWR(session?.user?.teamId ? "/api/columns" : null, fetcher);

  const uploadViaWorker = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/r2", { method: "POST", body: fd });
    if (!res.ok) {
      const errText = await res.text().catch(() => "No response body");
      throw new Error(`アップロードエラー (${res.status} ${res.statusText}): ${errText}`);
    }
    const data = await res.json();
    return data.publicUrl as string;
  };

  const uploadViaPresigned = async (file: File): Promise<string> => {
    const res = await fetch("/api/upload/r2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, contentType: file.type }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "No response body");
      throw new Error(`署名URL取得エラー (${res.status} ${res.statusText}): ${errText}`);
    }
    const r2Data = await res.json();
    const uploadRes = await fetch(r2Data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "No response body");
      throw new Error(`R2アップロードエラー (${uploadRes.status} ${uploadRes.statusText}): ${errText}`);
    }
    return r2Data.publicUrl;
  };

  const uploadToR2 = async (file: File): Promise<string> => {
    const WORKER_LIMIT = 90 * 1024 * 1024;
    const useWorker = file.size <= WORKER_LIMIT;
    let lastErr: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return useWorker ? await uploadViaWorker(file) : await uploadViaPresigned(file);
      } catch (err: any) {
        lastErr = err;
        console.error(`uploadToR2 attempt ${attempt + 1} failed:`, err);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    throw new Error(`[R2アップロード診断] ${lastErr?.name || "Error"}: ${lastErr?.message || String(lastErr)}`);
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.teamId) {
      fetch("/api/user/notifications", { method: "POST" }).catch(console.error);
    }
  }, [session?.user?.teamId]);

  const posts = postsRes?.posts || [];
  const groups = groupsRes?.groups || [];
  const postableGroups = groups.filter((g: any) => !g.isArchived);
  const loadingData = !teamRes && !postsRes && !!session?.user?.teamId;

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeamError("");
    setTeamLoading(true);

    try {
      const res = await fetch("/api/team/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: teamName,
          description: teamDesc,
          couponCode: teamCoupon,
          category: teamCategory,
          startFull: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "チームの作成に失敗しました。");
      }

      await update({
        user: {
          teamId: data.team.id,
          isOwner: true,
          role: "MANAGER",
        },
      });

      router.refresh();
    } catch (err: any) {
      setTeamError(err.message);
    } finally {
      setTeamLoading(false);
    }
  };

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validPollOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    const pollValid = showPoll && pollQuestion.trim() && validPollOptions.length >= 2;
    if (!content.trim() && imageFiles.length === 0 && !postFileAttachment && !pollValid) return;
    if (showPoll && !pollValid) {
      setTimelineError("アンケートは質問と選択肢2つ以上を入力してください。");
      return;
    }
    setTimelineError("");
    setPostLoading(true);

    try {
      let finalImageUrl = "";
      let finalImageSize = 0;
      let isVideo = false;

      if (imageFiles.length > 0) {
        setUploadingImage(true);
        const uploadedUrls: string[] = [];
        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          setUploadProgress(`R2送信中 (${i + 1}/${imageFiles.length}枚目)...`);
          try {
            const url = await uploadToR2(file);
            uploadedUrls.push(url);
          } catch (uploadErr: any) {
            throw new Error(`${i + 1}枚目のアップロードに失敗しました: ${uploadErr.message}`);
          }
        }
        finalImageUrl = uploadedUrls.join(",");
        finalImageSize = imageFiles.reduce((sum, file) => sum + file.size, 0);
        isVideo = imageFiles.some((file) => file.type.startsWith("video/"));
        setUploadingImage(false);
      }

      let finalFileUrl: string | null = null;
      if (postFileAttachment) {
        setUploadProgress("ファイルをアップロード中...");
        finalFileUrl = await uploadToR2(postFileAttachment);
      }

      setUploadProgress("データベースへ書き込み中...");
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          imageUrl: finalImageUrl || null,
          imageSize: finalImageSize,
          isInfo,
          isStory,
          isVideo,
          targetGroupIds: selectedGroupIds,
          poll: pollValid
            ? { question: pollQuestion.trim(), options: validPollOptions, resultsVisibleToAll: pollVisibleToAll }
            : undefined,
          fileUrl: finalFileUrl,
          fileName: postFileAttachment?.name || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "投稿の作成に失敗しました。");
      }

      setContent("");
      setImageFiles([]);
      setImagePreviewUrls([]);
      setPostFileAttachment(null);
      setIsInfo(false);
      setIsStory(false);
      setSelectedGroupIds([]);
      setShowPoll(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollVisibleToAll(false);
      await mutatePosts();
    } catch (err: any) {
      console.error("handlePostSubmit error details:", err);
      alert("投稿に失敗しました:\n" + err.message);
      setTimelineError(err.message);
    } finally {
      setPostLoading(false);
      setUploadingImage(false);
      setUploadProgress("");
    }
  };

  const handleDirectUpload = async (file: File, thumbnailFile?: File | null) => {
    setShowCamera(false);
    setPostLoading(true);
    setTimelineError("");

    try {
      const publicUrl = await uploadToR2(file);
      let thumbnailUrl: string | null = null;
      if (thumbnailFile) {
        try {
          thumbnailUrl = await uploadToR2(thumbnailFile);
        } catch (thumbErr) {
          console.error("Thumbnail upload failed:", thumbErr);
        }
      }

      const postRes = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "📹 現場から動画が届きました！",
          imageUrl: publicUrl,
          thumbnailUrl,
          imageSize: file.size,
          isInfo: false,
          isStory: true,
          isVideo: true,
          targetGroupIds: selectedGroupIds,
        }),
      });

      const postData = await postRes.json();
      if (!postRes.ok) {
        throw new Error(postData.error || "投稿の作成に失敗しました。");
      }

      await mutatePosts();
    } catch (err: any) {
      setTimelineError(err.message);
    } finally {
      setPostLoading(false);
    }
  };

  const handleEditPost = async (postId: string, newContent: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
      if (!res.ok) throw new Error("編集に失敗しました");
      await mutatePosts();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!confirm("本当にこの投稿を削除しますか？")) return;
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("削除に失敗しました");
      await mutatePosts();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const selectedFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        const fileItem = files.item(i);
        if (fileItem) selectedFiles.push(fileItem);
      }

      if (selectedFiles.length + imageFiles.length > 50) {
        alert("一度に選択できる写真は最大50枚までです。");
        e.target.value = "";
        return;
      }

      setUploadingImage(true);
      const newFiles: File[] = [];
      const newPreviewUrls: string[] = [];

      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1200,
        useWebWorker: false,
      };

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress(`画像圧縮中 (${i + 1}/${selectedFiles.length}枚目)...`);

        if (file.type.startsWith("video/")) {
          const MAX_VIDEO_BYTES = 1073741824;
          if (file.size > MAX_VIDEO_BYTES) {
            alert(`動画「${file.name}」が大きすぎます。1GB以下の動画をご利用ください。`);
            continue;
          }
          newFiles.push(file);
          newPreviewUrls.push(URL.createObjectURL(file));
        } else {
          try {
            const compressedFile = await imageCompression(file, options);
            newFiles.push(compressedFile);
            newPreviewUrls.push(URL.createObjectURL(compressedFile));
          } catch {
            newFiles.push(file);
            newPreviewUrls.push(URL.createObjectURL(file));
          }
        }
      }

      setImageFiles((prev) => [...prev, ...newFiles]);
      setImagePreviewUrls((prev) => [...prev, ...newPreviewUrls]);
    } catch (err: any) {
      alert("写真の読み込みに失敗しました:\n" + err.message);
    } finally {
      setUploadingImage(false);
      setUploadProgress("");
      e.target.value = "";
    }
  };

  const removeImageIndex = (indexToRemove: number) => {
    setImageFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setImagePreviewUrls((prev) => {
      URL.revokeObjectURL(prev[indexToRemove]);
      return prev.filter((_, idx) => idx !== indexToRemove);
    });
  };

  const handleLike = async (postId: string) => {
    try {
      const res = await fetch("/api/posts/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });

      if (res.ok) {
        mutatePosts((prevData: any) => {
          if (!prevData) return prevData;
          return {
            ...prevData,
            posts: prevData.posts.map((post: Post) => {
              if (post.id === postId) {
                const alreadyLiked = post.likes.some((l) => l.userId === session?.user?.id);
                const updatedLikes = alreadyLiked
                  ? post.likes.filter((l) => l.userId !== session?.user?.id)
                  : [...post.likes, { userId: session?.user?.id! }];
                return { ...post, likes: updatedLikes };
              }
              return post;
            }),
          };
        }, false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCommentSubmit = async (postId: string) => {
    const commentText = commentInputs[postId];
    if (!commentText || !commentText.trim()) return;

    setActionLoading(postId);
    try {
      const res = await fetch("/api/posts/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, content: commentText }),
      });

      if (res.ok) {
        const data = await res.json();
        mutatePosts((prevData: any) => {
          if (!prevData) return prevData;
          return {
            ...prevData,
            posts: prevData.posts.map((post: Post) => {
              if (post.id === postId) {
                return { ...post, comments: [...post.comments, data.comment] };
              }
              return post;
            }),
          };
        }, false);
        setCommentInputs((prev) => ({ ...prev, [postId]: "" }));
        setShowComments((prev) => ({ ...prev, [postId]: true }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGroupCheckboxChange = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const formatTime = (dateString: string) => {
    const d = new Date(dateString);
    const days = ["日", "月", "火", "水", "木", "金", "土"];
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]}) ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  if (status === "loading" || loadingData) {
    return (
      <main className="container animate-fade-in" style={{ padding: "24px", paddingBottom: "100px" }}>
        <div className="card card-glass skeleton-card" style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div className="skeleton skeleton-avatar"></div>
            <div className="skeleton skeleton-text" style={{ height: "48px", borderRadius: "24px", margin: 0 }}></div>
            <div className="skeleton skeleton-avatar"></div>
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="card card-glass skeleton-card" style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
              <div className="skeleton skeleton-avatar"></div>
              <div style={{ flex: 1 }}>
                <div className="skeleton skeleton-text short"></div>
                <div className="skeleton skeleton-text" style={{ width: "30%" }}></div>
              </div>
            </div>
            <div className="skeleton skeleton-text"></div>
            <div className="skeleton skeleton-text short"></div>
          </div>
        ))}
      </main>
    );
  }

  // チーム未設定（新規作成）の場合の画面表示
  if (!session?.user?.teamId) {
    if (isNativeApp()) {
      return (
        <main className="container animate-fade-in" style={{ padding: "80px 24px", textAlign: "center" }}>
          <div className="card card-glass" style={{ maxWidth: "450px", margin: "0 auto", padding: "32px 24px" }}>
            <h1 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "12px" }}>新規チーム登録</h1>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: 1.8, marginBottom: "20px" }}>
              この機能はご利用いただけません。
            </p>
            <button className="btn btn-secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
              ログアウト
            </button>
          </div>
        </main>
      );
    }

    return (
      <main className="container animate-fade-in" style={{ padding: "80px 24px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "48px" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 800 }}>⚡ SKILLBASE</h1>
            <p style={{ color: "var(--text-muted)" }}>
              ようこそ、{session?.user?.name} さん（{(session?.user as any)?.role === "MANAGER" ? "管理者" : "選手"}）
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
            ログアウト
          </button>
        </header>

        {teamError && (
          <div
            style={{
              background: "rgba(255, 71, 87, 0.1)",
              border: "1px solid var(--danger)",
              color: "var(--danger)",
              padding: "16px",
              borderRadius: "var(--radius-md)",
              marginBottom: "24px",
              fontWeight: 600,
            }}
          >
            {teamError}
          </div>
        )}

        <div style={{ maxWidth: "480px", margin: "0 auto" }}>
          {!inviteCode && (
            <div className="card card-glass" style={{ borderLeft: "4px solid var(--primary)" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px" }}>新しいチームを作る</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "24px" }}>
                監督・オーナー・指導者として新しいチームのSKILLBASEを立ち上げます。
              </p>

              <form onSubmit={handleCreateTeam}>
                <div className="form-group">
                  <label className="form-label" htmlFor="create-team-name">
                    チーム名
                  </label>
                  <input
                    id="create-team-name"
                    type="text"
                    className="form-control"
                    placeholder="例: ストライクス硬式野球クラブ"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                    disabled={teamLoading}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="create-team-category">
                    チーム種別（学年の表示に使います）
                  </label>
                  <select
                    id="create-team-category"
                    className="form-control"
                    value={teamCategory}
                    onChange={(e) => setTeamCategory(e.target.value)}
                    disabled={teamLoading}
                  >
                    <option value="ELEMENTARY">小学生</option>
                    <option value="JUNIOR_HIGH">中学生</option>
                    <option value="HIGH_SCHOOL">高校生</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="create-team-desc">
                    チーム紹介・指導方針（任意）
                  </label>
                  <textarea
                    id="create-team-desc"
                    className="form-control"
                    placeholder="チームの目標やスローガンなど"
                    value={teamDesc}
                    onChange={(e) => setTeamDesc(e.target.value)}
                    disabled={teamLoading}
                    rows={3}
                    style={{ resize: "vertical" }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="create-team-coupon">
                    クーポンコード（お持ちの方・任意）
                  </label>
                  <input
                    id="create-team-coupon"
                    type="text"
                    className="form-control"
                    placeholder="例: SKILL2026"
                    value={teamCoupon}
                    onChange={(e) => setTeamCoupon(e.target.value.toUpperCase())}
                    disabled={teamLoading}
                    style={{ textTransform: "uppercase" }}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: "100%", height: "48px" }} disabled={teamLoading}>
                  {teamLoading ? "作成中..." : "チームを作成する"}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    );
  }

  const userAny = session?.user as any;
  const isPostAdmin = userAny?.isOwner || userAny?.canManagePosts || userAny?.role === "MANAGER";

  const regularPosts = posts;
  const filteredTimelinePosts = regularPosts.filter((post: Post) => {
    if (post.expiresAt) return false;
    if (!selectedFilterGroupId) return true;
    return post.targetGroups?.some((g) => g.id === selectedFilterGroupId) || false;
  });

  const highlightPosts = posts.filter((post: Post) => {
    if (!post.expiresAt) return false;
    if (new Date(post.expiresAt) < new Date()) return false;
    if (!selectedFilterGroupId) return true;
    return post.targetGroups?.some((g) => g.id === selectedFilterGroupId) || false;
  });

  // 未読コラム（最大2件をタイムライン上部にピックアップ表示）
  const unreadColumns = ((columnsRes?.columns || []) as any[])
    .filter((c) => !c.isRead)
    .slice(0, 2);

  // アルバムタブ用
  const mediaItems = posts.flatMap((post: Post) => {
    if (post.expiresAt) return [];
    if (!post.imageUrl) return [];
    const urls = post.imageUrl.split(",");
    return urls.map((url, idx) => ({
      id: `${post.id}-${idx}`,
      url,
      isVideo: post.isVideo && idx === 0,
      post,
      index: idx,
      urls,
    }));
  });

  const albumAuthors = (() => {
    const map = new Map<string, string>();
    mediaItems.forEach((m) => {
      if (m.post.author) map.set(m.post.author.id, m.post.author.name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  })();
  const albumGroupChoices = (() => {
    const map = new Map<string, string>();
    mediaItems.forEach((m) =>
      (m.post.targetGroups || []).forEach((g: any) => map.set(g.id, g.name))
    );
    return Array.from(map, ([id, name]) => ({ id, name }));
  })();

  const albumMediaItems = mediaItems.filter((m) => {
    if (albumAuthorFilter && m.post.author?.id !== albumAuthorFilter) return false;
    if (albumGroupFilter && !(m.post.targetGroups || []).some((g: any) => g.id === albumGroupFilter))
      return false;
    return true;
  });

  const albumGroups = (() => {
    const grpList: { key: string; label: string; items: { item: (typeof mediaItems)[number]; globalIndex: number }[] }[] = [];
    const indexByKey = new Map<string, number>();
    albumMediaItems.forEach((item, globalIndex) => {
      const d = new Date(item.post.createdAt);
      const key = isNaN(d.getTime()) ? "unknown" : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const label = isNaN(d.getTime()) ? "日付不明" : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
      if (!indexByKey.has(key)) {
        indexByKey.set(key, grpList.length);
        grpList.push({ key, label, items: [] });
      }
      grpList[indexByKey.get(key)!].items.push({ item, globalIndex });
    });
    return grpList;
  })();

  const scrollToAlbumSection = (key: string) => {
    const el = document.getElementById(`album-sec-${key}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="container animate-fade-in" style={{ padding: "30px 24px" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <section className="feed-center">
          {/* タイムライン / アルバム タブ切り替え */}
          <div
            style={{
              display: "flex",
              gap: "4px",
              marginBottom: "20px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "4px",
            }}
          >
            <button
              onClick={() => setDashTab("timeline")}
              className="btn"
              style={{
                flex: 1,
                padding: "10px 8px",
                fontSize: "14px",
                fontWeight: 700,
                background: dashTab === "timeline" ? "var(--primary)" : "transparent",
                color: dashTab === "timeline" ? "#fff" : "var(--text-muted)",
                borderRadius: "8px",
              }}
            >
              💬 タイムライン
            </button>
            <button
              onClick={() => setDashTab("album")}
              className="btn"
              style={{
                flex: 1,
                padding: "10px 8px",
                fontSize: "14px",
                fontWeight: 700,
                background: dashTab === "album" ? "var(--primary)" : "transparent",
                color: dashTab === "album" ? "#fff" : "var(--text-muted)",
                borderRadius: "8px",
              }}
            >
              📸 アルバム
            </button>
          </div>

          {/* 📚 未読コラム・動画のピックアップバナー */}
          {dashTab === "timeline" && unreadColumns.length > 0 && (
            <div style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 800, color: "var(--primary)", letterSpacing: "0.5px" }}>
                  📚 未読のコラム・教材があります
                </h3>
                <Link href="/dashboard/columns" style={{ fontSize: "12px", color: "var(--primary)", fontWeight: 700, textDecoration: "none" }}>
                  すべて見る ➔
                </Link>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {unreadColumns.map((col: any) => {
                  const cat = getCategoryMeta(col.category);
                  return (
                    <Link
                      key={col.id}
                      href={`/dashboard/columns/${col.id}`}
                      className="card-glass"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "12px 16px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border)",
                        borderLeft: `4px solid ${cat.color}`,
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 800, color: cat.color }}>
                            {cat.icon} {cat.label}
                          </span>
                          {col.targetType === "USERS" && (
                            <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "10px", background: "rgba(244, 63, 94, 0.2)", color: "#fb7185", fontWeight: 800 }}>
                              🎯 個別指導
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 800, fontSize: "14px", color: "var(--text-main)" }}>{col.title}</div>
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: 800, color: "var(--primary)", flexShrink: 0, marginLeft: "12px" }}>
                        見る ➔
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {dashTab === "timeline" && (
            <>
              {/* グループ切り替えフィルター */}
              {groups.length > 0 &&
                (() => {
                  const activeFilterGroups = groups.filter((g: any) => !g.isArchived);
                  const archivedFilterGroups = groups.filter((g: any) => g.isArchived);
                  const chip = (selected: boolean, label: string, onClick: () => void, key?: string) => (
                    <button
                      key={key}
                      onClick={onClick}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: 600,
                        background: selected ? "rgba(255, 71, 87, 0.12)" : "var(--surface)",
                        border: selected ? "1px solid rgba(255, 71, 87, 0.3)" : "1px solid var(--border)",
                        color: selected ? "var(--primary)" : "var(--text-muted)",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {label}
                    </button>
                  );
                  return (
                    <div style={{ marginBottom: "20px" }}>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center", overflowX: "auto", paddingBottom: "4px" }}>
                        {chip(!selectedFilterGroupId, "📢 すべて", () => setSelectedFilterGroupId(null))}
                        {activeFilterGroups.map((g: any) =>
                          chip(selectedFilterGroupId === g.id, `👥 ${g.name}`, () => setSelectedFilterGroupId(g.id), g.id)
                        )}
                        {archivedFilterGroups.length > 0 &&
                          chip(
                            false,
                            `${showArchivedFilter ? "▼" : "▶"} 📦 過去（${archivedFilterGroups.length}）`,
                            () => setShowArchivedFilter((v) => !v),
                            "archived-toggle"
                          )}
                      </div>
                      {showArchivedFilter && archivedFilterGroups.length > 0 && (
                        <div style={{ display: "flex", gap: "6px", alignItems: "center", overflowX: "auto", paddingTop: "6px" }}>
                          {archivedFilterGroups.map((g: any) =>
                            chip(selectedFilterGroupId === g.id, `📦 ${g.name}`, () => setSelectedFilterGroupId(g.id), g.id)
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

              {timelineError && (
                <div
                  style={{
                    background: "rgba(255, 71, 87, 0.1)",
                    border: "1px solid var(--danger)",
                    color: "var(--danger)",
                    padding: "16px",
                    borderRadius: "var(--radius-md)",
                    marginBottom: "24px",
                    fontWeight: 600,
                  }}
                >
                  {timelineError}
                </div>
              )}

              {/* 新規投稿フォーム */}
              {isFormExpanded && (
                <div
                  className="card card-glass"
                  style={{
                    padding: "16px",
                    marginBottom: "24px",
                    borderRadius: "16px",
                    background: "var(--surface)",
                    border: "1.5px solid var(--primary)",
                  }}
                >
                  <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)" }}>✏️ タイムライン投稿を作成</span>
                    <button
                      type="button"
                      onClick={() => setShowCamera(true)}
                      className="btn btn-accent"
                      style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "6px 12px", borderRadius: "20px" }}
                    >
                      📸 ハイライトを追加
                    </button>
                  </div>

                  <form onSubmit={handlePostSubmit}>
                    <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={postLoading || uploadingImage}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "40px",
                            height: "40px",
                            borderRadius: "50%",
                            background: "rgba(0, 0, 0, 0.05)",
                            color: "var(--text-muted)",
                            border: "none",
                            cursor: "pointer",
                            marginBottom: "4px",
                          }}
                        >
                          🖼️
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,video/*"
                          style={{ display: "none" }}
                          onChange={handleImageChange}
                          disabled={postLoading || uploadingImage}
                          multiple
                        />

                        <button
                          type="button"
                          onClick={() => fileAttachmentInputRef.current?.click()}
                          disabled={postLoading || uploadingImage}
                          title="ファイルを添付（PDFなど）"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "40px",
                            height: "40px",
                            borderRadius: "50%",
                            background: postFileAttachment ? "rgba(79, 70, 229, 0.12)" : "rgba(0, 0, 0, 0.05)",
                            color: postFileAttachment ? "var(--primary)" : "var(--text-muted)",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "18px",
                            marginBottom: "4px",
                          }}
                        >
                          📎
                        </button>
                        <input
                          ref={fileAttachmentInputRef}
                          type="file"
                          style={{ display: "none" }}
                          onChange={(e) => setPostFileAttachment(e.target.files?.[0] || null)}
                          disabled={postLoading || uploadingImage}
                        />
                      </div>

                      <div style={{ flex: 1 }}>
                        <textarea
                          className="form-control"
                          placeholder="チームの連絡や練習の気づきをシェアしましょう..."
                          value={content}
                          onChange={(e) => setContent(e.target.value)}
                          required={imageFiles.length === 0 && !postFileAttachment && !showPoll}
                          rows={3}
                          style={{
                            resize: "vertical",
                            fontSize: "15px",
                            background: "var(--surface)",
                            borderRadius: "12px",
                            padding: "12px 16px",
                            minHeight: "80px",
                            border: "1px solid var(--border)",
                            width: "100%",
                          }}
                          disabled={postLoading}
                        />
                      </div>
                    </div>

                    {imagePreviewUrls.length > 0 && (
                      <div style={{ marginTop: "12px", marginLeft: "52px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {imagePreviewUrls.map((url, idx) => (
                          <div key={url} style={{ position: "relative", display: "inline-block" }}>
                            {imageFiles[idx]?.type.startsWith("video/") ? (
                              <video src={url} style={{ height: "80px", width: "80px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--border)" }} />
                            ) : (
                              <img src={url} alt="Preview" style={{ height: "80px", width: "80px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--border)" }} />
                            )}
                            <button
                              type="button"
                              onClick={() => removeImageIndex(idx)}
                              disabled={postLoading || uploadingImage}
                              style={{
                                position: "absolute",
                                top: "-4px",
                                right: "-4px",
                                background: "var(--danger)",
                                color: "white",
                                border: "none",
                                borderRadius: "50%",
                                width: "18px",
                                height: "18px",
                                cursor: "pointer",
                                fontSize: "11px",
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {postFileAttachment && (
                      <div style={{ marginTop: "12px", marginLeft: "52px", display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "12px", border: "1px solid var(--border)", borderRadius: "6px", padding: "6px 10px" }}>
                        <span>📎 {postFileAttachment.name}</span>
                        <button type="button" onClick={() => setPostFileAttachment(null)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer" }}>
                          ✕
                        </button>
                      </div>
                    )}

                    <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                      {postableGroups.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%", marginBottom: "8px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)" }}>宛先グループ:</span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            <button
                              type="button"
                              onClick={() => setSelectedGroupIds([])}
                              disabled={postLoading}
                              style={{
                                padding: "6px 14px",
                                borderRadius: "16px",
                                fontSize: "12px",
                                fontWeight: 600,
                                background: selectedGroupIds.length === 0 ? "rgba(255, 71, 87, 0.12)" : "var(--surface)",
                                border: selectedGroupIds.length === 0 ? "1px solid rgba(255, 71, 87, 0.4)" : "1px solid var(--border)",
                                color: selectedGroupIds.length === 0 ? "var(--primary)" : "var(--text-muted)",
                                cursor: "pointer",
                              }}
                            >
                              📢 全体
                            </button>
                            {postableGroups.map((group: any) => {
                              const isSelected = selectedGroupIds.includes(group.id);
                              return (
                                <button
                                  key={group.id}
                                  type="button"
                                  onClick={() => handleGroupCheckboxChange(group.id)}
                                  disabled={postLoading}
                                  style={{
                                    padding: "6px 14px",
                                    borderRadius: "16px",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    background: isSelected ? "rgba(255, 71, 87, 0.12)" : "var(--surface)",
                                    border: isSelected ? "1px solid rgba(255, 71, 87, 0.4)" : "1px solid var(--border)",
                                    color: isSelected ? "var(--primary)" : "var(--text-muted)",
                                    cursor: "pointer",
                                  }}
                                >
                                  {isSelected ? "✓ " : "+ "}
                                  {group.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div style={{ marginBottom: "10px" }}>
                        {!showPoll ? (
                          <button
                            type="button"
                            onClick={() => setShowPoll(true)}
                            style={{ padding: "6px 12px", fontSize: "13px", background: "transparent", border: "1px dashed var(--border)", borderRadius: "8px", color: "var(--text-muted)", cursor: "pointer" }}
                          >
                            📊 アンケートを追加
                          </button>
                        ) : (
                          <div style={{ background: "rgba(79,70,229,0.04)", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                              <span style={{ fontSize: "13px", fontWeight: 700 }}>📊 アンケート</span>
                              <button type="button" onClick={() => { setShowPoll(false); setPollQuestion(""); setPollOptions(["", ""]); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "13px" }}>
                                削除
                              </button>
                            </div>
                            <input type="text" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="質問を入力" className="form-control" style={{ marginBottom: "8px", fontSize: "14px" }} />
                            {pollOptions.map((opt, i) => (
                              <div key={i} style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
                                <input type="text" value={opt} onChange={(e) => setPollOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))} placeholder={`選択肢${i + 1}`} className="form-control" style={{ flex: 1, fontSize: "14px" }} />
                                {pollOptions.length > 2 && (
                                  <button type="button" onClick={() => setPollOptions((prev) => prev.filter((_, idx) => idx !== i))} style={{ padding: "0 10px", background: "transparent", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--danger)", cursor: "pointer" }}>
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                            {pollOptions.length < 10 && (
                              <button type="button" onClick={() => setPollOptions((prev) => [...prev, ""])} style={{ padding: "4px 10px", fontSize: "12px", background: "transparent", border: "1px dashed var(--border)", borderRadius: "6px", color: "var(--text-muted)", cursor: "pointer" }}>
                                ＋ 選択肢を追加
                              </button>
                            )}
                            <label style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", fontSize: "12px", color: "var(--text-muted)", cursor: "pointer" }}>
                              <input type="checkbox" checked={pollVisibleToAll} onChange={(e) => setPollVisibleToAll(e.target.checked)} />
                              誰が選んだか、全員に公開する
                            </label>
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
                        <button
                          type="submit"
                          disabled={postLoading || uploadingImage || (!content.trim() && imageFiles.length === 0 && !postFileAttachment && !showPoll)}
                          className="btn btn-primary"
                          style={{ padding: "6px 20px", fontSize: "13px", borderRadius: "20px" }}
                        >
                          {postLoading ? uploadProgress || "投稿中..." : "投稿する"}
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              )}

              {showCamera && <StoryCamera onClose={() => setShowCamera(false)} onRecordComplete={handleDirectUpload} />}

              {highlightPosts && highlightPosts.length > 0 && (
                <HighlightCarousel
                  highlights={highlightPosts}
                  currentUserId={session?.user?.id || ""}
                  isPostAdmin={isPostAdmin}
                  onDeleteHighlight={handleDeletePost}
                />
              )}

              <div>
                <h3 style={{ fontSize: "13px", fontWeight: 800, color: "var(--text-muted)", letterSpacing: "1px", marginBottom: "12px" }}>
                  💬 {selectedFilterGroupId ? `タイムライン (${groups.find((g: any) => g.id === selectedFilterGroupId)?.name})` : "タイムライン"}
                </h3>

                {filteredTimelinePosts.length === 0 ? (
                  <div className="card" style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                    投稿はありません。最初のメッセージを投稿してみましょう！
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {filteredTimelinePosts.map((post: Post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        session={session}
                        commentInputs={commentInputs}
                        setCommentInputs={setCommentInputs}
                        showComments={showComments}
                        setShowComments={setShowComments}
                        handleLike={handleLike}
                        handleCommentSubmit={handleCommentSubmit}
                        handleEditPost={handleEditPost}
                        handleDeletePost={handleDeletePost}
                        actionLoading={actionLoading}
                        formatTime={formatTime}
                        mutatePosts={mutatePosts}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* アルバムビュー */}
          {dashTab === "album" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <h3 style={{ fontSize: "13px", fontWeight: 800, color: "var(--text-muted)", letterSpacing: "1px", margin: 0 }}>
                  📸 チームアルバム
                </h3>
                <Link href="/dashboard/album/highlights" className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: "12px" }}>
                  🔴 ハイライト履歴
                </Link>
              </div>

              {mediaItems.length === 0 ? (
                <div className="card" style={{ padding: "60px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                  まだ写真・動画の投稿がありません。
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px", alignItems: "center" }}>
                    <select value={albumAuthorFilter} onChange={(e) => setAlbumAuthorFilter(e.target.value)} className="form-control" style={{ width: "auto", padding: "6px 10px", fontSize: "13px" }}>
                      <option value="">👤 投稿者：すべて</option>
                      {albumAuthors.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    {albumGroupChoices.length > 0 && (
                      <select value={albumGroupFilter} onChange={(e) => setAlbumGroupFilter(e.target.value)} className="form-control" style={{ width: "auto", padding: "6px 10px", fontSize: "13px" }}>
                        <option value="">📢 グループ：すべて</option>
                        {albumGroupChoices.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {albumGroups.map((g) => (
                    <div key={g.key} id={`album-sec-${g.key}`} style={{ marginBottom: "22px" }}>
                      <div style={{ padding: "6px 0", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid var(--border)" }}>
                        <span style={{ fontSize: "13px", fontWeight: 800 }}>{g.label}</span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{g.items.length}枚</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "6px" }}>
                        {g.items.map(({ item, globalIndex }) => (
                          <div
                            key={item.id}
                            onClick={() => setAlbumViewerIndex(globalIndex)}
                            style={{ aspectRatio: "1 / 1", overflow: "hidden", borderRadius: "8px", background: "#000", cursor: "pointer", position: "relative", border: "1px solid var(--border)" }}
                          >
                            {item.isVideo ? (
                              <video src={`${item.url}#t=0.1`} preload="metadata" muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <img src={item.url || ""} alt="投稿画像" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {albumViewerIndex !== null && albumMediaItems.length > 0 && (
                <MediaViewer
                  items={albumMediaItems.map((item) => ({
                    id: item.id,
                    url: item.url,
                    thumbnailUrl: item.index === 0 ? item.post.thumbnailUrl : null,
                    isVideo: item.isVideo,
                    authorName: item.post.author?.name,
                    createdAt: item.post.createdAt,
                    caption: item.post.content,
                  }))}
                  startIndex={albumViewerIndex}
                  onClose={() => setAlbumViewerIndex(null)}
                />
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PostCard({
  post,
  session,
  commentInputs,
  setCommentInputs,
  showComments,
  setShowComments,
  handleLike,
  handleCommentSubmit,
  handleEditPost,
  handleDeletePost,
  actionLoading,
  formatTime,
  mutatePosts,
}: {
  post: Post;
  session: any;
  mutatePosts: () => void;
  commentInputs: { [key: string]: string };
  setCommentInputs: any;
  showComments: { [key: string]: boolean };
  setShowComments: any;
  handleLike: (id: string) => void;
  handleCommentSubmit: (id: string) => void;
  handleEditPost: (id: string, content: string) => void;
  handleDeletePost: (id: string) => void;
  actionLoading: string | null;
  formatTime: (t: string) => string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);

  const isLiked = post.likes.some((like) => like.userId === session?.user?.id);
  const commentText = commentInputs[post.id] || "";
  const commentsVisible = showComments[post.id] || false;

  const isAuthor = post.author.id === session?.user?.id;
  const isPostAdmin = session?.user?.isOwner || session?.user?.canManagePosts || session?.user?.role === "MANAGER";

  const [voting, setVoting] = useState(false);
  const [showVoters, setShowVoters] = useState(false);
  const votePoll = async (option: string) => {
    if (!post.poll || voting) return;
    setVoting(true);
    try {
      await fetch("/api/posts/poll/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollId: post.poll.id, selectedOption: option }),
      });
      await mutatePosts();
    } catch {
    } finally {
      setVoting(false);
    }
  };
  const canDelete = isAuthor || isPostAdmin;
  const canEdit = isAuthor;

  const renderPostMedia = () => {
    if (!post.imageUrl) return null;
    const urls = post.imageUrl.split(",");

    if (urls.length === 1) {
      return (
        <div
          style={{
            marginTop: "10px",
            borderRadius: "12px",
            overflow: "hidden",
            maxHeight: "380px",
            background: "rgba(0,0,0,0.03)",
            display: "flex",
            justifyContent: "center",
            border: "1px solid var(--border)",
            cursor: "pointer",
          }}
          onClick={() => setActivePhotoIndex(0)}
        >
          {post.isVideo ? (
            <video
              src={`${urls[0]}#t=0.1`}
              poster={post.thumbnailUrl || undefined}
              controls
              preload="metadata"
              style={{ maxWidth: "100%", maxHeight: "380px" }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img src={urls[0]} alt="投稿画像" style={{ maxWidth: "100%", maxHeight: "380px", objectFit: "contain" }} />
          )}
        </div>
      );
    }

    return (
      <div style={{ marginTop: "10px", borderRadius: "12px", overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", maxHeight: "320px", border: "1px solid var(--border)" }}>
        {urls.slice(0, 4).map((url, idx) => (
          <div key={url} onClick={() => setActivePhotoIndex(idx)} style={{ cursor: "pointer", height: "160px" }}>
            <img src={url} alt="投稿画像" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="card-glass animate-fade-in"
      style={{
        borderRadius: "var(--radius-md)",
        border: "1px solid " + (post.isInfo ? "rgba(255, 71, 87, 0.3)" : "var(--border)"),
        background: post.isInfo ? "rgba(255, 71, 87, 0.05)" : "var(--surface)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div
            style={{
              background: "var(--surface-hover)",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "12px",
              color: "var(--primary)",
              border: "1px solid var(--border)",
            }}
          >
            {post.author.jerseyNumber || post.author.name.charAt(0)}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <strong style={{ fontSize: "14px" }}>{post.author.name}</strong>
              <span className={`badge ${post.author.role === "MANAGER" ? "badge-primary" : "badge-accent"}`} style={{ fontSize: "9px", padding: "1px 5px" }}>
                {post.author.role === "MANAGER" ? "指導者" : "選手"}
              </span>
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{formatTime(post.createdAt)}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "4px" }}>
          {post.targetGroups.map((group) => (
            <span key={group.id} className="badge badge-secondary" style={{ fontSize: "9px", padding: "2px 6px", border: "1px solid var(--border)" }}>
              👥 {group.name}
            </span>
          ))}
          {post.targetGroups.length === 0 && (
            <span className="badge badge-secondary" style={{ fontSize: "9px", padding: "2px 6px", background: "rgba(30, 144, 255, 0.08)", color: "var(--accent-blue)" }}>
              📢 全員
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: "0 20px 16px 20px" }}>
        {isEditing ? (
          <div>
            <textarea
              className="form-control"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={4}
              style={{ width: "100%", marginBottom: "8px", fontSize: "14px" }}
            />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: "12px" }} onClick={() => { setIsEditing(false); setEditContent(post.content); }}>
                キャンセル
              </button>
              <button className="btn btn-primary" style={{ padding: "4px 12px", fontSize: "12px" }} onClick={() => { handleEditPost(post.id, editContent); setIsEditing(false); }}>
                保存
              </button>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: "14px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{post.content}</p>
        )}

        {renderPostMedia()}

        {post.fileUrl && (
          <a href={post.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--primary)", textDecoration: "underline", marginTop: "8px" }}>
            📎 {post.fileName || "添付ファイル"}
          </a>
        )}

        {post.poll &&
          (() => {
            const options = post.poll.options.split(",");
            const total = post.poll.answers.length;
            const myVote = post.poll.answers.find((a) => a.userId === session?.user?.id)?.selectedOption;
            return (
              <div style={{ marginTop: "12px", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "10px" }}>📊 {post.poll.question}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {options.map((opt) => {
                    const count = post.poll!.answers.filter((a) => a.selectedOption === opt).length;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const mine = myVote === opt;
                    return (
                      <button key={opt} type="button" onClick={() => votePoll(opt)} disabled={voting} style={{ position: "relative", textAlign: "left", padding: "8px 12px", borderRadius: "8px", border: mine ? "1px solid var(--primary)" : "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct}%`, background: mine ? "rgba(79,70,229,0.18)" : "rgba(0,0,0,0.05)" }} />
                        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: mine ? 700 : 500 }}>
                          <span>{mine ? "✓ " : ""}{opt}</span>
                          <span style={{ color: "var(--text-muted)" }}>{count}票 ({pct}%)</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "8px", display: "flex", justifyContent: "space-between" }}>
                  <span>計{total}票</span>
                  {(post.poll.resultsVisibleToAll || isAuthor || isPostAdmin) && total > 0 && (
                    <button type="button" onClick={() => setShowVoters(!showVoters)} style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}>
                      {showVoters ? "内訳を隠す" : "誰が選んだか見る"}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
      </div>

      {activePhotoIndex !== null && post.imageUrl && (
        <MediaViewer
          items={post.imageUrl.split(",").filter(Boolean).map((url: string, idx: number) => ({
            id: `${post.id}-${idx}`,
            url,
            thumbnailUrl: idx === 0 ? post.thumbnailUrl : null,
            isVideo: post.isVideo && idx === 0,
            authorName: post.author?.name,
            createdAt: post.createdAt,
            caption: post.content,
          }))}
          startIndex={activePhotoIndex}
          onClose={() => setActivePhotoIndex(null)}
        />
      )}

      <div style={{ padding: "10px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: "20px", fontSize: "13px", fontWeight: 600, justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "20px" }}>
          <button onClick={() => handleLike(post.id)} style={{ background: "none", border: "none", color: isLiked ? "var(--primary)" : "var(--text-muted)", cursor: "pointer", fontWeight: "inherit", fontSize: "inherit" }}>
            👍 いいね ({post.likes.length})
          </button>
          <button onClick={() => setShowComments((prev: any) => ({ ...prev, [post.id]: !commentsVisible }))} style={{ background: "none", border: "none", color: commentsVisible ? "var(--text-main)" : "var(--text-muted)", cursor: "pointer", fontWeight: "inherit", fontSize: "inherit" }}>
            💬 コメント ({post.comments.length})
          </button>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {canEdit && !isEditing && (
            <button onClick={() => setIsEditing(true)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "12px" }}>
              編集
            </button>
          )}
          {canDelete && (
            <button onClick={() => handleDeletePost(post.id)} style={{ background: "none", border: "none", color: "var(--primary)", cursor: "pointer", fontSize: "12px" }}>
              削除
            </button>
          )}
        </div>
      </div>

      {commentsVisible && (
        <div style={{ background: "rgba(0,0,0,0.02)", borderTop: "1px solid var(--border)", padding: "16px 20px" }}>
          {post.comments.length > 0 && (
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px" }}>
              {post.comments.map((comment) => (
                <li key={comment.id} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "13px" }}>
                  <div style={{ background: "var(--surface-hover)", width: "24px", height: "24px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "10px", color: "var(--text-muted)", border: "1px solid var(--border)", flexShrink: 0 }}>
                    {comment.author.name.charAt(0)}
                  </div>
                  <div style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                      <strong style={{ fontSize: "12px" }}>{comment.author.name}</strong>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{formatTime(comment.createdAt)}</span>
                    </div>
                    <p style={{ lineHeight: 1.3 }}>{comment.content}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            <input
              type="text"
              className="form-control"
              placeholder="コメントを書き込む..."
              value={commentText}
              onChange={(e) => setCommentInputs((prev: any) => ({ ...prev, [post.id]: e.target.value }))}
              style={{ flex: 1, padding: "6px 12px", fontSize: "12px" }}
              disabled={actionLoading === post.id}
            />
            <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: "12px", height: "33px" }} onClick={() => handleCommentSubmit(post.id)} disabled={actionLoading === post.id}>
              {actionLoading === post.id ? "送信中" : "送信"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: "center", padding: "40px" }}>読み込み中...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
