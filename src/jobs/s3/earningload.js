// load.js
import axios from "axios";
import path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../../../config/s3Config.js";

async function uploadBufferToS3(buffer, s3Key, mimeType) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: s3Key,
    Body: buffer,
    ContentType: mimeType,
  });

  const result = await s3.send(command);
  const url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
  return { Location: url, result };
}

async function handleEarningFileUpload(id, link, symbol, date, quarter, year) {
  try {
    // 파일 받아서
    const response = await axios.get(link, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.7",
        Referer: "https://www.sec.gov/",
      },
    });

    const buffer = Buffer.from(response.data);
    const contentType =
      response.headers["content-type"] || "application/octet-stream";
    const ext =
      path.extname(link).split("?")[0] ||
      (contentType.includes("pdf") ? ".pdf" : ".html"); // 타입 찾아주고
    //ext에 # 붙어있으면 뒤에 제거
    const ext_ = ext.includes("#") ? ext.split("#")[0] : ext;

    // 2. S3 key 설정 (예: earnings/{id}.pdf 또는 html)
    const s3Key = `earnings_symbol/${symbol}/${year}_Q${quarter}/${symbol}_Q${quarter}_en.html`;

    // 3. 업로드
    const { Location } = await uploadBufferToS3(buffer, s3Key, contentType);

    console.log(`✅ S3 업로드 성공: ${Location}`);
    return Location;
  } catch (err) {
    console.error(`❌ 파일 처리 실패:`, err);
    throw err;
  }
}

export { handleEarningFileUpload };
