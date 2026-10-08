require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");
const Razorpay = require('razorpay');

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

// Initialize Razorpay instance with credentials
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,      // Your Key ID
  key_secret: process.env.RAZORPAY_KEY_SECRET // Your Key Secret
});


const crypto = require('crypto');

app.post('/api/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  // Validate presence of required params
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: 'Missing payment parameters.' });
  }

  // Generate expected HMAC SHA256 signature
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest('hex');

  if (expectedSignature === razorpay_signature) {
    try {
      // Payment verified -> Update database record
      const updateQuery = `
        UPDATE users 
        SET payment_status = 'paid', razorpay_payment_id = ? 
        WHERE razorpay_order_id = ?
      `;
      await db.execute(updateQuery, [razorpay_payment_id, razorpay_order_id]);

      return res.status(200).json({ 
        success: true, 
        message: 'Payment verified and recorded successfully.' 
      });
    } catch (error) {
      console.error('Database update error during verification:', error);
      return res.status(500).json({ success: false, message: 'Server error updating payment status.' });
    }
  } else {
    return res.status(400).json({ success: false, message: 'Invalid payment signature.' });
  }
});

// Express route creating dynamic payment link via Razorpay API
// app.post('/api/create-payment-link', async (req, res) => {
//   try {
//     const { fullName, email, whatsappNumber } = req.body;

//     const paymentLink = await razorpay.paymentLink.create({
//       amount: 9900, // ₹99 in paise
//       currency: "INR",
//       accept_partial: false,
//       description: "Two days Bhagavadh Gita",
//       customer: {
//         name: fullName,
//         email: email,
//         contact: whatsappNumber
//       },
//       notify: {
//         sms: true,
//         email: true
//       },
//       reminder_enable: true,
//       callback_url: "https://yourwebsite.com/thank-you",
//       callback_method: "get"
//     });

//     res.json({ success: true, url: paymentLink.short_url });
//   } catch (error) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// Registration API Endpoint: Registers user & generates Razorpay Order
app.post("/api/register", async (req, res) => {
  const { fullName, email, whatsappNumber, challenges } = req.body;

  // 1. Validate required fields
  if (!fullName || !email || !whatsappNumber) {
    return res.status(400).json({ 
      success: false, 
      message: "Please fill all required fields." 
    });
  }

  try {
    // 2. Insert user details into MySQL database
    const query = `
      INSERT INTO users (fullName, email, whatsappNumber, challenges) 
      VALUES (?, ?, ?, ?)
    `;
    await db.execute(query, [fullName, email, whatsappNumber, challenges || ""]);

    // 3. Define Razorpay order options (₹99 = 9900 paise)
    const options = {
      amount: 9900, 
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        fullName,
        email,
        whatsappNumber
      }
    };

    // 4. Generate order ID via Razorpay SDK
    const order = await razorpay.orders.create(options);

    // Store razorpay_order_id alongside the registered user
await db.execute(
  'UPDATE users SET razorpay_order_id = ? WHERE email = ?', 
  [order.id, email]
);

    // 5. Send order details and public key back to frontend
    return res.status(201).json({
      success: true,
      message: "Registration successful! Proceed to payment.",
      key_id: process.env.RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      name: "Two days Bhagavadh Gita",
      description: "Registration Fee",
      order_id: order.id
    });

  } catch (error) {
    // Handle duplicate registration emails gracefully
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ 
        success: false, 
        message: "This email is already registered." 
      });
    }

    console.error("Registration & Order Creation Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Server error during registration. Please try again." 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));