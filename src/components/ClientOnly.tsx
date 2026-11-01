"use client";

import { useState, useEffect } from "react";

/**
 * 子要素をサーバー描画せず、クライアントでマウント後にだけ描画する。
 * OpenNext(Workers)上で useSession 等のサーバー/クライアント差によるハイドレーション
 * 不整合でダッシュボードのレンダラーがクラッシュする問題を回避するためのラッパー。
 */
export default function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return <>{children}</>;
}
