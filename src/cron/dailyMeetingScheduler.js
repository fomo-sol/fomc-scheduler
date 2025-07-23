import cron from "node-cron";
import { runMeetingScheduler } from "./meetingScheduler.js";

// 0시 0분 ㄱㄱㄱ
cron.schedule("27 10 * * *", async () => {
  console.log("📅 FOMC 문서 확인 스케줄러 실행");
  await runMeetingScheduler();
});
