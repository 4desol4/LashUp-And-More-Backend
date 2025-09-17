import prisma from "../utils/prisma.js";
import nodemailer from "nodemailer";
import { BookingStatus } from "@prisma/client";

const createTransporter = async () => {
  if (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test"
  ) {
    return nodemailer.createTransporter({ jsonTransport: true });
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
    const transporter = nodemailer.createTransporter(config);
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
    const { serviceId, date, time, notes } = req.body;
    const userId = req.user.userId;

    if (!serviceId || !date || !time) {
      return res.status(400).json({
        message: "Service ID, date, and time are required",
      });
    }

    // Check if service exists
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    // Combine date and time
    const bookingDateTime = new Date(`${date}T${time}`);

    // Check if the booking time is in the future
    if (bookingDateTime <= new Date()) {
      return res.status(400).json({
        message: "Booking must be scheduled for a future date and time",
      });
    }

    // Check for existing booking at the same time
    const existingBooking = await prisma.booking.findFirst({
      where: {
        date: bookingDateTime,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    });

    if (existingBooking) {
      return res.status(400).json({
        message: "This time slot is already booked",
      });
    }

    const booking = await prisma.booking.create({
      data: {
        serviceId,
        date: bookingDateTime,
        notes,
        user: { connect: { id: userId } },
        status: "PENDING",
      },
      include: {
        service: true,
        user: true,
      },
    });

    res.status(201).json({ message: "Booking created", booking });

    // Send emails asynchronously
    (async () => {
      try {
        const transporter = await createTransporter();

        await transporter.sendMail({
          from: `"LashUpAndMore" <${process.env.EMAIL_USER}>`,
          to: process.env.ADMIN_EMAIL,
          subject: "New Booking Received",
          html: `
            <h3>New Booking Request</h3>
            <p><strong>Client:</strong> ${booking.user.name} (${
            booking.user.email
          })</p>
            <p><strong>Service:</strong> ${booking.service.name}</p>
            <p><strong>Date:</strong> ${bookingDateTime.toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${bookingDateTime.toLocaleTimeString()}</p>
            ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ""}
          `,
        });

        await transporter.sendMail({
          from: `"LashUpAndMore" <${process.env.EMAIL_USER}>`,
          to: booking.user.email,
          subject: "Booking Confirmation",
          html: `
            <h3>Thank you for your booking, ${booking.user.name}!</h3>
            <p>Your booking for <strong>${
              booking.service.name
            }</strong> has been received.</p>
            <p><strong>Date:</strong> ${bookingDateTime.toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${bookingDateTime.toLocaleTimeString()}</p>
            <p>We'll confirm your booking shortly. Thank you for choosing LashUpAndMore!</p>
          `,
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
    const bookings = await prisma.booking.findMany({
      where: { userId },
      include: { service: true },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL BOOKINGS (ADMIN)
export const getAllBookings = async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      include: { user: true, service: true },
      orderBy: { createdAt: "desc" },
    });
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
    if (!Object.values(BookingStatus).includes(status)) {
      return res.status(400).json({ message: "Invalid booking status" });
    }

    const booking = await prisma.booking.update({
      where: { id },
      data: { status },
      include: { user: true, service: true },
    });

    res.status(200).json({ message: "Booking status updated", booking });

    // Send notification email
    (async () => {
      try {
        const transporter = await createTransporter();
        await transporter.sendMail({
          from: `"LashUpAndMore" <${process.env.EMAIL_USER}>`,
          to: booking.user.email,
          subject: "Booking Status Updated",
          html: `
            <p>Hi ${booking.user.name},</p>
            <p>Your booking for <strong>${
              booking.service.name
            }</strong> is now <strong>${status}</strong>.</p>
            <p><strong>Date:</strong> ${booking.date.toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${booking.date.toLocaleTimeString()}</p>
          `,
        });
      } catch (emailErr) {
        console.error(
          "Email sending failed (booking status):",
          emailErr.message
        );
      }
    })();
  } catch (err) {
    console.error("Booking update error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// CANCEL BOOKING (USER)
export const cancelBooking = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { service: true, user: true },
    });

    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.userId !== userId)
      return res.status(403).json({ message: "Unauthorized" });
    if (booking.status === "CANCELLED")
      return res.status(400).json({ message: "Booking already cancelled" });

    // Check if booking can be cancelled (at least 24 hours before)
    const timeDiff = booking.date.getTime() - new Date().getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    if (hoursDiff < 24) {
      return res.status(400).json({
        message: "Booking can only be cancelled at least 24 hours in advance",
      });
    }

    const cancelledBooking = await prisma.booking.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: { service: true, user: true },
    });

    // Send cancellation emails
    (async () => {
      try {
        const transporter = await createTransporter();

        await transporter.sendMail({
          from: `"LashUpAndMore" <${process.env.EMAIL_USER}>`,
          to: cancelledBooking.user.email,
          subject: "Booking Cancelled",
          html: `
            <p>Hi ${cancelledBooking.user.name},</p>
            <p>Your booking for <strong>${
              cancelledBooking.service.name
            }</strong> has been cancelled successfully.</p>
            <p><strong>Date:</strong> ${cancelledBooking.date.toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${cancelledBooking.date.toLocaleTimeString()}</p>
          `,
        });

        await transporter.sendMail({
          from: `"LashUpAndMore" <${process.env.EMAIL_USER}>`,
          to: process.env.ADMIN_EMAIL,
          subject: "Booking Cancelled by Client",
          html: `
            <h3>Booking Cancellation</h3>
            <p><strong>Client:</strong> ${cancelledBooking.user.name} (${
            cancelledBooking.user.email
          })</p>
            <p><strong>Service:</strong> ${cancelledBooking.service.name}</p>
            <p><strong>Date:</strong> ${cancelledBooking.date.toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${cancelledBooking.date.toLocaleTimeString()}</p>
          `,
        });
      } catch (emailErr) {
        console.error(
          "Email sending failed (cancel booking):",
          emailErr.message
        );
      }
    })();

    res
      .status(200)
      .json({
        message: "Booking cancelled successfully",
        booking: cancelledBooking,
      });
  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
