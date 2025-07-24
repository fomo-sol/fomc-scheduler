import pool from "../../config/stockdb.js";
import axios from "axios";
import { format, subDays } from "date-fns";
import { fetchAndProcessEarningDoc } from "./fetchAndProcessEarning.js";
import * as cheerio from "cheerio";

/**
 * @param {string} stock_id
 * @param {'bmo' | 'amc'} label
 * @returns {Promise<boolean>}
 */

export async function runPollingJob(stock_id, label) {
  try {
    console.log(
      `Running polling job for stock_id: ${stock_id}, label: ${label}`
    );
    const [stockRow] = await pool.query(
      `select s.stock_cik, s.stock_symbol from stocks s join stock_finances f on s.id = f.stock_id where s.id=? and f.fin_hour=? and f.fin_period_date is not null`,
      [stock_id, label]
    );
    if (!stockRow || !stockRow.stock_cik) {
      console.log(`No CIK found for stock_id in ${label}: ${stock_id}`);
      return false;
    }

    const cik = stockRow.stock_cik.toString().padStart(10, "0");

    // Fetch the earnings report from the SEC
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
        Accept: "application/json",
      },
    });

    const filings = data?.filings?.recent;

    if (!filings) {
      console.log(`No filings found for CIK: ${cik}`);
      return false;
    }

    // 현재 시간 (한국 시간)
    const now = new Date();
    const currentHour = now.getHours();

    const isBefore2pm = currentHour < 20;

    // 14시 전이면 하루 전, 아니면 오늘
    const today = isBefore2pm
      ? format(subDays(now, 1), "yyyy-MM-dd")
      : format(now, "yyyy-MM-dd");

    // filings 배열에서 today와 일치하는 인덱스 찾기

    const todayFilings = filings.filingDate.findIndex((date) => date === today);
    const filingDates = filings.filingDate;
    const accessionNumbers = filings.accessionNumber;
    const form = filings.form;
    const primaryDocument = filings.primaryDocument;
    // console.log(form);

    const matchingIndexes = filingDates
      .map((date, index) => {
        return date === today ? index : -1;
      })
      .filter((index) => index !== -1);
    console.log(`Matching indexes for today (${today}): ${matchingIndexes}`);
    let accessionNumber = null;
    let primaryDocLink = null;
    for (const index of matchingIndexes) {
      if (form[index] === "8-K") {
        accessionNumber = accessionNumbers[index];
        primaryDocLink = primaryDocument[index];
        break;
      }
    }

    if (todayFilings === -1) {
      console.log(`Filings Not Yet for today (${today}) for CIK: ${cik}`);
      return false;
    }

    // const accessionNumber = filings.accessionNumber[todayFilings];
    if (!accessionNumber) {
      console.log(
        `No accession number found for today (${today}) for CIK: ${cik}`
      );
      return false;
    }
    console.log(
      `Found filing for CIK: ${cik} on ${today} with accession number: ${accessionNumber}`
    );

    // 저장, 실행 로직 작성 ㄱㄱ

    const send_link = await makelink(
      cik,
      accessionNumber,
      primaryDocLink,
      stockRow.stock_symbol,
      today
    );

    const real_link = await makeRealLink(cik, accessionNumber, send_link);

    const res = await fetchAndProcessEarningDoc({
      symbol: stockRow.stock_symbol,
      date: today,
      link: real_link,
      referer_link: send_link,
    });

    return res;
  } catch (err) {
    console.error("Error occurred while running polling job:", err);
    return false;
  }
}

async function makelink(cik, accessionNumber, primaryDocLink, symbol, date) {
  // symbol 없어도 되긴함
  // 여기서 href 두번째꺼로 바꿔오는거
  const formattedCik = cik.toString().padStart(10, "0");
  const formattedAccessionNumber = accessionNumber.replace(/-/g, "");
  const formattedSymbol = symbol.toLowerCase();
  const formattedDate = format(date, "yyyyMMdd");
  return `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccessionNumber}/${primaryDocLink}`;
}

async function makeRealLink(cik, accessionNumber, madelink) {
  const formattedCik = cik.toString().padStart(10, "0");
  const formattedAccessionNumber = accessionNumber.replace(/-/g, "");

  // madelink 로 가서 두번째 href 값을 가져와야함
  const response = await axios.get(madelink, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
    },
  });
  const html = response.data;

  const $ = cheerio.load(html);

  // 모든 a 태그의 href를 모은 배열
  const hrefs = $("a")
    .map((_, el) => $(el).attr("href"))
    .get();

  const firstHref = hrefs[0];

  return `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${formattedAccessionNumber}/${firstHref}`;
}
