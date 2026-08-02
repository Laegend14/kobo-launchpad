import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mnnruqxujmlptzlrjdbq.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_LCqo1bRQRiTN2t5nlW39KA_B1-aliY1";

export const createClient = () =>
  createBrowserClient(
    supabaseUrl,
    supabaseKey
  );
