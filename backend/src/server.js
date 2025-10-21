// server.js
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const QRCode = require("qrcode");
const cors = require("cors");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = process.env.PORT || 5000;

// Allow frontend
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json());

// Check env
if (!process.env.AWS_BUCKET_NAME || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_REGION) {
  console.error("❌ Missing AWS credentials or bucket info in .env");
  process.exit(1);
}

// AWS S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Multer in-memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Your domain (for generating URLs)
const SERVER_DOMAIN = process.env.SERVER_DOMAIN || `http://localhost:${PORT}`;

// Upload PDF to S3
app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const fileName = `${Date.now()}-${req.file.originalname}`;
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    await s3.send(new PutObjectCommand(params));

    const fileUrl = `${SERVER_DOMAIN}/download/${encodeURIComponent(fileName)}`;
    const qrCodeDataUrl = await QRCode.toDataURL(fileUrl);

    res.json({ fileUrl, qrCode: qrCodeDataUrl });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ error: "Upload to S3 failed" });
  }
});

// Proxy download route
app.get("/download/:fileName", async (req, res) => {
  try {
    const fileName = decodeURIComponent(req.params.fileName);

    // Generate a signed URL valid for 10 minutes
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
    });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 600 });

    // Redirect the client to the signed URL
    res.redirect(signedUrl);
  } catch (err) {
    console.error("Download Error:", err);
    res.status(500).json({ error: "Failed to fetch file from S3" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at ${SERVER_DOMAIN}`);
});