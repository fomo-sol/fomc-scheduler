import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import pool from "../../config/db.js";
import { handleEarningFileUpload } from "./s3/earningload.js";
import { summarizeAndUploadEarningFile } from "./openai/summarize_analyze_earning.js";
import { runTranslatePipeline } from "./translate/translatePipeline.js";
import fs from "fs";
import path from "path";

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

export async function fetchAndProcessEarningDoc({ symbol, date, link }) {
  const formattedDate = date.replace(/-/g, "");
  const url = link;
  const id = uuidv4();

  console.log(`[📄 ${symbol}] ${url} 문서 요청 시작`);

  const res = await fetch(url, {
    headers: {
      "User-Agent": getRandomUserAgent(),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      Connection: "keep-alive",
      Referer: "https://www.sec.gov/",
      // "From": "kmkkkp@ajou.ac.kr", // ← ❌ 이건 일단 빼보세요. 필요 시만 추가
    },
  });

  if (!res.ok) {
    console.log(`⚠️ [${symbol}] HTTP 오류: ${res.status}`);
    return false;
  }

  const html = await res.text();

  if (html.includes("Page Not Found") || html.includes("404")) {
    console.log(`⚠️ [${symbol}] 문서 아직 안 올라옴`);
    return false;
  }

  if (!html.includes("<html")) {
    console.log(`⚠️ [${symbol}] HTML 문서가 아님`);
    return false;
  }

  const conn = await pool.getConnection();
  await conn.query(
    `INSERT INTO earning_save (id, html_link, symbol) VALUES (?, ?, ?)`,
    [id, url, symbol]
  );
  conn.release();

  console.log(`✅ [${symbol}] DB 저장 완료`);

  await handleEarningFileUpload(id, url, symbol, date); // S3 업로드 (html 저장)
  await summarizeAndUploadEarningFile(
    id,
    `earnings/${symbol}/${date}.htm`,
    symbol,
    date
  );

  console.log(`🎉 [${symbol}] S3 업로드 및 OpenAI 분석 완료`);

  // 번역 PipeLine 실행 (일단 local의 data/raw 안에 넣어두고 하는데 나중에 s3에서 받아오는 거 되면 삭제하기)
  const localPath = `./data/raw/${symbol}-${formattedDate}.html`;
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, html, "utf-8");

  // 번역 파이프라인 수행
  try {
    await runTranslatePipeline(symbol, date); // DeepL 번역 & S3 업로드 포함
    console.log(`🎉 [${symbol}] 번역 파이프라인 완료`);
  } catch (e) {
    console.error(`❌ [${symbol}] 번역 파이프라인 실패:`, e.message);
  }

  return true;
}
