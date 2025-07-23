import cron from "node-cron";

import { getTodayEarnings } from "../db/stock.js"; //짜야함
import { runPollingJob } from "../jobs/runPollingJob.js"; // 짜야함
import { pollingSet } from "../memory/pollingMemory.js";

cron.schedule("59 14 * * *", async () => {
  console.log("📅 매일 오후 1시에 실행"); // 미국 동부에선 0시 0분
  // 오늘 실적 일정 조회
  try {
    const allEarnings = await getTodayEarnings();
    pollingSet.clear();
    if (allEarnings.length > 0) {
      console.log("오늘의 실적 발표 일정:", allEarnings);
      let i = 0;
      for (const earnings of allEarnings) {
        if (!pollingSet.has(earnings.stock_id)) {
          pollingSet.add(earnings.stock_id);
          i++;
        } else {
          console.log(`이미 실행 중인 종목: ${earnings}`);
        }
      }
      console.log(`총 ${i}건의 실적 발표 일정이 등록되었습니다.`);
    }
  } catch (err) {
    console.error("오늘 실적 일정 조회 실패:", err.message);
  }
  runEarningsScheduler();
});

export function runEarningsScheduler() {
  const intervals = [
    { label: "bmo", hours: [14, 21, 22, 23] },
    { label: "amc", hours: [5, 6, 7] },
  ];

  for (const { label, hours } of intervals) {
    for (const hour of hours) {
      for (let m = 0; m < 60; m += 1) {
        cron.schedule(`${m} ${hour} * * *`, async () => {
          console.log(
            `📅 ${label.toUpperCase()} 실적 발표 일정 수집 스케줄러 실행 (${hour}:${m})`
          );
          for (const e of pollingSet) {
            console.log(`🔍 ${e} 종목에 대해 실적 발표 일정 수집 시작`, label);
            const result = await runPollingJob(e, label); // cik 불러와야되고
            if (result) {
              pollingSet.delete(e);
              console.log(`✅ ${e} 실적 발표 일정 수집 완료`);
            } else {
              console.log(`❌ ${e} 실적 발표 일정 수집 실패, 아직 안 올라옴!`);
            }
          }
        });
      }
    }
  }
}
