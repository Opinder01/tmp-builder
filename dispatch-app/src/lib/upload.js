import { supabase } from "./supabaseClient.js";
import { api } from "./api.js";

export async function uploadFile(bucket, file) {
  const { path, token } = await api.post("/api/uploads?action=sign-upload", {
    bucket,
    file_name: file.name,
  });
  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file);
  if (error) throw error;
  return path;
}
