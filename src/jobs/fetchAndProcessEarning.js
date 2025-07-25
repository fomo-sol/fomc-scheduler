// import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import pool from "../../config/db.js";
import { handleEarningFileUpload } from "./s3/earningload.js";
import { summarizeAndUploadEarningFile } from "./openai/summarize_analyze_earning.js";
import { notifyEarningsSummaryUpload } from "../cron/earningsScheduler.js";
import { runTranslatePipeline } from "./translate/translatePipeline.js";
import fs from "fs";
import path from "path";
import {
  getReleaseIdByStockIdAndDate,
  getStockId,
  insertReleaseContentEn,
  updateStockFinances,
} from "../db/stock.js";

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

export async function fetchAndProcessEarningDoc({
  symbol,
  date,
  link,
  referer_link,
}) {
  const formattedDate = date.replace(/-/g, "");
  const url = link;
  const id = uuidv4();

  console.log(`[📄 ${symbol}] ${url} 문서 요청 시작`);
  const headers = {
    // "User-Agent": getRandomUserAgent(),
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",

    // Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.5",
    Connection: "keep-alive",
    // Referer: referer_link,
    // "From": "kmkkkp@ajou.ac.kr", // ← ❌ 이건 일단 빼보세요. 필요 시만 추가
  };

  const res = await fetch(url, {
    headers: headers,
  });

  if (!res.ok) {
    console.log(`⚠️ [${symbol}] HTTP 오류: ${res.status}`);

    console.log(`❌ [${symbol}] 문서 요청 실패: ${res.statusText}`);

    return false;
  }

  const html = await res.text();

  // if (html.includes("Page Not Found") || html.includes("404")) {
  //   console.log(`⚠️ [${symbol}] 문서 아직 안 올라옴`);
  //   fs.writeFileSync(
  //     `./data/specificerrors/${symbol}-${formattedDate}.html`,
  //     html,
  //     "utf-8"
  //   );
  //   return false;
  // }

  // if (!html.includes("<html")) {
  //   console.log(`⚠️ [${symbol}] HTML 문서가 아님`);
  //   return false;
  // }

  const conn = await pool.getConnection();
  await conn.query(
    `INSERT INTO earning_save (id, html_link, symbol) VALUES (?, ?, ?)`,
    [id, url, symbol]
  );
  conn.release();

  console.log(`✅ [${symbol}] DB 저장 완료`);

  // symbol date에 해당하는 상회치 db에 저장, fetch 해서 update db
  const FINNHUB_TOKEN = process.env.FINNHUB_TOKEN;
  let needData;
  try {
    const stockId = await getStockId(symbol);
    if (!stockId) {
      console.error(`❌ [${symbol}] 해당 종목의 ID를 찾을 수 없습니다.`);
      return false;
    }
    console.log("종목 뽑기", stockId, date, symbol);

    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${date}&to=${date}&symbol=${symbol}&token=${FINNHUB_TOKEN}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error(`❌ [${symbol}] Finnhub API 요청 실패: ${response.status}`);
      return false;
    }
    const data = await response.json();
    needData = await data.earningsCalendar?.[0];
    await updateStockFinances(
      stockId,
      needData?.date,
      needData?.epsActual,
      needData?.revenueActual
    );
  } catch (error) {
    console.error(
      `❌ [${symbol}] Finnhub API 요청 중 오류 발생: ${error.message}`
    );
    return false;
  }

  // 여기서 Quarter 도 받아와 needData.quarter 에 있음,
  const quarter = needData?.quarter;
  const year = needData?.year;
  const stockId = await getStockId(symbol);
  const finance_release_id = await getReleaseIdByStockIdAndDate(stockId, date);

  const aws_link = await handleEarningFileUpload(
    id,
    url,
    symbol,
    date,
    quarter,
    year
  ); // S3 업로드 (html 저장)

  await insertReleaseContentEn(id, finance_release_id, aws_link);

  // return 값이 Location 이므로, 이를 maria db에 저장
  await summarizeAndUploadEarningFile(
    id,
    `earnings_symbol/${symbol}/${year}_Q${quarter}/${symbol}_Q${quarter}_en.html`,
    symbol,
    date,
    quarter,
    year,
    finance_release_id
  );

  console.log(`🎉 [${symbol}] S3 업로드 및 OpenAI 분석 완료`);

  // S3 업로드 및 industry_analysis 업로드가 끝난 후 알림 전송
  await notifyEarningsSummaryUpload(symbol, date);

  // 번역 PipeLine 실행 (일단 local의 data/raw 안에 넣어두고 하는데 나중에 s3에서 받아오는 거 되면 삭제하기)
  const localPath = `./data/raw/${symbol}-${formattedDate}.html`;
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, html, "utf-8");

  // 번역 파이프라인 수행
  try {
    await runTranslatePipeline(symbol, date, quarter, year, finance_release_id); // DeepL 번역 & S3 업로드 포함
    console.log(`🎉 [${symbol}] 번역 파이프라인 완료`);
  } catch (e) {
    console.error(`❌ [${symbol}] 번역 파이프라인 실패:`, e.message);
  }

  return true;
}
