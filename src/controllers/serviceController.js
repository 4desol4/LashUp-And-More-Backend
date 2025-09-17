import prisma from "../utils/prisma.js";

// CREATE SERVICE (Admin)
export const createService = async (req, res) => {
  try {
    const { name, description, price, imageUrl, duration, features } = req.body;

    const service = await prisma.service.create({
      data: { 
        name, 
        description, 
        price: parseFloat(price), 
        imageUrl, 
        duration: parseFloat(duration),
        features: Array.isArray(features) ? features : [features] 
      },
    });

    res.status(201).json({ message: "Service created", service });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL SERVICES
export const getAllServices = async (req, res) => {
  try {
    const services = await prisma.service.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.status(200).json(services);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET SINGLE SERVICE
export const getService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await prisma.service.findUnique({ where: { id } });
    if (!service) return res.status(404).json({ message: "Service not found" });
    res.status(200).json(service);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE SERVICE (Admin)
export const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, imageUrl, duration, features } = req.body;

    const service = await prisma.service.update({
      where: { id },
      data: { 
        name, 
        description, 
        price: parseFloat(price), 
        imageUrl, 
        duration: parseFloat(duration),
        features: Array.isArray(features) ? features : [features]
      },
    });

    res.status(200).json({ message: "Service updated", service });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE SERVICE (Admin)
export const deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.service.delete({ where: { id } });
    res.status(200).json({ message: "Service deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};