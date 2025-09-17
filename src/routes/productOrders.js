import express from "express";
import {
  getUserOrders,
  getAllOrders,
  updateOrderStatus,
  initializePayment,
  verifyPayment,
} from "../controllers/productOrderController.js";
import { protect, adminOnly } from "../middleware/auth.js";

const router = express.Router();

// Payment routes
router.post("/payment/initialize", protect, initializePayment);
router.get("/payment/verify/:reference", verifyPayment);

// Users
router.get("/me", protect, getUserOrders);

// Admin
router.get("/", protect, adminOnly, getAllOrders);
router.put("/:id/status", protect, adminOnly, updateOrderStatus);

export default router;
