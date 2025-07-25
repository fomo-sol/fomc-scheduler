import cron from "node-cron";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import axios from "axios";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../../config/s3Config.js";

import { getEarningsForPreAlarm, getTodayEarnings } from "../db/stock.js";
import { runPollingJob } from "../jobs/runPollingJob.js";
import { pollingSet } from "../memory/pollingMemory.js";
import { getSymbolByStockId } from "../db/stock.js";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// 실적 발표 일정 조회 스케줄러 (미국 동부 0시 0분)
cron.schedule("00 16 * * *", async () => {
  console.log("📅 매일 오후 1시에 실행 (미국 동부 0시 0분)");

  // 1. D-1 알림 (내일 실적 발표)
  try {
    const d1Earnings = await getEarningsForPreAlarm();
    for (const earnings of d1Earnings) {
      const { stock_id, fin_release_date } = earnings;
      const symbol = earnings.symbol || earnings.stock_id;
      const statementDay = dayjs(fin_release_date).format("YYYY-MM-DD");
      await notifyEarningsPreAlarm(statementDay, stock_id, symbol);
    }
    console.log(`총 ${d1Earnings.length}건의 D-1 알림이 발송되었습니다.`);
  } catch (err) {
    console.error("D-1 알림 발송 실패:", err);
  }

  // 2. 오늘 실적 발표 pollingSet 등록

  try {
    const allEarnings = await getTodayEarnings();
    pollingSet.clear();
    let i = 0;
    for (const earnings of allEarnings) {
      if (!pollingSet.has(earnings.stock_id)) {
        pollingSet.add(earnings.stock_id);
        i++;
      }
    }
    console.log(`총 ${i}건의 실적 발표 일정이 pollingSet에 등록되었습니다.`);
  } catch (err) {
    console.error("오늘의 실적 발표 일정 조회 실패:", err);
  }

  // 3. polling 및 업로드+요약 알림 스케줄러 실행
  runEarningsScheduler();
});

// dayjs 확장
dayjs.extend(utc);
dayjs.extend(timezone);

// [필수] 하루 전(D-1) 개별 알림
async function notifyEarningsPreAlarm(date, stock_id, symbol) {
  console.log("notifyEarningsPreAlarm 호출됨", date, stock_id, symbol);
  const urls = ["http://15.165.199.80/api/notifications/earnings/prealarm"];
  for (const url of urls) {
    try {
      console.log("알림 테스트 파라미터", { date, stock_id, symbol });
      await axios.post(
          url,
          { date, stock_id, symbol },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
      );
      console.log(`${url} 실적 하루 전 알림 요청 성공`);
    } catch (err) {
      if (err.response) {
        console.error(
            `${url} 실적 하루 전 알림 요청 실패: [${err.response.status}] ${err.response.statusText}`
        );
      } else if (err.request) {
        console.error(
            `${url} 실적 하루 전 알림 요청 실패: No response from server`
        );
      } else {
        console.error(`${url} 실적 하루 전 알림 요청 실패:`, err.message);
      }
    }
  }
}

// [필수] 업로드+요약 알림 (S3에서 요약 prediction 읽어서 메시지 전송)
export async function notifyEarningsSummaryUpload(symbol, date) {
  console.log("notifyEarningsSummaryUpload 호출됨", symbol, date);

  const s3Key = `industry_analysis/${symbol}/${date}.json`;
  // S3 접속 URL 콘솔 출력 추가
  const s3Url = `https://${process.env.S3_BUCKET}.s3.ap-northeast-2.amazonaws.com/${s3Key}`;
  console.log(`[S3] 요약 JSON 접근 시도: ${s3Url}`);
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: s3Key,
    });
    const response = await s3.send(command);
    const streamToBuffer = (stream) => {
      return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
      });
    };
    const buffer = await streamToBuffer(response.Body);
    const bufferStr = buffer.toString("utf-8");
    // console.log("S3에서 읽은 원본:", bufferStr);
    const summary = JSON.parse(bufferStr);
    // console.log("파싱된 summary:", summary);
    const prediction = summary.prediction || "X";
    const msg = `[${symbol}] ${date}의 요약이 업로드되었습니다.\n\n요약 내용 => ${prediction}`;
    const urls = ["http://15.165.199.80:4000/api/notifications/earnings/summary"];
    for (const url of urls) {
      try {
        // console.log("axios.post 직전", { symbol, date, msg });
        await axios.post(
            url,
            { symbol, date, message: msg },
            {
              headers: {
                "Content-Type": "application/json",
              },
            }
        );
        console.log(`${url} 실적 요약+업로드 알림 요청 성공`);
      } catch (err) {
        if (err.response) {
          console.error(
              `${url} 실적 요약+업로드 알림 요청 실패: [${err.response.status}] ${err.response.statusText}`
          );
        } else if (err.request) {
          console.error(
              `${url} 실적 요약+업로드 알림 요청 실패: No response from server`
          );
        } else {
          console.error(`${url} 실적 요약+업로드 알림 요청 실패:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error(`S3에서 요약 JSON을 읽는 데 실패:`, err.message);
  }
}

// [필수] 실적 발표 polling 및 업로드+요약 알림
export function runEarningsScheduler() {
  console.log("[runEarningsScheduler] 실행됨");
  const intervals = [
    { label: "bmo", hours: [19, 20, 21, 22, 23] }, // BMO는 9시, 21시, 22시, 23시
    { label: "amc", hours: [5, 6, 7, 8] }, // AMC는 5시, 6시, 9시 요청을 보내는 것 AMC 일 경우, runPollingJob 함수에서 어제 날짜로 요청해야함 이 부분 넣어주기
  ];

  for (const { label, hours } of intervals) {
    for (const hour of hours) {
      for (let m = 0; m < 60; m += 1) {
        cron.schedule(`${m} ${hour} * * *`, async () => {
          console.log(
              `📅 [${label.toUpperCase()}] 스케줄러 실행 (${hour}:${m})`
          );
          // console.log(
          //   "[runEarningsScheduler] pollingSet:",
          //   Array.from(pollingSet)
          // );
          for (const e of pollingSet) {
            // e는 stock_id임
            // console.log(`[DEBUG] getSymbolByStockId에 전달되는 값:`, e);
            const symbol = await getSymbolByStockId(e); // DB에서 symbol로 변환
            // console.log(
            //   `[DEBUG] getSymbolByStockId 결과: stock_id=${e}, symbol=${symbol}`
            // );
            if (!symbol) {
              console.error(
                  `[runEarningsScheduler] symbol이 없습니다! stock_id=${e}`
              );
              continue; // 다음 루프로 넘어감
            }
            console.log(
                `[runEarningsScheduler] getSymbolByStockId 결과: stock_id=${e}, symbol=${symbol}`
            );
            const today = dayjs().format("YYYY-MM-DD");
            console.log(
                `[runEarningsScheduler] runPollingJob 호출: stock_id=${e}, label=${label}`
            );
            const result = await runPollingJob(e, label);
            console.log(
                `[runEarningsScheduler] runPollingJob 결과: stock_id=${e}, result=${result}`
            );
            if (result) {
              pollingSet.delete(e);
            }
            await delay(2000); // 10초 대기
          }
        });
      }
    }
  }
}

