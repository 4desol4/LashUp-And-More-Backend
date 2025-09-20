import prisma from "../utils/prisma.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// REGISTER
export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: "user" },
    });

    res.status(201).json({ message: "User registered successfully", user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// LOGIN
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET CURRENT USER PROFILE
export const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ user });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, email } = req.body;

    // Validation
    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    if (!email.includes("@")) {
      return res.status(400).json({ message: "Please provide a valid email" });
    }

    if (name.trim().length < 2) {
      return res
        .status(400)
        .json({ message: "Name must be at least 2 characters" });
    }

    // Check if email is already taken by another user
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser && existingUser.id !== userId) {
      return res.status(400).json({ message: "Email is already taken" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name.trim(),
        email: email.toLowerCase(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const { role } = req.body;
    const currentUserId = req.user.userId;

    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
    });

    if (!currentUser || currentUser.role.toLowerCase() !== "admin") {
      return res
        .status(403)
        .json({ message: "Access denied. Admin required." });
    }

    if (currentUserId === targetUserId) {
      return res.status(400).json({ message: "Cannot change your own role" });
    }

    const validRoles = ["user", "admin"];
    if (!validRoles.includes(role.toLowerCase())) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: role.toLowerCase() },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    res
      .status(200)
      .json({ message: "User role updated successfully", user: updatedUser });
  } catch (err) {
    console.error("Update user role error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// CHANGE PASSWORD
export const changePassword = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters long",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "New password must be different from current password",
      });
    }

    // Get current user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    res.status(200).json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE ACCOUNT
export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { password } = req.body;

    if (!password) {
      return res
        .status(400)
        .json({ message: "Password is required to delete account" });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    // Check for active bookings/orders (optional safety check)
    const activeBookings = await prisma.booking.count({
      where: {
        userId,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    });

    const activeOrders = await prisma.productOrder.count({
      where: {
        userId,
        status: { in: ["PENDING", "CONFIRMED", "SHIPPED"] },
      },
    });

    if (activeBookings > 0 || activeOrders > 0) {
      return res.status(400).json({
        message:
          "Cannot delete account with active bookings or orders. Please cancel or complete them first.",
      });
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    res.status(200).json({ message: "Account deleted successfully" });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
export const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(users);
  } catch (err) {
    console.error("Get all users error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// DELETE USER (Admin only)
export const deleteUser = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = req.user.userId;

    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
    });

    if (!currentUser || currentUser.role.toLowerCase() !== "admin") {
      return res
        .status(403)
        .json({ message: "Access denied. Admin required." });
    }

    if (currentUserId === targetUserId) {
      return res
        .status(400)
        .json({ message: "You cannot delete your own account" });
    }

    // Optional: prevent deletion if active orders
    const activeOrders = await prisma.productOrder.count({
      where: {
        userId: targetUserId,
        status: { in: ["PENDING", "CONFIRMED", "SHIPPED"] },
      },
    });
    if (activeOrders > 0) {
      return res
        .status(400)
        .json({ message: "Cannot delete user with active orders" });
    }

    await prisma.user.delete({ where: { id: targetUserId } });

    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
export const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        orders: {   
          select: {
            id: true,
            paymentReference: true,
            totalAmount: true,
            status: true,
            paymentStatus: true,
            createdAt: true,
            product: { select: { name: true, price: true, imageUrl: true } }, 
          },
          orderBy: { createdAt: "desc" },
        },
        bookings: {
          select: {
            id: true,
            service: { select: { name: true } },
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user);
  } catch (err) {
    console.error("Get user details error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
