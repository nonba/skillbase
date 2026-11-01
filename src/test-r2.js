const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require("dotenv").config();

// S3Client を初期化
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

async function run() {
  const key = `test-diagnostics-${Date.now()}.txt`;
  const content = "R2 Diagnostic Test Connection Successful";
  
  console.log("R2 configuration:", {
    accountId: process.env.R2_ACCOUNT_ID ? "✓ SET" : "MISSING",
    bucketName: process.env.R2_BUCKET_NAME,
    publicDomain: process.env.R2_PUBLIC_DOMAIN
  });

  console.log("Attempting to upload file to R2:", key);
  try {
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || '',
      Key: key,
      Body: content,
      ContentType: "text/plain"
    });
    await s3Client.send(command);
    console.log("Upload successful!");

    // 公開用URLの構築
    let publicDomain = process.env.R2_PUBLIC_DOMAIN || '';
    if (publicDomain.startsWith('https://')) {
      publicDomain = publicDomain.replace('https://', '');
    } else if (publicDomain.startsWith('http://')) {
      publicDomain = publicDomain.replace('http://', '');
    }
    if (publicDomain.endsWith('/')) {
      publicDomain = publicDomain.slice(0, -1);
    }

    const publicUrl = publicDomain
      ? `https://${publicDomain}/${key}`
      : `https://${process.env.R2_BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

    console.log("Generated Public URL:", publicUrl);

    // URLにアクセスを試行
    console.log("Testing public accessibility via HTTP GET...");
    const res = await fetch(publicUrl);
    console.log("HTTP Response Status:", res.status, res.statusText);
    
    if (res.status === 200) {
      const text = await res.text();
      console.log("Success! File content matches:", text === content ? "YES" : "NO");
    } else {
      console.error(`Inaccessible! Error code: ${res.status}. R2 settings are blocking public access.`);
    }

  } catch (error) {
    console.error("R2 Diagnostic Error:", error);
  }
}

run();
