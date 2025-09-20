import express from "express";
import {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
  updateUserRole,
  getAllUsers,
  deleteUser,
  getUserDetails
} from "../controllers/authController.js";
import { protect, adminOnly } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);
router.put("/change-password", protect, changePassword);
router.delete("/account", protect, deleteAccount);

// Admin routes
router.get("/admin/users", protect, adminOnly, getAllUsers);
router.put("/admin/user/:userId/role", protect, adminOnly, updateUserRole);
router.get("/users/:userId", protect, adminOnly, getUserDetails);
router.delete("/users/:userId", protect, adminOnly, deleteUser);

export default router;
