import express from "express";
import {
  createBooking,
  getUserBookings,
  cancelBooking,          
  getAllBookings,
  updateBookingStatus,
} from "../controllers/bookingController.js";
import { protect, adminOnly } from "../middleware/auth.js";

const router = express.Router();

// Users
router.post("/", protect, createBooking);
router.get("/me", protect, getUserBookings);
router.put("/:id/cancel", protect, cancelBooking); 

// Admin
router.get("/", protect, adminOnly, getAllBookings);
router.put("/:id/status", protect, adminOnly, updateBookingStatus);

export default router;
