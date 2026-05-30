import { handleApi, sendError } from "../server.js";

export default async function handler(req, res) {
  const url = new URL(req.url || "/", `https://${req.headers.host || "localhost"}`);
  try {
    await handleApi(req, res, url);
  } catch (error) {
    sendError(res, error);
  }
}
