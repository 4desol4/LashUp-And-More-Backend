import express from "express";
import {
  createOrder,
  getUserOrders,
  getAllOrders,
  updateOrderStatus,
  cancelOrder  
} from "../controllers/productOrderController.js";
import { protect, adminOnly } from "../middleware/auth.js";

const router = express.Router();

// Users
router.post("/", protect, createOrder);
router.get("/me", protect, getUserOrders);
router.put("/:id/cancel", protect, cancelOrder);

// Admin
router.get("/", protect, adminOnly, getAllOrders);
router.put("/:id/status", protect, adminOnly, updateOrderStatus);

export default router;
