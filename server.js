require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// MySQL Database Connection Pool
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "workshop_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Registration API Endpoint
app.post("/api/register", async (req, res) => {
  const { fullName, email, whatsappNumber, challenges } = req.body;

  if (!fullName || !email || !whatsappNumber) {
    return res.status(400).json({ success: false, message: "Please fill all required fields." });
  }

  try {
    const query = `
      INSERT INTO users (fullName, email, whatsappNumber, challenges) 
      VALUES (?, ?, ?, ?)
    `;
    await db.execute(query, [fullName, email, whatsappNumber, challenges || ""]);

    return res.status(201).json({
      success: true,
      message: "Registration successful!",
      redirectUrl: "/thank-you.html",
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "This email is already registered." });
    }
    console.error("Database error:", error);
    return res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));