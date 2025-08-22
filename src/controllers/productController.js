import prisma from "../utils/prisma.js";

// CREATE PRODUCT (Admin)
export const createProduct = async (req, res) => {
  try {
    const { name, description, price, imageUrl } = req.body;

    const product = await prisma.product.create({
      data: { name, description, price: parseFloat(price), imageUrl },
    });

    res.status(201).json({ message: "Product created", product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL PRODUCTS
export const getAllProducts = async (req, res) => {
  try {
    const products = await prisma.product.findMany();
    res.status(200).json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET SINGLE PRODUCT
export const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.status(200).json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE PRODUCT (Admin)
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, imageUrl } = req.body;

    const product = await prisma.product.update({
      where: { id },
      data: { name, description, price: parseFloat(price), imageUrl },
    });

    res.status(200).json({ message: "Product updated", product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE PRODUCT (Admin)
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Soft delete: mark as inactive instead of removing
    const product = await prisma.product.update({
      where: { id },
      data: { isActive: false }, // requires adding isActive: Boolean in Product model
    });

    res.status(200).json({ message: "Product deactivated", product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
