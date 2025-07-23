// load.js
import axios from "axios";
import path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../../../config/s3Config.js";
import { load } from "cheerio"; // cheerio 불러오기

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

async function handleFomcFileUpload(id, link, type, date) {
  try {
    // 파일 받아서
    const response = await axios.get(link, { responseType: "arraybuffer" });

    const contentType =
      response.headers["content-type"] || "application/octet-stream";
    const ext =
      path.extname(link).split("?")[0] ||
      (contentType.includes("pdf") ? ".pdf" : ".html");

    let buffer;
    let actualContentType = contentType;

    if (contentType.includes("html") || ext === ".html") {
      // HTML 처리: <div id="content">...</div> 만 추출
      const rawHtml = response.data.toString("utf-8");
      const $ = load(rawHtml);
      const contentHtml = $("#content").html();

      if (!contentHtml) {
        throw new Error("div#content를 찾을 수 없습니다.");
      }

      buffer = Buffer.from(contentHtml, "utf-8");
      actualContentType = "text/html";
    } else {
      // PDF 등 다른 파일은 그대로 처리
      buffer = Buffer.from(response.data);
    }
    // 2. S3 key 설정 (예: fomc_files/{id}.pdf 또는 html)
    const s3Key = `fomc_files/${type}/${date}${ext}`;

    // 3. 업로드
    const { Location } = await uploadBufferToS3(buffer, s3Key, contentType);

    console.log(`✅ S3 업로드 성공: ${Location}`);
    return Location;
  } catch (err) {
    console.error(`❌ 파일 처리 실패:`, err);
    throw err;
  }
}

export { handleFomcFileUpload };
