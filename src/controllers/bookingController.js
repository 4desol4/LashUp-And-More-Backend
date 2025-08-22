import prisma from "../utils/prisma.js";
import nodemailer from "nodemailer";
import { BookingStatus } from "@prisma/client";

// Resilient transporter
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

// CREATE BOOKING
export const createBooking = async (req, res) => {
  try {
    const { service, date, time } = req.body;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!service || !date)
      return res.status(400).json({ message: "Service and date are required" });

    const bookingDate = time ? new Date(`${date}T${time}`) : new Date(date);
    if (isNaN(bookingDate.getTime()))
      return res.status(400).json({ message: "Invalid date format" });

    const existingBooking = await prisma.booking.findFirst({
      where: { service, date: bookingDate, status: { not: "CANCELLED" } },
    });
    if (existingBooking)
      return res
        .status(400)
        .json({ message: "This time slot is already booked" });

    const booking = await prisma.booking.create({
      data: { service, date: bookingDate, user: { connect: { id: userId } } },
      include: { user: true },
    });

    res.status(201).json({ message: "Booking created", booking });


    (async () => {
      try {
        const transporter = await createTransporter();
        await transporter.sendMail({
          from: `"LashUp And More" <${process.env.EMAIL_USER}>`,
          to: process.env.ADMIN_EMAIL,
          subject: "New Booking Received",
          html: `<p><b>${booking.user.name}</b> (${
            booking.user.email
          }) booked <b>${service}</b> on ${bookingDate.toUTCString()}.</p>`,
        });
        await transporter.sendMail({
          from: `"LashUp And More" <${process.env.EMAIL_USER}>`,
          to: booking.user.email,
          subject: "Booking Confirmation",
          html: `<p>Thank you for your booking, ${booking.user.name}!</p>
                 <p>You booked <b>${service}</b> on ${bookingDate.toUTCString()}.</p>`,
        });
      } catch (emailErr) {
        console.error("Email sending failed (booking):", emailErr.message);
      }
    })();
  } catch (err) {
    console.error("Booking creation error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET USER BOOKINGS
export const getUserBookings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const bookings = await prisma.booking.findMany({ where: { userId } });
    res.status(200).json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// CANCEL BOOKING
export const cancelBooking = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const result = await prisma.booking.updateMany({
      where: { id, userId, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    if (result.count === 0)
      return res.status(400).json({ message: "Cannot cancel this booking" });

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { user: true },
    });
    res.status(200).json({ message: "Booking cancelled", booking });

    (async () => {
      try {
        const transporter = await createTransporter();
        await transporter.sendMail({
          from: `"LashUp And More" <${process.env.EMAIL_USER}>`,
          to: process.env.ADMIN_EMAIL,
          subject: "Booking Cancelled by User",
          html: `<p>User <b>${booking.user.name}</b> (${
            booking.user.email
          }) cancelled their booking for <b>${
            booking.service
          }</b> on ${booking.date.toUTCString()}.</p>`,
        });
      } catch (emailErr) {
        console.error(
          "Email sending failed (admin notification):",
          emailErr.message
        );
      }
    })();
  } catch (err) {
    console.error("Booking cancellation error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL BOOKINGS (ADMIN)
export const getAllBookings = async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({ include: { user: true } });
    res.status(200).json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE BOOKING STATUS (ADMIN)
export const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    let { status } = req.body;

    if (!status) return res.status(400).json({ message: "Status is required" });
    status = status.trim().toUpperCase();
    if (!Object.values(BookingStatus).includes(status))
      return res.status(400).json({ message: "Invalid booking status" });

    const booking = await prisma.booking.update({
      where: { id },
      data: { status },
      include: { user: true },
    });

    res.status(200).json({ message: "Booking status updated", booking });

    (async () => {
      try {
        const transporter = await createTransporter();
        await transporter.sendMail({
          from: `"LashUp And More" <${process.env.EMAIL_USER}>`,
          to: booking.user.email,
          subject: "Booking Status Updated",
          html: `<p>Hi ${booking.user.name},</p>
                 <p>Your booking for <b>${
                   booking.service
                 }</b> on ${booking.date.toDateString()} is now <b>${status}</b>.</p>`,
        });
      } catch (emailErr) {
        console.error(
          "Email sending failed (status update):",
          emailErr.message
        );
      }
    })();
  } catch (err) {
    console.error("Booking status update error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
