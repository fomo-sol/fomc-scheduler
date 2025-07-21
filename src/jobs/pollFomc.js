import { fetchAndProcessFomcDoc } from "./fetchAndProcessFomc.js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const BASE_URLS = {
  statement:
    "https://www.federalreserve.gov/newsevents/pressreleases/monetary{date}a.htm",
  implementation_note:
    "https://www.federalreserve.gov/newsevents/pressreleases/monetary{date}a1.htm",
  transcript:
    "https://www.federalreserve.gov/mediacenter/files/FOMCpresconf{date}.pdf",
  minutes:
    "https://www.federalreserve.gov/monetarypolicy/fomcminutes{date}.htm",
};

// export async function startPollingForDoc(type, date) {
//   const maxAttempts = 10;
//   const interval = 30 * 1000; // 30초
//   let attempt = 0;

//   const targetTime = dayjs.tz(`${date} 14:00:00`, "America/New_York");
//   const now = dayjs().tz("America/New_York");

//   const delay = targetTime.diff(now);
//   if (delay > 0) {
//     console.log(
//       `📆 ${type} 문서 polling은 ${targetTime.format()}부터 시작됩니다.`
//     );
//     await new Promise((res) => setTimeout(res, delay));
//   }

//   const poll = async () => {
//     attempt++;
//     console.log(`🔁 [${type}] ${attempt}/${maxAttempts} - ${dayjs().format()}`);
//     try {
//       await fetchAndProcessFomcDoc({
//         type,
//         date,
//         baseUrl: BASE_URLS[type],
//       });
//       console.log(`✅ [${type}] fetch 성공!`);
//       return true;
//     } catch (err) {
//       console.log(`❌ [${type}] 시도 실패: ${err.message}`);
//       return false;
//     }
//   };

//   for (; attempt < maxAttempts; attempt++) {
//     const success = await poll();
//     if (success) break;
//     await new Promise((res) => setTimeout(res, interval));
//   }
// }

export async function startPollingForDoc(type, date) {
  const maxAttempts = 10;
  const interval = 30 * 1000; // 30초
  let attempt = 0;

  // date가 ISO 문자열이면 YYYY-MM-DD 형태로 변환
  const formattedDate = dayjs(date).format("YYYYMMDD");

  // polling 시작 시점을 뉴욕 시간 오후 2시로 설정
  const targetTime = dayjs.tz(
    `${dayjs(date).format("YYYY-MM-DD")} 14:00:00`,
    "America/New_York"
  );
  const now = dayjs().tz("America/New_York");

  const delay = targetTime.diff(now);
  /*
  if (delay > 0) {
    console.log(
      `📆 ${type} 문서 polling은 ${targetTime.format()}부터 시작됩니다.`
    );
    await new Promise((res) => setTimeout(res, delay));
  }
  */

  const poll = async () => {
    attempt++;
    console.log(`🔁 [${type}] ${attempt}/${maxAttempts} - ${dayjs().format()}`);
    try {
      await fetchAndProcessFomcDoc({
        type,
        date: formattedDate,
        baseUrl: BASE_URLS[type],
      });
      console.log(`✅ [${type}] fetch 성공!`);
      return true;
    } catch (err) {
      console.log(`❌ [${type}] 시도 실패: ${err.message}`);
      return false;
    }
  };

  for (; attempt < maxAttempts; attempt++) {
    const success = await poll();
    if (success) break;
    await new Promise((res) => setTimeout(res, interval));
  }
}
