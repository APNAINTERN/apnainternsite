import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "apnainternsite",
    timestamp: new Date().toISOString(),
  });
}
