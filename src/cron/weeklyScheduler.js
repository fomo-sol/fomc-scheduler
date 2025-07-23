import cron from "node-cron";
import { fetchEarningsCalendar } from "../jobs/fetchEarningsCalendar.js";
import { saveEarningsToDb } from "../db/stock.js";

export async function runWeeklyScheduler() {
  console.log("주간 실적 일정 수집 스케줄러");
  const earnings = await fetchEarningsCalendar();
  await saveEarningsToDb(earnings);
  console.log("주간 실적 일정 수집 완료");
}

cron.schedule("0 0 * * 0", async () => {
  console.log("📅 매주 일요일 자정에 실행");

  await runWeeklyScheduler();
});

(async () => {
  await runWeeklyScheduler();
})();
