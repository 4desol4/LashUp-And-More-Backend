import express from "express";
import {
  createBooking,
  getUserBookings,
  getAllBookings,
  updateBookingStatus,
  cancelBooking,
} from "../controllers/bookingController.js";
import { protect, adminOnly } from "../middleware/auth.js";

const router = express.Router();

// User routes
router.post("/", protect, createBooking);
router.get("/me", protect, getUserBookings);
router.put("/:id/cancel", protect, cancelBooking);

// Admin routes
router.get("/", protect, adminOnly, getAllBookings);
router.put("/:id/status", protect, adminOnly, updateBookingStatus);

export default router;
