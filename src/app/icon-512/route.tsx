import { appIconResponse } from "@/lib/app-icon";

export const dynamic = "force-static";

export function GET() {
  return appIconResponse(512);
}
