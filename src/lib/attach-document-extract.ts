import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const FieldSchema = z.object({
  label: z.string(),
  type: z.enum(["text", "textarea", "date", "checkbox", "select"]),
  required: z.boolean(),
  options: z.array(z.string()).nullable(), // "select"の時のみ選択肢を入れる。それ以外はnull。
});

const ExtractionResultSchema = z.object({
  title: z.string(),
  bodyText: z.string().nullable(),
  fields: z.array(FieldSchema),
});

export type ExtractedDocument = z.infer<typeof ExtractionResultSchema>;

const TYPE_PROMPTS: Record<string, string> = {
  APPLICATION:
    "これは野球チームの「入団申込書」です。書類の案内文(理念・注意事項など)があればbodyTextに、" +
    "申込者が記入して提出する入力項目(氏名・生年月日・連絡先など)を全てfieldsに書き出してください。",
  PLEDGE:
    "これは野球チームの「誓約書」です。同意すべき誓約文の本文をそのままbodyTextに書き出してください。" +
    "「同意します」というチェックボックスと氏名の入力欄は、このシステム側で自動的に別途用意するため、" +
    "fieldsには含めないでください。誓約文とは別に記入が必要な項目(日付・連絡先など)があればfieldsに追加してください。",
  OTHER:
    "これは野球チームが配布する案内資料です。本文の内容をそのままbodyTextに書き出してください。" +
    "読み手が記入して返送する必要がある項目があればfieldsに追加してください。無ければfieldsは空配列にしてください。",
};

function getAnthropicApiKey(env: any): string | undefined {
  return env?.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
}

// R2にアップロード済みのファイル(PDF/画像)をAIに読み取らせ、下書きのtitle/bodyText/fieldsを生成する。
export async function extractDocumentDraft(fileUrl: string, type: string): Promise<ExtractedDocument> {
  let env: any = {};
  try {
    const ctx = getCloudflareContext();
    if (ctx?.env) env = ctx.env;
  } catch {
    // ローカル開発等でCloudflareコンテキストが無い場合はprocess.envにフォールバック
  }

  const apiKey = getAnthropicApiKey(env);
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEYが設定されていません。管理者に設定を依頼してください。");
  }

  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error("アップロードしたファイルの取得に失敗しました。");
  }
  const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
  const arrayBuffer = await fileRes.arrayBuffer();
  const base64Data = Buffer.from(arrayBuffer).toString("base64");

  const isPdf = contentType.includes("pdf");
  const isImage = contentType.startsWith("image/");
  if (!isPdf && !isImage) {
    throw new Error("PDFまたは画像ファイル(JPEG/PNG)のみ読み取りに対応しています。");
  }

  const client = new Anthropic({ apiKey });

  const instruction = TYPE_PROMPTS[type] || TYPE_PROMPTS.OTHER;

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          isPdf
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } }
            : { type: "image", source: { type: "base64", media_type: contentType as any, data: base64Data } },
          {
            type: "text",
            text:
              `${instruction}\n\n` +
              "fieldsの各項目は、実際にこの書類に書かれている見出し・欄の名前をそのままlabelにしてください。" +
              "typeは自由記述の欄は\"text\"、複数行になりそうな欄は\"textarea\"、日付欄は\"date\"、" +
              "チェック欄は\"checkbox\"、選択肢がある欄は\"select\"(optionsに選択肢を列挙)にしてください。\n\n" +
              "特定の項目だけに関する短い注記(例:「わかる範囲でよい」「任意」といった記入方法の補足)は、" +
              "bodyTextに含めず、該当するlabelの末尾に括弧書きで含めてください" +
              "(例: label=\"体格・能力（わかる範囲でよい）\")。bodyTextには、" +
              "特定の1項目に紐づかない書類全体の案内文・理念・注意事項のみを書き出してください。",
          },
        ],
      },
    ],
    output_config: {
      format: zodOutputFormat(ExtractionResultSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("AIの読み取り結果を解析できませんでした。手動で入力してください。");
  }
  return response.parsed_output;
}
