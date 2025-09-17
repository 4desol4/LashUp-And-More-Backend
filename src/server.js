import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import authRoutes from "./routes/auth.js";
import bookingRoutes from "./routes/bookings.js";
import productRoutes from "./routes/products.js";
import galleryRoutes from "./routes/gallery.js";
import productOrderRoutes from "./routes/productOrders.js";
import serviceRoutes from "./routes/services.js";
dotenv.config();

const app = express();
const prisma = new PrismaClient();

const allowed = [
  "http://localhost:3000",
  "https://lash-up-and-more-frontend.vercel.app/",
];

const corsOptions = {
  origin(origin, cb) {
    if (!origin || origin.endsWith(".vercel.app") || allowed.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));
// Routes
app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/products", productRoutes);
app.use("/api/gallery", galleryRoutes);
app.use("/api/orders", productOrderRoutes);
app.use("/api/services", serviceRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("LashUp And More Backend is running");
});

// Handle 404 for undefined routes
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Gracefully shutdown Prisma client on exit
process.on("SIGINT", async () => {
  console.log("\nShutting down server...");
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

process.on("SIGTERM", async () => {
  console.log("\nServer terminated");
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

// Optional: catch unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
