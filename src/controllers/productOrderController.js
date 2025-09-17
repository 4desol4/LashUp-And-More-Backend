import prisma from "../utils/prisma.js";
import nodemailer from "nodemailer";
import { ProductOrderStatus, PaymentStatus } from "@prisma/client";
import axios from "axios";

const createTransporter = async () => {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  const configs = [
    {
      host: process.env.EMAIL_HOST,
      port: 465,
      secure: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    },
    {
      host: process.env.EMAIL_HOST,
      port: 587,
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { rejectUnauthorized: false },
    },
  ];

  for (const config of configs) {
    const transporter = nodemailer.createTransport(config);
    try {
      await transporter.verify();
      console.log(`SMTP connected on port ${config.port}`);
      return transporter;
    } catch (err) {
      console.warn(`Failed to connect on port ${config.port}:`, err.message);
    }
  }
  throw new Error("All SMTP connection attempts failed");
};

// INITIALIZE PAYMENT
export const initializePayment = async (req, res) => {
  try {
    const { items, shippingInfo } = req.body;
    const userId = req.user.userId;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Items are required" });
    }

    if (!shippingInfo) {
      return res
        .status(400)
        .json({ message: "Shipping information is required" });
    }

    // Validate shipping info
    const requiredFields = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "address",
      "city",
      "state",
    ];
    for (const field of requiredFields) {
      if (!shippingInfo[field]) {
        return res
          .status(400)
          .json({ message: `${field} is required in shipping information` });
      }
    }

    // Calculate total amount
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        return res
          .status(404)
          .json({ message: `Product ${item.productId} not found` });
      }

      const itemTotal = product.price * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price: product.price,
        product: product,
      });
    }

    // Add shipping fee (you can make this dynamic based on location)
    const shippingFee = 2000; // ₦20 shipping fee
    totalAmount += shippingFee;

    // Initialize Paystack payment
    const paystackData = {
      email: shippingInfo.email,
      amount: Math.round(totalAmount * 100), // Paystack expects amount in kobo
      reference: `order_${Date.now()}_${userId}`,
      callback_url: `${process.env.FRONTEND_URL}/payment/success`,
      metadata: {
        userId,
        orderItems: JSON.stringify(
          orderItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.price,
          }))
        ),
        shippingInfo: JSON.stringify(shippingInfo),
        shippingFee,
      },
    };

    const paystackResponse = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      paystackData,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (paystackResponse.data.status) {
      // Create pending orders in database (PENDING status until payment is verified)
      const orders = [];
      for (const item of orderItems) {
        const order = await prisma.productOrder.create({
          data: {
            userId,
            productId: item.productId,
            quantity: item.quantity,
            totalAmount: item.price * item.quantity,
            paymentReference: paystackData.reference,
            paymentStatus: "PENDING",
            status: "PENDING", // Will be changed to CONFIRMED after payment verification
            shippingInfo: shippingInfo,
          },
          include: { product: true, user: true },
        });
        orders.push(order);
      }

      res.status(200).json({
        message: "Payment initialized",
        payment_url: paystackResponse.data.data.authorization_url,
        reference: paystackData.reference,
        orders,
      });
    } else {
      throw new Error("Failed to initialize payment");
    }
  } catch (err) {
    console.error("Payment initialization error:", err);
    const message =
      err.response?.data?.message || "Failed to initialize payment";
    res.status(500).json({ message });
  }
};

