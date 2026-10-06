import { createClient } from "@/lib/supabase/server";
import { handleProfilePhotoRequest } from "@/lib/studio/profile-photo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) { return handleProfilePhotoRequest(request, createClient); }
export async function POST(request: Request) { return handleProfilePhotoRequest(request, createClient); }
export async function DELETE(request: Request) { return handleProfilePhotoRequest(request, createClient); }
