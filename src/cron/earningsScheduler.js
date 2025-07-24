import cron from "node-cron";

import { getTodayEarnings } from "../db/stock.js"; //짜야함
import { runPollingJob } from "../jobs/runPollingJob.js"; // 짜야함
import { pollingSet } from "../memory/pollingMemory.js";


cron.schedule("28 9 * * *", async () => {
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
<<<<<<< HEAD
    { label: "bmo", hours: [9, 21, 22, 23] }, // BMO는 9시, 21시, 22시, 23시
    { label: "amc", hours: [5, 6, 9] }, // AMC는 5시, 6시, 9시 요청을 보내는 것 AMC 일 경우, runPollingJob 함수에서 어제 날짜로 요청해야함 이 부분 넣어주기
=======
    { label: "bmo", hours: [17, 21, 22, 23, 8, 9] },
    { label: "amc", hours: [5, 6, 7, 8, 9] },
>>>>>>> 769f23446a44d6e177a804c745e883795fd6915a
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
