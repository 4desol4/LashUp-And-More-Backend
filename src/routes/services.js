import express from "express";
import {
  createService,
  getAllServices,
  getService,
  updateService,
  deleteService,
} from "../controllers/serviceController.js";
import { protect, adminOnly } from "../middleware/auth.js";

const router = express.Router();

// Public routes
router.get("/", getAllServices);
router.get("/:id", getService);

// Admin routes
router.post("/", protect, adminOnly, createService);
router.put("/:id", protect, adminOnly, updateService);
router.delete("/:id", protect, adminOnly, deleteService);

export default router;