// VERIFY PAYMENT
export const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ message: "Payment reference is required" });
    }

    // Verify payment with Paystack
    const paystackResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const paymentData = paystackResponse.data.data;

    if (paymentData.status === "success") {
      // Update orders in database - Change to CONFIRMED after successful payment
      await prisma.productOrder.updateMany({
        where: { paymentReference: reference },
        data: {
          paymentStatus: "SUCCESSFUL",
          status: "CONFIRMED", // This is where it becomes confirmed - payment verified
        },
      });

      // Get updated orders with relations
      const updatedOrders = await prisma.productOrder.findMany({
        where: { paymentReference: reference },
        include: { product: true, user: true },
      });

      res.status(200).json({
        message: "Payment verified successfully",
        orders: updatedOrders,
        paymentData,
      });

      // Send confirmation emails
      (async () => {
        try {
          const transporter = await createTransporter();
          const user = updatedOrders[0]?.user;

          if (user) {
            const orderList = updatedOrders
              .map(
                (order) =>
                  `${order.quantity}x ${order.product.name} - ₦${(
                    order.product.price * order.quantity
                  ).toLocaleString()}`
              )
              .join("<br>");

            await transporter.sendMail({
              from: `"LashUpAndMore" <${process.env.EMAIL_USER}>`,
              to: user.email,
              subject: "Order Confirmed - Payment Successful",
              html: `
                <h3>Thank you for your order, ${user.name}!</h3>
                <p>Your payment has been confirmed and your order is being processed.</p>
                <p><strong>Order Reference:</strong> ${reference}</p>
                <p><strong>Items Ordered:</strong></p>
                <p>${orderList}</p>
                <p><strong>Total Amount:</strong> ₦${(
                  paymentData.amount / 100
                ).toLocaleString()}</p>
                <p>We'll notify you when your order is shipped.</p>
              `,
            });

            await transporter.sendMail({
              from: `"LashUpAndMore" <${process.env.EMAIL_USER}>`,
              to: process.env.ADMIN_EMAIL,
              subject: "New Order - Payment Confirmed",
              html: `
                <h3>New Order Received</h3>
                <p><strong>Customer:</strong> ${user.name} (${user.email})</p>
                <p><strong>Reference:</strong> ${reference}</p>
                <p><strong>Items:</strong></p>
                <p>${orderList}</p>
                <p><strong>Total Amount:</strong> ₦${(
                  paymentData.amount / 100
                ).toLocaleString()}</p>
                <p><strong>Status:</strong> CONFIRMED - Ready to process</p>
              `,
            });
          }
        } catch (emailErr) {
          console.error(
            "Email sending failed (order confirmation):",
            emailErr.message
          );
        }
      })();
    } else {
      // Payment failed - mark orders as cancelled
      await prisma.productOrder.updateMany({
        where: { paymentReference: reference },
        data: {
          paymentStatus: "FAILED",
          status: "CANCELLED",
        },
      });

      res.status(400).json({
        message: "Payment verification failed",
        paymentData,
      });
    }
  } catch (err) {
    console.error("Payment verification error:", err);
    const message = err.response?.data?.message || "Failed to verify payment";
    res.status(500).json({ message });
  }
};

// UPDATE ORDER STATUS (ADMIN) - Only for CONFIRMED orders (paid orders)
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    let { status } = req.body;

    if (!status) return res.status(400).json({ message: "Status is required" });
    status = status.trim().toUpperCase();

    // Only allow these statuses for admin to change (after payment is confirmed)
    const allowedStatuses = ["CONFIRMED", "SHIPPED", "DELIVERED"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message:
          "Invalid status. Admin can only set CONFIRMED, SHIPPED, or DELIVERED",
      });
    }

    const existingOrder = await prisma.productOrder.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Prevent updating orders that haven't been paid for
    if (existingOrder.paymentStatus !== "SUCCESSFUL") {
      return res.status(400).json({
        message: "Cannot update status of unpaid orders",
      });
    }

    // Prevent updating cancelled orders
    if (existingOrder.status === "CANCELLED") {
      return res.status(400).json({
        message: "Cannot update cancelled orders",
      });
    }

    const order = await prisma.productOrder.update({
      where: { id },
      data: { status },
      include: { user: true, product: true },
    });

    res.status(200).json({ message: "Order status updated", order });

    // Send notification email based on status
    (async () => {
      try {
        const transporter = await createTransporter();
        let emailSubject = "Order Status Updated";
        let emailContent = "";

        switch (status) {
          case "CONFIRMED":
            emailSubject = "Order Confirmed - Being Prepared";
            emailContent = `
              <p>Hi ${order.user.name},</p>
              <p>Your order for <b>${order.quantity} × ${order.product.name}</b> has been confirmed and is being prepared.</p>
              <p>We'll notify you once it's shipped.</p>
            `;
            break;
          case "SHIPPED":
            emailSubject = "Order Shipped - On The Way";
            emailContent = `
              <p>Hi ${order.user.name},</p>
              <p>Great news! Your order for <b>${order.quantity} × ${order.product.name}</b> has been shipped.</p>
              <p>It's on its way to you and should arrive within 2-5 business days.</p>
            `;
            break;
          case "DELIVERED":
            emailSubject = "Order Delivered - Thank You!";
            emailContent = `
              <p>Hi ${order.user.name},</p>
              <p>Your order for <b>${order.quantity} × ${order.product.name}</b> has been delivered.</p>
              <p>Thank you for choosing LashUpAndMore! We hope you love your products.</p>
            `;
            break;
        }

        await transporter.sendMail({
          from: `"LashUpAndMore" <${process.env.EMAIL_USER}>`,
          to: order.user.email,
          subject: emailSubject,
          html: emailContent,
        });
      } catch (emailErr) {
        console.error("Email sending failed (order status):", emailErr.message);
      }
    })();
  } catch (err) {
    console.error("Order update error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET USER ORDERS
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.userId;
    const orders = await prisma.productOrder.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL ORDERS (ADMIN)
export const getAllOrders = async (req, res) => {
  try {
    const orders = await prisma.productOrder.findMany({
      include: { user: true, product: true },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
