import { http } from "./http";

function unwrap(response, fallback = null) {
  return response?.data?.data ?? response?.data ?? fallback;
}

export async function fetchFocusOverview() {
  return unwrap(await http.get("/focus/overview"), {});
}

export async function startFocusSession(payload) {
  return unwrap(await http.post("/focus/start", payload));
}

export async function finishFocusSession(payload) {
  return unwrap(await http.post("/focus/finish", payload));
}

export async function cancelFocusSession(payload) {
  return unwrap(await http.post("/focus/cancel", payload));
}

export async function fetchTodayCheckin() {
  return unwrap(await http.get("/focus/checkin/today"), {});
}

export async function submitCheckin(drawType) {
  return unwrap(await http.post("/focus/checkin", null, { params: { drawType } }), {});
}

export async function fetchUserAudio() {
  return unwrap(await http.get("/focus/audio"), []);
}

export async function uploadUserAudio(file, title = "") {
  const formData = new FormData();
  formData.append("file", file);
  if (title) formData.append("title", title);
  return unwrap(await http.post("/focus/audio", formData, {
    headers: { "Content-Type": "multipart/form-data" }
  }));
}

export async function deleteUserAudio(audioId) {
  await http.delete(`/focus/audio/${audioId}`);
}
