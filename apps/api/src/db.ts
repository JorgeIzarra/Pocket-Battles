import mongoose from 'mongoose';

const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://localhost:27017/pocket_battles';

export async function connectDB(): Promise<void> {
  await mongoose.connect(MONGO_URL);
  console.log('MongoDB connected:', MONGO_URL);
}
