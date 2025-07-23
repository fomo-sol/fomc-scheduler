import axios from "axios";
import dayjs from "dayjs";
import "dayjs/locale/en.js";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { filterSp500Stocks } from "../db/stock.js";

dayjs.extend(utc);
dayjs.extend(timezone);

import dotenv from "dotenv";

dotenv.config();

const FINNHUB_TOKEN = process.env.FINNHUB_TOKEN;

/**
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 * @returns {Promise<Array<{ symbol: string, date: string, hour: string }>>}
 */
export async function fetchEarningsCalendar(from, to) {
  const url = `https://finnhub.io/api/v1/calendar/earnings`;
  const params = {
    from,
    to,
    token: FINNHUB_TOKEN,
  };

  try {
    console.log(url, params);
    const res = await axios.get(url, { params });
    const earnings = res.data.earningsCalendar || [];

    const cleaned = earnings
      .filter((e) => e.symbol && e.date && e.hour) // 필수값 필터링
      .map((e) => ({
        symbol: e.symbol,
        date: e.date, // YYYY-MM-DD
        hour: e.hour.toLowerCase(), // "bmo" or "amc"
      }));

    console.log(`📈 실적 일정 ${cleaned.length}건 수집 완료 (${from}~${to})`);

    const sp500only = await filterSp500Stocks(cleaned);

    return sp500only;
  } catch (err) {
    console.error("❌ 실적 일정 fetch 실패:", err.message);
    return [];
  }
}
