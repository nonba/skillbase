import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { name, email, type, content } = await req.json();

    if (!name || !email || !content) {
      return NextResponse.json({ error: "必須項目が入力されていません。" }, { status: 400 });
    }

    const inquiry = await db.inquiry.create({
      data: {
        name,
        email,
        type: type || "その他",
        content,
      }
    });

    return NextResponse.json({ success: true, inquiry });
  } catch (error) {
    console.error("[INQUIRY_POST]", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
