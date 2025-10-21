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

app.use(cors({
  origin: "http://localhost:5174", // frontend origin
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json());

// 🧠 Validate env vars
if (!process.env.AWS_BUCKET_NAME) {
  console.error("❌ Missing AWS_BUCKET_NAME in .env");
  process.exit(1);
}

// ⚙️ AWS S3 configuration (v3)
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ⚙️ Multer to store in memory before upload
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 📤 Upload PDF to AWS S3
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

    // Upload to S3
    const command = new PutObjectCommand(params);
    await s3.send(command);

    // Generate proxy download URL (your domain + /download)
    const fileUrl = `${process.env.SERVER_DOMAIN}/download/${fileName}`;

    // Generate QR code for proxy URL
    const qrCodeDataUrl = await QRCode.toDataURL(fileUrl);

    res.json({ fileUrl, qrCode: qrCodeDataUrl });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ error: "Upload to S3 failed" });
  }
});

// 📥 Proxy download route (fetches from S3)
app.get("/download/:fileName", async (req, res) => {
  try {
    const fileName = req.params.fileName;

    // Create a short-lived signed URL (10 min)
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: fileName,
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 600 });
    res.redirect(signedUrl);
  } catch (err) {
    console.error("Download Error:", err);
    res.status(500).json({ error: "Failed to fetch file from S3" });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Server running at ${process.env.SERVER_DOMAIN || "http://localhost:" + PORT}`)
);
