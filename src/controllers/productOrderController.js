import prisma from "../utils/prisma.js";
import nodemailer from "nodemailer";
import { ProductOrderStatus } from "@prisma/client";

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

// CREATE ORDER
export const createOrder = async (req, res) => {
  try {
    let { productId, quantity } = req.body;
    const userId = req.user.userId;

    if (!productId || !quantity)
      return res
        .status(400)
        .json({ message: "Product ID and quantity are required" });

    productId = productId.trim();

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) return res.status(404).json({ message: "Product not found" });

    const order = await prisma.productOrder.create({
      data: {
        quantity,
        user: { connect: { id: userId } },
        product: { connect: { id: productId } },
        status: "PENDING",
      },
      include: { product: true, user: true },
    });

    res.status(201).json({ message: "Order created", order });

    (async () => {
      try {
        const transporter = await createTransporter();

        await transporter.sendMail({
          from: `"LashUp And Mores" <${process.env.EMAIL_USER}>`,
          to: process.env.ADMIN_EMAIL,
          subject: "New Product Order Received",
          html: `<p><b>${order.user.name}</b> (${order.user.email}) ordered <b>${quantity}</b> × <b>${order.product.name}</b>.</p>`,
        });

        await transporter.sendMail({
          from: `"LashUp And More" <${process.env.EMAIL_USER}>`,
          to: order.user.email,
          subject: "Order Confirmation",
          html: `<h3>Thank you for your order, ${order.user.name}!</h3>
                 <p>You have successfully ordered <b>${quantity}</b> × <b>${order.product.name}</b>.</p>
                 <p>We'll notify you once your order is processed and shipped.</p>
                 <br/><p>— The LashUp And More Team</p>`,
        });
      } catch (emailErr) {
        console.error("Email sending failed (order):", emailErr.message);
      }
    })();
  } catch (err) {
    console.error("Order creation error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// CANCEL ORDER (USER)
export const cancelOrder = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const order = await prisma.productOrder.findUnique({
      where: { id },
    });

    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.userId !== userId)
      return res.status(403).json({ message: "Unauthorized" });
    if (["SHIPPED", "DELIVERED", "CANCELLED"].includes(order.status))
      return res
        .status(400)
        .json({ message: "This order cannot be cancelled" });

    
    const cancelledOrder = await prisma.productOrder.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledBy: "USER", 
      },
      include: { product: true, user: true },
    });


    (async () => {
      try {
        const transporter = await createTransporter();
        await transporter.sendMail({
          from: `"LashUp And More" <${process.env.EMAIL_USER}>`,
          to: cancelledOrder.user.email,
          subject: "Order Cancelled",
          html: `<p>Hi ${cancelledOrder.user.name},</p>
                 <p>Your order for <b>${cancelledOrder.quantity} × ${cancelledOrder.product.name}</b> has been cancelled successfully.</p>`,
        });
      } catch (emailErr) {
        console.error("Email sending failed (cancel order):", emailErr.message);
      }
    })();

    res
      .status(200)
      .json({ message: "Order cancelled successfully", order: cancelledOrder });
  } catch (err) {
    console.error("Cancel order error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE ORDER STATUS (ADMIN)
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    let { status } = req.body;

    if (!status) return res.status(400).json({ message: "Status is required" });
    status = status.trim().toUpperCase();
    if (!Object.values(ProductOrderStatus).includes(status))
      return res.status(400).json({ message: "Invalid order status" });

   
    const existingOrder = await prisma.productOrder.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

   
    if (existingOrder.cancelledBy === "USER") {
      return res.status(400).json({
        message: "Cannot modify orders that were cancelled by the user",
      });
    }

    const updateData = { status };

    if (status === "CANCELLED") {
      updateData.cancelledBy = "ADMIN";
    }
   
    else if (
      existingOrder.status === "CANCELLED" &&
      existingOrder.cancelledBy === "ADMIN"
    ) {
      updateData.cancelledBy = null;
    }

    const order = await prisma.productOrder.update({
      where: { id },
      data: updateData,
      include: { user: true, product: true },
    });

    res.status(200).json({ message: "Order status updated", order });

    (async () => {
      try {
        const transporter = await createTransporter();
        await transporter.sendMail({
          from: `"LashUp And More" <${process.env.EMAIL_USER}>`,
          to: order.user.email,
          subject: "Order Status Updated",
          html: `<p>Hi ${order.user.name},</p>
                 <p>Your order for ${order.quantity} × <b>${order.product.name}</b> is now <b>${status}</b>.</p>`,
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
