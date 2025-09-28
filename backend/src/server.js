const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const cors = require("cors");

const app = express();

// Environment variables
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://eserv-odisha.web.app";

// Middleware
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// Create uploads folder if not exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Upload PDF + generate QR code
app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    // Detect backend URL dynamically
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const BACKEND_URL = `${protocol}://${host}`;

    const fileUrl = `${BACKEND_URL}/download/${req.file.filename}`;
    const qrCodeDataUrl = await QRCode.toDataURL(fileUrl);

    res.json({ fileUrl, qrCode: qrCodeDataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Download route (forces download)
app.get("/download/:filename", (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found");

  res.download(filePath, req.params.filename, (err) => {
    if (err) {
      console.error(err);
      res.status(500).send("Download failed");
    }
  });
});

// Start server
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
