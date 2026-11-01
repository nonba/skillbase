import { db } from "./db";
import { getEnv } from "./env";
import { buildKaihipayCourseIds, diffCustomerCourses } from "./billing";

// 会費Pay API(https://api.kaihipay.jp/v1)の薄いクライアント。
// APIトークンは発行から30日で失効するため、KaihipayConfig(D1)にキャッシュし、
// 期限が近ければ都度 regenerate_token で更新する(Cronトリガーはこのプロジェクトに存在しないため遅延リフレッシュ方式)。

const BASE_URL = "https://api.kaihipay.jp/v1";
const CONFIG_ID = "singleton";
const REFRESH_BUFFER_MS = 3 * 24 * 60 * 60 * 1000; // 期限3日前になったら再発行しておく

async function regenerateToken(): Promise<{ token: string; expiresAt: Date }> {
  const email = getEnv("KAIHIPAY_API_EMAIL");
  const password = getEnv("KAIHIPAY_API_PASSWORD");
  if (!email || !password) {
    throw new Error("KAIHIPAY_API_EMAIL / KAIHIPAY_API_PASSWORD が設定されていません。");
  }
  const res = await fetch(`${BASE_URL}/regenerate_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`会費Payトークン再発行に失敗しました(${res.status}): ${await res.text()}`);
  }
  const data: any = await res.json();
  // レスポンスは "2021-07-01 13:00:00" 形式。フィールド名はAPI仕様書では expire_date だが、
  // 実際のレスポンスは expiry_date で返ってくる(2026-08-26に実APIで確認)ため両方見る。
  const rawExpiry = data.expiry_date ?? data.expire_date;
  const expiresAt = new Date(String(rawExpiry).replace(" ", "T"));
  if (isNaN(expiresAt.getTime())) {
    throw new Error(`会費Payトークンの有効期限を解析できませんでした: ${JSON.stringify(data)}`);
  }
  return { token: data.token, expiresAt };
}

async function getValidToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const config = await db.kaihipayConfig.findUnique({ where: { id: CONFIG_ID } });
    if (config && config.tokenExpiresAt.getTime() - Date.now() > REFRESH_BUFFER_MS) {
      return config.apiToken;
    }
  }
  const { token, expiresAt } = await regenerateToken();
  await db.kaihipayConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID, apiToken: token, tokenExpiresAt: expiresAt },
    update: { apiToken: token, tokenExpiresAt: expiresAt },
  });
  return token;
}

export class KaihipayApiError extends Error {
  status: number;
  errors: string[];
  constructor(status: number, path: string, bodyText: string) {
    super(`会費Pay APIエラー(${status}) ${path}: ${bodyText}`);
    this.name = "KaihipayApiError";
    this.status = status;
    this.errors = [];
    try {
      const parsed = JSON.parse(bodyText);
      if (Array.isArray(parsed?.errors)) this.errors = parsed.errors;
    } catch {
      // ボディがJSONでない場合はerrors=[]のまま
    }
  }
}

async function request<T = any>(path: string, options: RequestInit = {}): Promise<{ data: T | null; location?: string }> {
  let token = await getValidToken();
  let res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  // キャッシュ済みトークンが(有効期限内でも)何らかの理由で失効している場合、強制的に取り直して1回だけ再試行する。
  // 会費Payはメール/パスワードでregenerate_tokenを呼ぶと以前のトークンを無効化する挙動があり、
  // このアプリ以外(管理画面のAPI連携再保存など)から呼ばれるとキャッシュが古くなることがあるため。
  if (res.status === 401) {
    token = await getValidToken(true);
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  }
  if (!res.ok) {
    throw new KaihipayApiError(res.status, path, await res.text());
  }
  const location = res.headers.get("location") || undefined;
  const text = await res.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // 一部のエンドポイントはボディなし(201+locationヘッダーのみ)
    }
  }
  return { data, location };
}

function extractIdFromLocation(location: string | undefined): string {
  if (!location) throw new Error("会費Pay APIのレスポンスにlocationヘッダーがありません。");
  const segments = location.split("/").filter(Boolean);
  return segments[segments.length - 1];
}

// このkaihipayアカウントの会員項目は「氏名=姓名別々」「住所=都道府県/市区町村/番地以降を別々」設定
// (2026-08-26に実APIの400エラーで確認。管理画面の一覧表示だけでは単一/分割の判別がつかなかった)。
export interface KaihipayCustomerFields {
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  zipCode: string;
  prefecture: string;
  municipalities: string;
  streetAddress: string;
  tel: string;
  mail: string;
}

// 会員登録。会員番号は会費Pay側の自動採番(レスポンスのlocationヘッダーから取得)。
export async function createCustomer(fields: KaihipayCustomerFields): Promise<string> {
  const { location } = await request("/customers", {
    method: "POST",
    body: JSON.stringify({
      last_name: fields.lastName,
      first_name: fields.firstName,
      last_name_kana: fields.lastNameKana,
      first_name_kana: fields.firstNameKana,
      zip_code: fields.zipCode,
      prefecture: fields.prefecture,
      municipalities: fields.municipalities,
      street_address: fields.streetAddress,
      tel: fields.tel,
      mail: fields.mail,
    }),
  });
  return extractIdFromLocation(location);
}

export interface KaihipayCustomerCourse {
  customerCourseId: number;
  courseId: number;
}

export async function listCustomerCourses(customerNumber: string): Promise<KaihipayCustomerCourse[]> {
  const { data } = await request<{ response: { data: any[] } }>(
    `/customers/${encodeURIComponent(customerNumber)}/customer_courses`
  );
  return (data?.response?.data || []).map((c: any) => ({ customerCourseId: c.id, courseId: c.course_id }));
}

// 月次コースでも year/month(初回課金の年月)の指定が必須(API仕様書には明記されていないが、実APIで確認)。
// 請求確定締切日(毎月12日)を過ぎている場合は当月分の請求にもう間に合わないため、翌月から開始する。
function nextBillableYearMonth(): { year: number; month: number } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getDate() <= 12 ? now.getMonth() + 1 : now.getMonth() + 2; // getMonth()は0始まり
  if (month > 12) {
    month -= 12;
    year += 1;
  }
  return { year, month };
}

export async function addCustomerCourse(customerNumber: string, courseId: number): Promise<void> {
  const { year, month } = nextBillableYearMonth();
  await request(`/customers/${encodeURIComponent(customerNumber)}/customer_courses`, {
    method: "POST",
    body: JSON.stringify({ course_id: courseId, year, month }),
  });
}

export async function deleteCustomerCourse(customerNumber: string, customerCourseId: number): Promise<void> {
  await request(
    `/customers/${encodeURIComponent(customerNumber)}/customer_courses/${customerCourseId}`,
    { method: "DELETE" }
  );
}

export type SyncCustomerCoursesResult = { ok: true } | { ok: false; reason: "not_ready" };

// チームのプラン設定に合わせて会費Pay側のcustomer_coursesを追加/削除で一致させる。
// 会費Payの仕様上、会員が支払い方法を登録して「初回継続課金日」が確定するまではコース追加ができず
// 「請求データ作成中のため追加できません。」エラーになる(ヘルプセンターの記事で確認、APIドキュメント未記載)。
// このエラーはハードエラーではなく「まだ準備できていない」を意味するため、reason:"not_ready"として区別する。
export async function syncCustomerCourses(
  customerNumber: string,
  team: { maxUsers: number; scorePlan: string; maxStorageBytes: number },
  discountPercent: number = 0
): Promise<SyncCustomerCoursesResult> {
  const desiredCourseIds = buildKaihipayCourseIds(team, discountPercent);
  const current = await listCustomerCourses(customerNumber);
  const { toAdd, toRemove } = diffCustomerCourses(desiredCourseIds, current);
  try {
    for (const customerCourseId of toRemove) {
      await deleteCustomerCourse(customerNumber, customerCourseId);
    }
    for (const courseId of toAdd) {
      await addCustomerCourse(customerNumber, courseId);
    }
    return { ok: true };
  } catch (error: any) {
    // instanceof はバンドル境界で稀に一致しないことがあるため、構造(status/errors配列)でも判定する。
    const errorsList: string[] = Array.isArray(error?.errors) ? error.errors : [];
    const isNotReady = error?.status === 400 && errorsList.some((e) => typeof e === "string" && e.includes("作成中"));
    if (isNotReady) {
      return { ok: false, reason: "not_ready" };
    }
    throw error;
  }
}

// FREE_ENTRYへの自己ダウングレード時、次回課金サイクルに入る前にコースを全解約するために使う
// (2026-09-03追加)。当月分はすでに確定済みのため即解約しても請求自体は止められないが、
// 「今すぐ解約すると来月分の請求が発生しない状態」を作る目的。契約自体(customer_number)は残す。
export async function cancelAllCustomerCourses(customerNumber: string): Promise<void> {
  const current = await listCustomerCourses(customerNumber);
  for (const c of current) {
    await deleteCustomerCourse(customerNumber, c.customerCourseId);
  }
}

export interface KaihipayCourse {
  id: number;
  name: string;
}

export async function listCourses(): Promise<KaihipayCourse[]> {
  const { data } = await request<{ response: { data: any[] } }>("/courses");
  return (data?.response?.data || []).map((c: any) => ({ id: c.id, name: c.name }));
}
