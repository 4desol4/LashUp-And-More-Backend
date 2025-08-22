import express from "express";
import {
  addGalleryItem,
  getGalleryItems,
  deleteGalleryItem,
} from "../controllers/galleryController.js";
import { protect, adminOnly } from "../middleware/auth.js";

const router = express.Router();

// Public
router.get("/", getGalleryItems);

// Admin
router.post("/", protect, adminOnly, addGalleryItem);
router.delete("/:id", protect, adminOnly, deleteGalleryItem);

export default router;
