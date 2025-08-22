import prisma from "../utils/prisma.js";

// ADD GALLERY ITEM (Admin)
export const addGalleryItem = async (req, res) => {
  try {
    const { type, url } = req.body;

    const item = await prisma.galleryItem.create({
      data: { type, url },
    });

    res.status(201).json({ message: "Gallery item added", item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL GALLERY ITEMS
export const getGalleryItems = async (req, res) => {
  try {
    const items = await prisma.galleryItem.findMany();
    res.status(200).json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE GALLERY ITEM (Admin)
export const deleteGalleryItem = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.galleryItem.delete({ where: { id } });
    res.status(200).json({ message: "Gallery item deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
