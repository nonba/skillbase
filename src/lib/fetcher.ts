export const fetcher = async (url: string) => {
  const res = await fetch(url);
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "データの取得に失敗しました。");
  }
  
  return res.json();
};
