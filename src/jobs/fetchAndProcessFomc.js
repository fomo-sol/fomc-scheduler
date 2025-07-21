import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import pool from "../../config/db.js";
import { handleFomcFileUpload } from "./s3/load.js";
import { summarizeAndUploadFomcFile } from "./openai/summarize_analyze.js";

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
];

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

export async function fetchAndProcessFomcDoc({ type, date, baseUrl }) {
  const formattedDate = date.replace(/-/g, "");
  const url = baseUrl.replace("{date}", formattedDate); // ex. https://.../{date}a.htm
  const id = uuidv4();

  console.log(`[📄 ${type}] ${url} 문서 요청 시작`);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      console.log(`⚠️ [${type}] HTTP 오류: ${res.status}`);
      return false;
    }

    const html = await res.text();

    if (html.includes("Page Not Found") || html.includes("404")) {
      console.log(`⚠️ [${type}] 문서 아직 안 올라옴`);
      return false;
    }

    if (!html.includes("<html")) {
      console.log(`⚠️ [${type}] HTML 문서가 아님`);
      return false;
    }

    const conn = await pool.getConnection();
    await conn.query(
      `INSERT INTO fomc_save (id, html_link, type) VALUES (?, ?, ?)`,
      [id, url, type]
    );
    conn.release();

    console.log(`✅ [${type}] DB 저장 완료`);

    await handleFomcFileUpload(id, url, type, date); // S3 업로드 (html 저장)
    await summarizeAndUploadFomcFile(
      id,
      `fomc_files/${type}/${date}.htm`,
      type,
      date
    );

    console.log(`🎉 [${type}] S3 업로드 및 OpenAI 분석 완료`);
    return true;
  } catch (err) {
    console.error(`❌ [${type}] 요청 실패:`, err.message);
    return false;
  }
}
